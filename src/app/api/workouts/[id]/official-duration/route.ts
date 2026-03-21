import { NextResponse } from "next/server";
import { getWorkoutById, getWorkoutOfficialDurationSec, upsertWorkoutOfficialDurationSec } from "@/lib/db";
import {
  cloudEnabled,
  cloudGetWorkoutById,
  cloudGetWorkoutOfficialDurationSec,
  cloudUpsertWorkoutOfficialDurationSec
} from "@/lib/cloud-db";
import { decodeRouteParam } from "@/lib/url";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workoutId = decodeRouteParam(id);
  const workout = cloudEnabled() ? await cloudGetWorkoutById(workoutId) : getWorkoutById(workoutId);
  if (!workout) {
    return NextResponse.json({ error: "Workout not found" }, { status: 404 });
  }

  return NextResponse.json({
    workoutId,
    officialDurationSec: cloudEnabled()
      ? await cloudGetWorkoutOfficialDurationSec(workoutId)
      : getWorkoutOfficialDurationSec(workoutId)
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workoutId = decodeRouteParam(id);
  const workout = cloudEnabled() ? await cloudGetWorkoutById(workoutId) : getWorkoutById(workoutId);
  if (!workout) {
    return NextResponse.json({ error: "Workout not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    officialDurationSec?: number | null;
  };

  const rawValue = body.officialDurationSec;
  if (rawValue == null) {
    if (cloudEnabled()) {
      await cloudUpsertWorkoutOfficialDurationSec(workoutId, null);
    } else {
      upsertWorkoutOfficialDurationSec(workoutId, null);
    }
    return NextResponse.json({ ok: true, officialDurationSec: null });
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed < 60 || parsed > 12 * 3600) {
    return NextResponse.json({ error: "officialDurationSec out of range" }, { status: 400 });
  }

  if (cloudEnabled()) {
    await cloudUpsertWorkoutOfficialDurationSec(workoutId, Math.round(parsed));
  } else {
    upsertWorkoutOfficialDurationSec(workoutId, Math.round(parsed));
  }
  return NextResponse.json({ ok: true, officialDurationSec: Math.round(parsed) });
}
