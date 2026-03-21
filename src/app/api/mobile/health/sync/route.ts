import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasWorkoutByCanonicalKey, upsertWorkout } from "@/lib/db";
import type { Sport, Workout } from "@/lib/types";
export const dynamic = "force-dynamic";

const workoutSchema = z.object({
  externalId: z.string().min(1).max(200),
  sport: z.string().min(1).max(32),
  startAt: z.string().datetime({ offset: true }),
  durationSec: z.number().int().positive().max(432000),
  distanceM: z.number().nonnegative().nullable().optional(),
  avgHr: z.number().nonnegative().nullable().optional(),
  maxHr: z.number().nonnegative().nullable().optional(),
  elevationM: z.number().nullable().optional(),
  activeEnergyKcal: z.number().nonnegative().nullable().optional(),
  sourceApp: z.string().max(120).nullable().optional()
});

const schema = z.object({
  deviceId: z.string().min(1).max(120),
  workouts: z.array(workoutSchema).max(400)
});

function normalizeSport(raw: string): Sport | null {
  const key = raw.trim().toLowerCase();
  if (["run", "running", "ריצה"].includes(key)) return "run";
  if (["bike", "cycling", "bicycle", "אופניים"].includes(key)) return "bike";
  if (["swim", "swimming", "שחייה"].includes(key)) return "swim";
  if (["strength", "traditionalstrengthtraining", "functionalstrengthtraining", "כוח", "כח"].includes(key)) {
    return "strength";
  }
  return null;
}

function estimateLoad({
  sport,
  durationSec,
  distanceM,
  avgHr,
  activeEnergyKcal
}: {
  sport: Sport;
  durationSec: number;
  distanceM: number | null;
  avgHr: number | null;
  activeEnergyKcal: number | null;
}) {
  const durationMin = Math.max(1, durationSec / 60);
  const sportFactor = sport === "run" ? 1.15 : sport === "swim" ? 1.07 : sport === "strength" ? 0.86 : 1;
  const hrFactor = avgHr != null ? Math.max(0.72, Math.min(1.72, avgHr / 145)) : 1;
  const distFactor =
    distanceM != null && distanceM > 0 ? Math.max(0.84, Math.min(1.32, distanceM / 10000)) : 1;
  const energyFactor =
    activeEnergyKcal != null && activeEnergyKcal > 0
      ? Math.max(0.8, Math.min(1.4, activeEnergyKcal / 700))
      : 1;

  const tssLike = Math.max(5, Math.round(durationMin * sportFactor * hrFactor * distFactor * 0.92));
  const trimp = Math.max(4, Math.round(durationMin * sportFactor * hrFactor * energyFactor * 0.88));
  return { tssLike, trimp };
}

function buildRawHash(deviceId: string, externalId: string, startAt: string, sport: Sport) {
  const base = `healthkit|${deviceId}|${externalId}|${startAt}|${sport}`;
  return `healthkit:${createHash("sha1").update(base).digest("hex")}`;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const item of parsed.data.workouts) {
    const sport = normalizeSport(item.sport);
    if (!sport) {
      skipped += 1;
      continue;
    }

    const start = new Date(item.startAt);
    if (!Number.isFinite(start.getTime())) {
      skipped += 1;
      continue;
    }
    const startAt = start.toISOString();
    const canonicalKey = `${sport}|${startAt}`;
    const existed = hasWorkoutByCanonicalKey(canonicalKey);
    const rawFileHash = buildRawHash(parsed.data.deviceId, item.externalId, startAt, sport);
    const load = estimateLoad({
      sport,
      durationSec: item.durationSec,
      distanceM: item.distanceM ?? null,
      avgHr: item.avgHr ?? null,
      activeEnergyKcal: item.activeEnergyKcal ?? null
    });

    const workout: Workout = {
      id: randomUUID(),
      source: "healthfit",
      sport,
      startAt,
      durationSec: item.durationSec,
      distanceM: item.distanceM ?? null,
      avgHr: item.avgHr ?? null,
      maxHr: item.maxHr ?? null,
      elevationM: item.elevationM ?? null,
      tssLike: load.tssLike,
      trimp: load.trimp,
      canonicalKey,
      rawFileHash,
      rawFilePath: item.sourceApp ?? null
    };

    upsertWorkout(workout);
    if (existed) {
      updated += 1;
    } else {
      created += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    received: parsed.data.workouts.length,
    created,
    updated,
    skipped,
    syncedAt: new Date().toISOString()
  });
}
