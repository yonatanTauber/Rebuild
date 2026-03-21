import fs from "node:fs";
import path from "node:path";
import type { Workout } from "@/lib/types";

const DEFAULT_HEALTHFIT_DIR = "/Users/Y.T.p/Library/Mobile Documents/iCloud~com~altifondo~HealthFit/Documents";

export type RoutePoint = { lat: number; lon: number };
export type RouteSegment = RoutePoint[];

export type WorkoutTrackPoint = {
  lat: number;
  lon: number;
  sec: number;
  distM: number;
  hr: number | null;
  segmentIndex: number;
};

export type WorkoutKmSplit = {
  km: number;
  splitSec: number;
  cumulativeSec: number;
  paceMinPerKm: number;
  avgHr: number | null;
};

export type WorkoutHeartRateSample = {
  sec: number;
  bpm: number;
};

export type WorkoutDetailData = {
  routePoints: RoutePoint[];
  routeSegments: RouteSegment[];
  trackPoints: WorkoutTrackPoint[];
  heartRateSamples: WorkoutHeartRateSample[];
  splits: WorkoutKmSplit[];
  avgHrFromTrack: number | null;
  maxHrFromTrack: number | null;
  movingDurationSec: number | null;
  pauseDurationSec: number | null;
  distanceRawKm: number | null;
  distanceOfficialKm: number | null;
};

function getImportDir() {
  return process.env.REBUILD_IMPORT_DIR?.trim() || process.env.NEXT_PUBLIC_REBUILD_IMPORT_DIR?.trim() || DEFAULT_HEALTHFIT_DIR;
}

function extractFilename(rawFileHash: string) {
  const idx = rawFileHash.indexOf(":");
  return idx > 0 ? rawFileHash.slice(0, idx) : rawFileHash;
}

function findCandidateGpx(workout: Workout) {
  if (workout.rawFilePath?.toLowerCase().endsWith(".gpx") && fs.existsSync(workout.rawFilePath)) {
    return workout.rawFilePath;
  }

  const importDir = getImportDir();
  const filename = extractFilename(workout.rawFileHash);

  if (filename.endsWith(".gpx")) {
    const directPath = path.join(importDir, filename);
    if (fs.existsSync(directPath)) return directPath;
  }

  const gpxFilename = filename.replace(/\.fit$/i, ".gpx");
  const gpxPath = path.join(importDir, gpxFilename);
  if (fs.existsSync(gpxPath)) return gpxPath;

  return null;
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

function extractHr(block: string) {
  const match = block.match(/<(?:[a-z0-9]+:)?hr>([^<]+)<\/(?:[a-z0-9]+:)?hr>/i);
  const value = Number(match?.[1] ?? "");
  return Number.isFinite(value) ? Math.round(value) : null;
}

type RawTrackPoint = {
  lat: number;
  lon: number;
  tMs: number;
  hr: number | null;
};

function parseGpxRawTrackPoints(raw: string): RawTrackPoint[] {
  const blocks = raw.match(/<trkpt[^>]*>[\s\S]*?<\/trkpt>/g) ?? [];
  if (blocks.length < 2) {
    return [];
  }

  const parsed = blocks
    .map((block) => {
      const lat = Number(block.match(/lat="([^"]+)"/)?.[1] ?? "");
      const lon = Number(block.match(/lon="([^"]+)"/)?.[1] ?? "");
      const timeRaw = block.match(/<time>([^<]+)<\/time>/)?.[1] ?? "";
      const tMs = Date.parse(timeRaw);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(tMs)) {
        return null;
      }
      if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        return null;
      }
      return {
        lat,
        lon,
        tMs,
        hr: extractHr(block)
      };
    })
    .filter((point): point is { lat: number; lon: number; tMs: number; hr: number | null } => point != null);

  return parsed.sort((a, b) => a.tMs - b.tMs);
}

function speedThresholdMps(sport: Workout["sport"]) {
  if (sport === "run") {
    return 7.5;
  }
  if (sport === "swim") {
    return 3.5;
  }
  return 25;
}

