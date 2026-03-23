import { NextResponse } from "next/server";
import { z } from "zod";
import { addDaysISO } from "@/lib/date";
import { getWorkoutsBetween } from "@/lib/db";
import { getWorkoutDetailData } from "@/lib/workout-detail";
import { cloudEnabled, cloudGetWorkoutsBetween } from "@/lib/cloud-db";
import type { Workout } from "@/lib/types";
export const dynamic = "force-dynamic";

export const runtime = "nodejs";

const schema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  minDistance: z.number().min(0).optional(),
  maxDistance: z.number().min(0).optional(),
  minPace: z.number().min(1).optional(),
  maxPace: z.number().min(1).optional(),
  sport: z.enum(["run", "bike", "swim"]).optional()
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params: Record<string, unknown> = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (!value) continue;
    if (key === "sport") {
      params[key] = value;
      continue;
    }
    const num = Number(value);
    params[key] = Number.isNaN(num) ? value : num;
  }

  const parsed = schema.safeParse(params);
  const { from, to, minDistance, maxDistance, minPace, maxPace, sport } =
    parsed.success
      ? parsed.data
      : {
          from: params.from as string | undefined,
          to: params.to as string | undefined,
          minDistance: typeof params.minDistance === "number" ? params.minDistance : undefined,
          maxDistance: typeof params.maxDistance === "number" ? params.maxDistance : undefined,
          minPace: typeof params.minPace === "number" ? params.minPace : undefined,
          maxPace: typeof params.maxPace === "number" ? params.maxPace : undefined,
          sport: params.sport as "run" | "bike" | "swim" | undefined
        };

  const defaultStart = `${addDaysISO(new Date().toISOString().slice(0, 10), -365)}T00:00:00.000Z`;
  const defaultEnd = `${new Date().toISOString().slice(0, 10)}T23:59:59.999Z`;
  const start = from ? new Date(from).toISOString() : defaultStart;
  // Use inclusive end: add 1ms so the end of the day is included
  const end = to ? new Date(to).toISOString() : defaultEnd;

  const rawWorkouts: Workout[] = cloudEnabled()
    ? await cloudGetWorkoutsBetween(start, end)
    : getWorkoutsBetween(start, end);

  type DisplayMetrics = {
    distanceDisplayKm: number;
    distanceRawKm: number | null;
    distanceOfficialKm: number | null;
    durationForPaceSec: number;
    movingDurationSec: number | null;
    pauseDurationSec: number | null;
    paceMinPerKm: number | null;
  };

  const metricsCache = new Map<string, DisplayMetrics>();
  const metricsFor = (workout: Workout): DisplayMetrics => {
    const cached = metricsCache.get(workout.id);
    if (cached) return cached;

    const rawKm =
      workout.distanceM != null && Number.isFinite(workout.distanceM)
        ? Math.max(0, workout.distanceM / 1000)
        : null;

    if (workout.sport !== "run") {
      const metric: DisplayMetrics = {
        distanceDisplayKm: rawKm ?? 0,
        distanceRawKm: rawKm,
        distanceOfficialKm: null,
        durationForPaceSec: workout.durationSec,
        movingDurationSec: null,
        pauseDurationSec: null,
        paceMinPerKm:
          rawKm && rawKm > 0 && workout.durationSec > 0
            ? workout.durationSec / 60 / rawKm
            : null
      };
      metricsCache.set(workout.id, metric);
      return metric;
    }

    const detail = getWorkoutDetailData(workout);
    const distanceRawKm = detail.distanceRawKm ?? rawKm;
    const distanceOfficialKm = detail.distanceOfficialKm ?? null;
    const distanceDisplayKm = distanceOfficialKm ?? distanceRawKm ?? 0;
    const durationForPaceSec =
      detail.movingDurationSec != null && detail.movingDurationSec > 0
        ? detail.movingDurationSec
        : workout.durationSec;
    const paceMinPerKm =
      distanceDisplayKm > 0 && durationForPaceSec > 0
        ? durationForPaceSec / 60 / distanceDisplayKm
        : null;

    const metric: DisplayMetrics = {
      distanceDisplayKm,
      distanceRawKm: distanceRawKm ?? null,
      distanceOfficialKm,
      durationForPaceSec,
      movingDurationSec: detail.movingDurationSec,
      pauseDurationSec: detail.pauseDurationSec,
      paceMinPerKm
    };
    metricsCache.set(workout.id, metric);
    return metric;
  };

  const filtered = rawWorkouts.filter((w) => {
    if (sport && w.sport !== sport) return false;
    const metric = metricsFor(w);
    const distanceKm = metric.distanceDisplayKm;
    if (minDistance !== undefined && distanceKm < minDistance) return false;
    if (maxDistance !== undefined && distanceKm > maxDistance) return false;
    const paceMinPerKm = metric.paceMinPerKm ?? Number.POSITIVE_INFINITY;
    if (minPace !== undefined && paceMinPerKm < minPace) return false;
    if (maxPace !== undefined && paceMinPerKm > maxPace) return false;
    return true;
  });

  const totalDistanceKm = filtered.reduce((sum, w) => sum + metricsFor(w).distanceDisplayKm, 0);
  const totalPaceDurationSec = filtered.reduce((sum, w) => sum + metricsFor(w).durationForPaceSec, 0);
  const enrichedWorkouts = filtered.map((w) => {
    const metric = metricsFor(w);
    return {
      ...w,
      distanceDisplayKm: Math.round(metric.distanceDisplayKm * 100) / 100,
      distanceRawKm: metric.distanceRawKm != null ? Math.round(metric.distanceRawKm * 100) / 100 : null,
      distanceOfficialKm: metric.distanceOfficialKm,
      durationForPaceSec: Math.round(metric.durationForPaceSec),
      movingDurationSec: metric.movingDurationSec != null ? Math.round(metric.movingDurationSec) : null,
      pauseDurationSec: metric.pauseDurationSec != null ? Math.round(metric.pauseDurationSec) : null,
      paceMinPerKm: metric.paceMinPerKm != null ? Math.round(metric.paceMinPerKm * 1000) / 1000 : null
    };
  });

  const bestPace = enrichedWorkouts.reduce<number | null>((best, w) => {
    const pace = w.paceMinPerKm;
    if (pace == null) return best;
    return best === null ? pace : Math.min(best, pace);
  }, null);

  const summary = {
    totalCount: filtered.length,
    totalKm: Math.round(totalDistanceKm * 10) / 10,
    avgPace:
      filtered.length && totalDistanceKm > 0
        ? Math.round((totalPaceDurationSec / 60 / totalDistanceKm) * 10) / 10
        : null,
    bestPace: bestPace ? Math.round(bestPace * 100) / 100 : null
  };

  return NextResponse.json({ filters: { from: start, to: end, sport }, summary, workouts: enrichedWorkouts });
}
