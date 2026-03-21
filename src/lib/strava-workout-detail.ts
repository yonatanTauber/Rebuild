import type { Workout } from "@/lib/types";
import type {
  RoutePoint,
  RouteSegment,
  WorkoutHeartRateSample,
  WorkoutKmSplit,
  WorkoutTrackPoint,
  WorkoutDetailData
} from "@/lib/workout-detail";
import { mapBounds } from "@/lib/workout-detail";
import { getStravaActivityStreams, parseStravaActivityId, type StravaStreams } from "@/lib/strava-streams";

function speedThresholdMps(sport: Workout["sport"]) {
  if (sport === "run") return 7.5;
  if (sport === "swim") return 3.5;
  return 25;
}

function downsample<T>(points: T[], maxPoints: number) {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  return points.filter((_, index) => index % step === 0 || index === points.length - 1);
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

function buildTimelineByMovement(points: Array<{ sec: number; distM: number }>, sport: Workout["sport"]) {
  if (points.length < 2) return [] as number[];
  const maxSpeed = speedThresholdMps(sport);
  const minMovingSpeed = 0.45;
  const timeline: number[] = [0];
  let movingSec = 0;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
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

function pointAtDistanceWithTimeline(
  points: Array<{ sec: number; distM: number; hr: number | null }>,
  timelineSec: number[],
  targetDistM: number
) {
  if (points.length < 2 || timelineSec.length !== points.length) return null;
  const last = points[points.length - 1];
  const lastTimeline = timelineSec[timelineSec.length - 1];
  if (targetDistM <= 0) return { sec: timelineSec[0], hr: points[0].hr };
  if (targetDistM >= last.distM) return { sec: lastTimeline, hr: last.hr };

  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    if (curr.distM < targetDistM) continue;
    const span = curr.distM - prev.distM;
    if (!Number.isFinite(span) || span <= 0) return { sec: timelineSec[i], hr: curr.hr };
    const ratio = (targetDistM - prev.distM) / span;
    const sec = timelineSec[i - 1] + (timelineSec[i] - timelineSec[i - 1]) * ratio;
    const hr =
      prev.hr != null && curr.hr != null ? prev.hr + (curr.hr - prev.hr) * ratio : (curr.hr ?? prev.hr ?? null);
    return { sec, hr: hr == null ? null : Math.round(hr) };
  }
  return { sec: lastTimeline, hr: last.hr };
}

function normalizeOfficialDistanceKm(rawDistanceKm: number | null, sport: Workout["sport"]) {
  if (sport !== "run" || rawDistanceKm == null || !Number.isFinite(rawDistanceKm) || rawDistanceKm <= 0) return null;
  const official = [1, 3, 5, 10, 15, 16, 21.1, 25, 30, 42.195];
  let best: number | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const target of official) {
    const tolerance = target <= 5 ? 0.12 : target <= 16 ? 0.28 : target <= 30 ? 0.4 : 0.6;
    const diff = Math.abs(rawDistanceKm - target);
    if (diff <= tolerance && diff < bestDiff) {
      best = target;
      bestDiff = diff;
    }
  }
  return best == null ? null : Math.round(best * 100) / 100;
}

function buildRouteFromStreams(streams: StravaStreams, sport: Workout["sport"]): { routeSegments: RouteSegment[]; routePoints: RoutePoint[] } {
  const latlng = streams.latlng?.data;
  const time = streams.time?.data;
  if (!latlng || !time || latlng.length < 2 || time.length < 2) return { routeSegments: [], routePoints: [] };
  const n = Math.min(latlng.length, time.length);

  const maxSpeed = speedThresholdMps(sport);
  const minJumpMeters = sport === "run" ? 120 : 250;
  const maxGapSec = 240;

  const segments: RoutePoint[][] = [];
  let current: RoutePoint[] = [];
  let prevLat = latlng[0][0];
  let prevLon = latlng[0][1];
  let prevSec = time[0];
  current.push({ lat: prevLat, lon: prevLon });

  for (let i = 1; i < n; i += 1) {
    const [lat, lon] = latlng[i];
    const sec = time[i];
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(sec)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const dt = sec - prevSec;
    if (!Number.isFinite(dt) || dt <= 0) continue;
    if (dt > maxGapSec) {
      if (current.length >= 2) segments.push(current);
      current = [];
      current.push({ lat, lon });
      prevLat = lat;
      prevLon = lon;
      prevSec = sec;
      continue;
    }
    const dist = haversineMeters(prevLat, prevLon, lat, lon);
    const speed = dist / dt;
    const jumpOutlier = dist >= minJumpMeters && speed > maxSpeed;
    if (jumpOutlier) {
      continue;
    }
    current.push({ lat, lon });
    prevLat = lat;
    prevLon = lon;
    prevSec = sec;
  }
  if (current.length >= 2) segments.push(current);

  const filtered = segments.filter((s) => s.length >= 2);
  if (!filtered.length) return { routeSegments: [], routePoints: [] };

  const totalPoints = filtered.reduce((sum, seg) => sum + seg.length, 0);
  const maxPoints = 700;
  const routeSegments = filtered
    .map((seg) => {
      const maxForSeg = Math.max(20, Math.round((seg.length / totalPoints) * maxPoints));
      return downsample(seg, maxForSeg);
    })
    .filter((seg) => seg.length >= 2);

  const routePoints = downsample(routeSegments.flat(), 500);
  return { routeSegments, routePoints };
}