function sanitizeTrackPoints(rawPoints: RawTrackPoint[], sport: Workout["sport"]): WorkoutTrackPoint[] {
  if (rawPoints.length < 2) {
    return [];
  }

  const maxSpeed = speedThresholdMps(sport);
  const minJumpMeters = sport === "run" ? 120 : 250;
  const maxGapForSameSegmentSec = 240;

  const accepted: Array<RawTrackPoint & { segmentIndex: number }> = [];
  let segmentIndex = 0;
  let prev = rawPoints[0];
  accepted.push({ ...prev, segmentIndex });

  for (let i = 1; i < rawPoints.length; i += 1) {
    const candidate = rawPoints[i];
    const dt = (candidate.tMs - prev.tMs) / 1000;
    if (!Number.isFinite(dt) || dt <= 0) {
      continue;
    }
    const dist = haversineMeters(prev.lat, prev.lon, candidate.lat, candidate.lon);
    const speed = dist / dt;
    const jumpOutlier = dist >= minJumpMeters && speed > maxSpeed;
    if (jumpOutlier) {
      continue;
    }
    if (dt > maxGapForSameSegmentSec) {
      segmentIndex += 1;
    }
    accepted.push({ ...candidate, segmentIndex });
    prev = candidate;
  }

  if (accepted.length < 2) {
    return [];
  }

  const baseMs = accepted[0].tMs;
  let distM = 0;
  return accepted.map((point, index) => {
    if (index > 0) {
      const previous = accepted[index - 1];
      distM += haversineMeters(previous.lat, previous.lon, point.lat, point.lon);
    }
    return {
      lat: point.lat,
      lon: point.lon,
      sec: Math.max(0, (point.tMs - baseMs) / 1000),
      distM,
      hr: point.hr,
      segmentIndex: point.segmentIndex
    };
  });
}

function downsample<T>(points: T[], maxPoints: number) {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  return points.filter((_, index) => index % step === 0 || index === points.length - 1);
}

function interpolateNumber(a: number, b: number, ratio: number) {
  return a + (b - a) * ratio;
}

function pointAtDistance(points: WorkoutTrackPoint[], targetDistM: number) {
  if (!points.length) return null;
  if (targetDistM <= 0) return { sec: points[0].sec, hr: points[0].hr };
  const last = points[points.length - 1];
  if (targetDistM >= last.distM) return { sec: last.sec, hr: last.hr };

  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1];
    const curr = points[index];
    if (curr.distM < targetDistM) continue;
    const spanDist = curr.distM - prev.distM;
    if (spanDist <= 0) {
      return { sec: curr.sec, hr: curr.hr };
    }
    const ratio = (targetDistM - prev.distM) / spanDist;
    const sec = interpolateNumber(prev.sec, curr.sec, ratio);
    const hr =
      prev.hr != null && curr.hr != null ? interpolateNumber(prev.hr, curr.hr, ratio) : (curr.hr ?? prev.hr ?? null);
    return { sec, hr: hr == null ? null : Math.round(hr) };
  }

  return { sec: last.sec, hr: last.hr };
}

function buildTimelineByMovement(trackPoints: WorkoutTrackPoint[], sport: Workout["sport"], useMoving: boolean) {
  if (!trackPoints.length) return [] as number[];
  if (!useMoving) {
    return trackPoints.map((point) => point.sec);
  }

  const maxSpeed = speedThresholdMps(sport);
  const minMovingSpeed = 0.45;
  const timeline: number[] = [0];
  let movingSec = 0;

  for (let i = 1; i < trackPoints.length; i += 1) {
    const prev = trackPoints[i - 1];
    const curr = trackPoints[i];
    const dt = curr.sec - prev.sec;
    if (!Number.isFinite(dt) || dt <= 0 || dt > 180) {
      timeline.push(movingSec);
      continue;
    }
    const dist = curr.distM - prev.distM;
    if (!Number.isFinite(dist) || dist < 0) {
      timeline.push(movingSec);
      continue;
    }
    const speed = dist / dt;
    if (speed >= minMovingSpeed && speed <= maxSpeed) {
      movingSec += dt;
    }
    timeline.push(movingSec);
  }

  return timeline;
}

function pointAtDistanceWithTimeline(points: WorkoutTrackPoint[], timelineSec: number[], targetDistM: number) {
  if (!points.length) return null;
  if (timelineSec.length !== points.length) return null;
  if (targetDistM <= 0) return { sec: timelineSec[0], hr: points[0].hr };
  const last = points[points.length - 1];
  const lastTimeline = timelineSec[timelineSec.length - 1];
  if (targetDistM >= last.distM) return { sec: lastTimeline, hr: last.hr };

  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1];
    const curr = points[index];
    if (curr.distM < targetDistM) continue;
    const spanDist = curr.distM - prev.distM;
    if (spanDist <= 0) {
      return { sec: timelineSec[index], hr: curr.hr };
    }
    const ratio = (targetDistM - prev.distM) / spanDist;
    const sec = interpolateNumber(timelineSec[index - 1], timelineSec[index], ratio);
    const hr =
      prev.hr != null && curr.hr != null ? interpolateNumber(prev.hr, curr.hr, ratio) : (curr.hr ?? prev.hr ?? null);
    return { sec, hr: hr == null ? null : Math.round(hr) };
  }

  return { sec: lastTimeline, hr: last.hr };
}

