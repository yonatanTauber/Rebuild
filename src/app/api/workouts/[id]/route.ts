import { NextResponse } from "next/server";
import { getTopEffortsForWorkout, getWorkoutById } from "@/lib/db";
import { getWorkoutDetailData, mapBounds } from "@/lib/workout-detail";
import { cloudEnabled, cloudGetWorkoutById } from "@/lib/cloud-db";
import { decodeRouteParam } from "@/lib/url";
import { getCloudWorkoutDetailData } from "@/lib/strava-workout-detail";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workoutId = decodeRouteParam(id);
  const workout = cloudEnabled() ? await cloudGetWorkoutById(workoutId) : getWorkoutById(workoutId);

  if (!workout) {
    return NextResponse.json({ error: "Workout not found" }, { status: 404 });
  }

  let detail = getWorkoutDetailData(workout);
  if (cloudEnabled() && workout.source === "strava") {
    try {
      detail = await getCloudWorkoutDetailData(workout);
    } catch (error) {
      console.error("strava-detail-failed", { workoutId: workout.id, error });
    }
  }
  const distanceDisplayKm = detail.distanceOfficialKm ?? detail.distanceRawKm;
  const durationForPaceSec =
    detail.movingDurationSec != null && detail.movingDurationSec > 0
      ? detail.movingDurationSec
      : workout.durationSec;
  const paceDisplayMinPerKm =
    distanceDisplayKm != null && distanceDisplayKm > 0
      ? durationForPaceSec / 60 / distanceDisplayKm
      : null;
  return NextResponse.json({
    workout,
    routePoints: detail.routePoints,
    routeSegments: detail.routeSegments,
    routeBounds: mapBounds(detail.routePoints),
    distanceOfficialKm: detail.distanceOfficialKm,
    distanceRawKm: detail.distanceRawKm,
    movingDurationSec: detail.movingDurationSec,
    pauseDurationSec: detail.pauseDurationSec,
    distanceDisplayKm,
    durationForPaceSec,
    paceDisplayMinPerKm,
    splits: detail.splits,
    heartRateSamples: detail.heartRateSamples,
    bestEfforts: cloudEnabled() ? [] : getTopEffortsForWorkout(workout.id)
  });
}