function buildDetailFromStreams(workout: Workout, streams: StravaStreams): WorkoutDetailData {
  const time = streams.time?.data ?? [];
  const distance = streams.distance?.data ?? [];
  const hr = streams.heartrate?.data ?? [];
  const n = Math.min(time.length, distance.length);
  const points = Array.from({ length: n }, (_, i) => ({
    sec: Number(time[i] ?? 0),
    distM: Number(distance[i] ?? 0),
    hr: hr[i] == null ? null : Number(hr[i])
  })).filter((p) => Number.isFinite(p.sec) && Number.isFinite(p.distM));

  const timeline = buildTimelineByMovement(points, workout.sport);
  const movingDurationSec = timeline.length ? Math.round(timeline[timeline.length - 1]) : null;
  const pauseDurationSec = movingDurationSec != null ? Math.max(0, Math.round(workout.durationSec - movingDurationSec)) : null;

  const lastDist = points.length ? points[points.length - 1].distM : 0;
  const distanceRawKm = lastDist > 0 ? Math.round((lastDist / 1000) * 100) / 100 : null;
  const distanceOfficialKm = normalizeOfficialDistanceKm(distanceRawKm, workout.sport);

  const hrValues = points.map((p) => p.hr).filter((v): v is number => v != null && Number.isFinite(v) && v > 0);
  const avgHrFromTrack = hrValues.length ? Math.round(hrValues.reduce((s, v) => s + v, 0) / hrValues.length) : null;
  const maxHrFromTrack = hrValues.length ? Math.round(Math.max(...hrValues)) : null;

  const totalFullKm = Math.floor(lastDist / 1000);
  const splits: WorkoutKmSplit[] = [];
  let prevSec = 0;
  for (let km = 1; km <= totalFullKm; km += 1) {
    const end = pointAtDistanceWithTimeline(points, timeline, km * 1000);
    if (!end) continue;
    const splitSec = end.sec - prevSec;
    if (splitSec <= 0) continue;
    splits.push({
      km,
      splitSec: Math.round(splitSec),
      cumulativeSec: Math.round(end.sec),
      paceMinPerKm: splitSec / 60,
      avgHr: end.hr
    });
    prevSec = end.sec;
  }

  const heartRateSamples: WorkoutHeartRateSample[] = downsample(
    points
      .filter((p) => p.hr != null && Number.isFinite(p.hr))
      .map((p) => ({ sec: Math.max(0, p.sec), bpm: Math.round(p.hr as number) })),
    180
  );

  const { routeSegments, routePoints } = buildRouteFromStreams(streams, workout.sport);
  const trackPoints: WorkoutTrackPoint[] = [];

  return {
    routePoints,
    routeSegments,
    trackPoints,
    heartRateSamples,
    splits,
    avgHrFromTrack,
    maxHrFromTrack,
    movingDurationSec,
    pauseDurationSec,
    distanceRawKm,
    distanceOfficialKm
  };
}

export async function getCloudWorkoutDetailData(workout: Workout): Promise<WorkoutDetailData> {
  const activityId = parseStravaActivityId(workout.id) ?? parseStravaActivityId(workout.rawFileHash);
  if (!activityId) {
    return {
      routePoints: [],
      routeSegments: [],
      trackPoints: [],
      heartRateSamples: [],
      splits: [],
      avgHrFromTrack: null,
      maxHrFromTrack: null,
      movingDurationSec: null,
      pauseDurationSec: null,
      distanceRawKm: workout.distanceM != null ? Math.round((workout.distanceM / 1000) * 100) / 100 : null,
      distanceOfficialKm: null
    };
  }
  const streams = await getStravaActivityStreams(activityId);
  if (!streams) {
    const distanceRawKm = workout.distanceM != null ? Math.round((workout.distanceM / 1000) * 100) / 100 : null;
    return {
      routePoints: [],
      routeSegments: [],
      trackPoints: [],
      heartRateSamples: [],
      splits: [],
      avgHrFromTrack: null,
      maxHrFromTrack: null,
      movingDurationSec: null,
      pauseDurationSec: null,
      distanceRawKm,
      distanceOfficialKm: normalizeOfficialDistanceKm(distanceRawKm, workout.sport)
    };
  }
  return buildDetailFromStreams(workout, streams);
}

export function cloudRouteBounds(detail: WorkoutDetailData) {
  return detail.routePoints.length ? mapBounds(detail.routePoints) : null;
}

