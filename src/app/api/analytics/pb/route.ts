import { NextRequest, NextResponse } from "next/server";
import { getTopEfforts } from "@/lib/db";
import { PB_DISTANCES } from "@/lib/pb-engine";
import { cloudEnabled, cloudGetTopEfforts, cloudGetWorkoutsSince } from "@/lib/cloud-db";
import type { Workout } from "@/lib/types";
export const dynamic = "force-dynamic";

const keys = new Set(PB_DISTANCES.map((d) => d.key));

function wholeWorkoutToleranceKm(targetKm: number) {
  if (targetKm <= 3) return 0.1;
  if (targetKm <= 5) return 0.12;
  if (targetKm <= 10) return 0.18;
  if (targetKm <= 16) return 0.28;
  if (targetKm <= 25) return 0.4;
  if (targetKm >= 30) return 1.2;
  return 0.6;
}

export async function GET(request: NextRequest) {
  const distance = (request.nextUrl.searchParams.get("distance") ?? "5k") as string;
  const limitRaw = Number(request.nextUrl.searchParams.get("limit") ?? "5");
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(20, Math.round(limitRaw))) : 5;
  const includeSegments = request.nextUrl.searchParams.get("includeSegments") === "1";
  if (!keys.has(distance as any)) {
    return NextResponse.json({ error: "distance not supported" }, { status: 400 });
  }

  if (cloudEnabled()) {
    const cloudTop = await cloudGetTopEfforts(distance, limit, includeSegments);
    if (cloudTop.length > 0) {
      return NextResponse.json({ distance, top: cloudTop });
    }

    const target = PB_DISTANCES.find((d) => d.key === distance);
    if (!target) {
      return NextResponse.json({ error: "distance not supported" }, { status: 400 });
    }

    const workouts = (await cloudGetWorkoutsSince("1900-01-01T00:00:00.000Z")) as Workout[];
    const tolerance = wholeWorkoutToleranceKm(target.km);
    const top = workouts
      .filter((w) => w.sport === "run" && (w.distanceM ?? 0) > 0 && w.durationSec > 0)
      .filter((w) => Math.abs(((w.distanceM ?? 0) / 1000) - target.km) <= tolerance)
      .sort((a, b) => a.durationSec - b.durationSec || Date.parse(b.startAt) - Date.parse(a.startAt))
      .slice(0, limit)
      .map((w, idx) => ({
        id: `${distance}:${w.id}:${idx}`,
        distanceKey: distance,
        distanceKm: target.km,
        timeSec: w.durationSec,
        paceMinPerKm: w.durationSec / 60 / target.km,
        workoutId: w.id,
        workoutStartAt: w.startAt,
        source: "whole_workout" as const,
        segmentStartSec: null,
        segmentEndSec: null
      }));

    return NextResponse.json({ distance, top });
  }

  return NextResponse.json({
    distance,
    top: getTopEfforts(distance, limit, includeSegments)
  });
}
