import fs from "node:fs";
import path from "node:path";
import { sqliteStorageAdapter } from "@/lib/storage/sqlite";
import type { PBDistanceKey, Workout } from "@/lib/types";

export const PB_DISTANCES: Array<{ key: PBDistanceKey; label: string; km: number }> = [
  { key: "1k", label: '1 ק"מ', km: 1 },
  { key: "3k", label: '3 ק"מ', km: 3 },
  { key: "5k", label: '5 ק"מ', km: 5 },
  { key: "10k", label: '10 ק"מ', km: 10 },
  { key: "15k", label: '15 ק"מ', km: 15 },
  { key: "half", label: "חצי מרתון", km: 21.0975 },
  { key: "25k", label: '25 ק"מ', km: 25 },
  { key: "30k", label: '30 ק"מ', km: 30 }
];

function wholeWorkoutToleranceKm(targetKm: number) {
  if (targetKm <= 3) return 0.1;
  if (targetKm <= 5) return 0.12;
  if (targetKm <= 10) return 0.18;
  if (targetKm <= 16) return 0.28;
  if (targetKm <= 25) return 0.4;
  return 0.6;
}

function isWholeWorkoutMatch(totalKm: number, targetKm: number) {
  return Math.abs(totalKm - targetKm) <= wholeWorkoutToleranceKm(targetKm);
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

type TrackPoint = { sec: number; distM: number };

function parseTcxPoints(raw: string): TrackPoint[] {
  const blocks = raw.match(/<Trackpoint>[\s\S]*?<\/Trackpoint>/g) ?? [];
  if (!blocks.length) return [];

  const out: TrackPoint[] = [];
  let baseMs: number | null = null;

  for (const block of blocks) {
    const timeRaw = block.match(/<Time>([^<]+)<\/Time>/)?.[1];
    const distRaw = block.match(/<DistanceMeters>([^<]+)<\/DistanceMeters>/)?.[1];
    const dist = Number(distRaw ?? "");
    const tMs = Date.parse(timeRaw ?? "");
    if (!Number.isFinite(dist) || !Number.isFinite(tMs)) continue;

    if (baseMs == null) baseMs = tMs;
    const sec = (tMs - baseMs) / 1000;
    if (sec < 0) continue;
    out.push({ sec, distM: dist });
  }

  return out.sort((a, b) => a.sec - b.sec);
}

function parseGpxPoints(raw: string): TrackPoint[] {
  const blocks = raw.match(/<trkpt[^>]*>[\s\S]*?<\/trkpt>/g) ?? [];
  if (blocks.length < 2) return [];

  const tmp: Array<{ lat: number; lon: number; tMs: number | null }> = [];
  for (const block of blocks) {
    const lat = Number(block.match(/lat="([^"]+)"/)?.[1] ?? "");
    const lon = Number(block.match(/lon="([^"]+)"/)?.[1] ?? "");
    const timeRaw = block.match(/<time>([^<]+)<\/time>/)?.[1] ?? "";
    const tMs = Date.parse(timeRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    tmp.push({ lat, lon, tMs: Number.isFinite(tMs) ? tMs : null });
  }

  if (tmp.length < 2) return [];

  let dist = 0;
  let sec = 0;
  const out: TrackPoint[] = [{ sec: 0, distM: 0 }];
  for (let i = 1; i < tmp.length; i += 1) {
    const prev = tmp[i - 1];
    const cur = tmp[i];
    dist += haversineMeters(prev.lat, prev.lon, cur.lat, cur.lon);
    if (prev.tMs != null && cur.tMs != null && cur.tMs >= prev.tMs) {
      sec += (cur.tMs - prev.tMs) / 1000;
    }
    out.push({ sec, distM: dist });
  }

  return out;
}

function parseTrackPointsFromWorkout(workout: Workout): TrackPoint[] {
  const file = workout.rawFilePath;
  if (!file || !fs.existsSync(file)) return [];

  const ext = path.extname(file).toLowerCase();
  const raw = fs.readFileSync(file, "utf8");
  if (ext === ".tcx") return parseTcxPoints(raw);
  if (ext === ".gpx") return parseGpxPoints(raw);
  return [];
}

function interpolateSecAtDistance(p1: TrackPoint, p2: TrackPoint, targetDist: number) {
  const spanD = p2.distM - p1.distM;
  if (spanD <= 0) return p2.sec;
  const ratio = (targetDist - p1.distM) / spanD;
  return p1.sec + ratio * (p2.sec - p1.sec);
}

function rollingBest(points: TrackPoint[], targetM: number) {
  if (points.length < 2) return null;

  let best: { timeSec: number; startSec: number; endSec: number } | null = null;
  let j = 1;

  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i];
    const goalDist = start.distM + targetM;

    while (j < points.length && points[j].distM < goalDist) {
      j += 1;
    }
    if (j >= points.length) break;

    const prev = points[j - 1];
    const end = points[j];
    const endSec = interpolateSecAtDistance(prev, end, goalDist);
    const timeSec = endSec - start.sec;
    if (timeSec <= 0) continue;

    const paceMinPerKm = (timeSec / 60) / (targetM / 1000);
    if (paceMinPerKm < 2.5 || paceMinPerKm > 20) continue;

    if (!best || timeSec < best.timeSec) {
      best = { timeSec, startSec: start.sec, endSec };
    }
  }

  return best;
}

export function recomputeBestEffortsAll() {
  const workouts = sqliteStorageAdapter.listWorkouts(100000).filter((w) => w.sport === "run" && (w.distanceM ?? 0) > 0 && w.durationSec > 0);

  for (const workout of workouts) {
    sqliteStorageAdapter.clearBestEffortsForWorkout(workout.id);

    const totalKm = (workout.distanceM ?? 0) / 1000;
    const wholePace = workout.durationSec / 60 / Math.max(0.001, totalKm);
    const points = parseTrackPointsFromWorkout(workout);

    const efforts: Array<{
      distanceKey: string;
      timeSec: number;
      source: string;
      segmentStartSec: number | null;
      segmentEndSec: number | null;
    }> = [];

    for (const target of PB_DISTANCES) {
      if (isWholeWorkoutMatch(totalKm, target.km)) {
        const est = wholePace * target.km * 60;
        efforts.push({
          distanceKey: target.key,
          timeSec: est,
          source: "whole_workout",
          segmentStartSec: null,
          segmentEndSec: null
        });
      }

      const roll = rollingBest(points, target.km * 1000);
      if (roll) {
        efforts.push({
          distanceKey: target.key,
          timeSec: roll.timeSec,
          source: "rolling_segment",
          segmentStartSec: Math.round(roll.startSec),
          segmentEndSec: Math.round(roll.endSec)
        });
      }
    }

    sqliteStorageAdapter.insertBestEfforts(workout.id, efforts);
  }
}