function computeHrStats(trackPoints: WorkoutTrackPoint[]) {
  const hrValues = trackPoints
    .map((point) => point.hr)
    .filter((value): value is number => value != null && Number.isFinite(value) && value > 0);
  if (!hrValues.length) {
    return { avg: null, max: null } as const;
  }
  const avg = Math.round(hrValues.reduce((sum, value) => sum + value, 0) / hrValues.length);
  const max = Math.round(Math.max(...hrValues));
  return { avg, max } as const;
}

export function getWorkoutTrackPoints(workout: Workout): WorkoutTrackPoint[] {
  const gpxPath = findCandidateGpx(workout);
  if (!gpxPath) {
    return [];
  }

  try {
    const raw = fs.readFileSync(gpxPath, "utf8");
    const rawPoints = parseGpxRawTrackPoints(raw);
    return sanitizeTrackPoints(rawPoints, workout.sport);
  } catch {
    return [];
  }
}

export function getWorkoutRoutePoints(workout: Workout): RoutePoint[] {
  return downsample(
    getWorkoutTrackPoints(workout).map((point) => ({ lat: point.lat, lon: point.lon })),
    500
  );
}

function buildRouteSegments(trackPoints: WorkoutTrackPoint[]): RouteSegment[] {
  if (trackPoints.length < 2) {
    return [];
  }

  const grouped = new Map<number, WorkoutTrackPoint[]>();
  for (const point of trackPoints) {
    const list = grouped.get(point.segmentIndex) ?? [];
    list.push(point);
    grouped.set(point.segmentIndex, list);
  }

  const sourceSegments = Array.from(grouped.values()).filter((segment) => segment.length >= 2);
  if (!sourceSegments.length) {
    return [];
  }

  const totalPoints = sourceSegments.reduce((sum, segment) => sum + segment.length, 0);
  const maxPoints = 700;

  return sourceSegments
    .map((segment) => {
      const points = segment.map((point) => ({ lat: point.lat, lon: point.lon }));
      const maxForSegment = Math.max(20, Math.round((segment.length / totalPoints) * maxPoints));
      return downsample(points, maxForSegment);
    })
    .filter((segment) => segment.length >= 2);
}

export function getWorkoutHeartRateSamples(workout: Workout): WorkoutHeartRateSample[] {
  const samples = getWorkoutTrackPoints(workout)
    .filter((point) => point.hr != null)
    .map((point) => ({ sec: point.sec, bpm: point.hr as number }));
  return downsample(samples, 180);
}

export function getWorkoutKmSplits(workout: Workout): WorkoutKmSplit[] {
  const points = getWorkoutTrackPoints(workout);
  if (points.length < 2) {
    return [];
  }

  const timelineSec = buildTimelineByMovement(points, workout.sport, workout.sport === "run");

  const totalFullKm = Math.floor((points[points.length - 1].distM ?? 0) / 1000);
  if (totalFullKm <= 0) {
    return [];
  }

  const splits: WorkoutKmSplit[] = [];
  let prevSec = 0;

  for (let km = 1; km <= totalFullKm; km += 1) {
    const end = pointAtDistanceWithTimeline(points, timelineSec, km * 1000);
    if (!end) continue;
    const splitSec = end.sec - prevSec;
    if (splitSec <= 0) continue;
    const hrPoints = points.filter((point) => point.hr != null && point.distM >= (km - 1) * 1000 && point.distM <= km * 1000);
    const avgHr = hrPoints.length
      ? Math.round(hrPoints.reduce((sum, point) => sum + (point.hr as number), 0) / hrPoints.length)
      : end.hr;
    splits.push({
      km,
      splitSec: Math.round(splitSec),
      cumulativeSec: Math.round(end.sec),
      paceMinPerKm: splitSec / 60,
      avgHr: avgHr ?? null
    });
    prevSec = end.sec;
  }

  return splits;
}

function computeMovingDurationSec(trackPoints: WorkoutTrackPoint[], sport: Workout["sport"]) {
  if (trackPoints.length < 2) {
    return null;
  }
  const maxSpeed = speedThresholdMps(sport);
  const minMovingSpeed = 0.45; // ~1.6km/h
  let movingSec = 0;

  for (let i = 1; i < trackPoints.length; i += 1) {
    const prev = trackPoints[i - 1];
    const curr = trackPoints[i];
    const dt = curr.sec - prev.sec;
    if (!Number.isFinite(dt) || dt <= 0) {
      continue;
    }
    if (dt > 180) {
      continue;
    }
    const dist = curr.distM - prev.distM;
    if (!Number.isFinite(dist) || dist < 0) {
      continue;
    }
    const speed = dist / dt;
    if (speed < minMovingSpeed || speed > maxSpeed) {
      continue;
    }
    movingSec += dt;
  }

  if (movingSec <= 0) {
    return null;
  }
  return Math.round(movingSec);
}

function normalizeOfficialDistanceKm(rawDistanceKm: number | null, sport: Workout["sport"]) {
  if (sport !== "run" || rawDistanceKm == null || !Number.isFinite(rawDistanceKm) || rawDistanceKm <= 0) {
    return null;
  }
  const official = [1, 3, 5, 10, 15, 16, 21.1, 25, 30, 42.195];
  let best: number | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;

  for (const target of official) {
    const tolerance =
      target <= 5 ? 0.12
      : target <= 16 ? 0.28
      : target <= 30 ? 0.4
      : 0.6;
    const diff = Math.abs(rawDistanceKm - target);
    if (diff <= tolerance && diff < bestDiff) {
      best = target;
      bestDiff = diff;
    }
  }

  if (best == null) {
    return null;
  }

  return Math.round(best * 100) / 100;
}

export function getWorkoutDetailData(workout: Workout): WorkoutDetailData {
  const trackPoints = getWorkoutTrackPoints(workout);
  const timelineSec = buildTimelineByMovement(trackPoints, workout.sport, workout.sport === "run");
  const routeSegments = buildRouteSegments(trackPoints);
  const routePoints = downsample(
    trackPoints.map((point) => ({ lat: point.lat, lon: point.lon })),
    500
  );
  const heartRateSamples = downsample(
    trackPoints
      .filter((point) => point.hr != null)
      .map((point) => ({ sec: point.sec, bpm: point.hr as number })),
    180
  );

  const totalFullKm = Math.floor((trackPoints[trackPoints.length - 1]?.distM ?? 0) / 1000);
  const splits: WorkoutKmSplit[] = [];
  let prevSec = 0;

  for (let km = 1; km <= totalFullKm; km += 1) {
    const end = pointAtDistanceWithTimeline(trackPoints, timelineSec, km * 1000);
    if (!end) continue;
    const splitSec = end.sec - prevSec;
    if (splitSec <= 0) continue;
    const hrPoints = trackPoints.filter(
      (point) => point.hr != null && point.distM >= (km - 1) * 1000 && point.distM <= km * 1000
    );
    const avgHr = hrPoints.length
      ? Math.round(hrPoints.reduce((sum, point) => sum + (point.hr as number), 0) / hrPoints.length)
      : end.hr;
    splits.push({
      km,
      splitSec: Math.round(splitSec),
      cumulativeSec: Math.round(end.sec),
      paceMinPerKm: splitSec / 60,
      avgHr: avgHr ?? null
    });
    prevSec = end.sec;
  }

  const movingDurationSec =
    workout.sport === "run"
      ? timelineSec.length
        ? Math.round(timelineSec[timelineSec.length - 1])
        : null
      : computeMovingDurationSec(trackPoints, workout.sport);
  const pauseDurationSec =
    movingDurationSec != null ? Math.max(0, Math.round(workout.durationSec - movingDurationSec)) : null;
  const distanceRawKm =
    workout.distanceM != null && Number.isFinite(workout.distanceM)
      ? Math.round((workout.distanceM / 1000) * 100) / 100
      : trackPoints.length > 1
        ? Math.round(((trackPoints[trackPoints.length - 1].distM ?? 0) / 1000) * 100) / 100
        : null;
  const distanceOfficialKm = normalizeOfficialDistanceKm(distanceRawKm, workout.sport);
  const hrStats = computeHrStats(trackPoints);

  return {
    routePoints,
    routeSegments,
    trackPoints,
    heartRateSamples,
    splits,
    avgHrFromTrack: hrStats.avg,
    maxHrFromTrack: hrStats.max,
    movingDurationSec,
    pauseDurationSec,
    distanceRawKm,
    distanceOfficialKm
  };
}

export function mapBounds(points: RoutePoint[]) {
  if (points.length === 0) return null;

  let minLat = points[0].lat;
  let maxLat = points[0].lat;
  let minLon = points[0].lon;
  let maxLon = points[0].lon;

  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLon = Math.min(minLon, p.lon);
    maxLon = Math.max(maxLon, p.lon);
  }

  return { minLat, maxLat, minLon, maxLon };
}
