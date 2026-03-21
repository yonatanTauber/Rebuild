import { createHash, randomUUID } from "node:crypto";
import { getDb, upsertWorkout, getWorkoutsBetween } from "../src/lib/db";
import { recalculateNutritionFrom } from "../src/lib/nutrition-engine";
import { recomputeBestEffortsAll } from "../src/lib/pb-engine";
import type { Workout } from "../src/lib/types";

type ManualRun = {
  date: string;
  time: string;
  distanceKm: number;
  duration: string;
  avgHr?: number;
  maxHr?: number;
  elevationM?: number;
  source?: "healthfit" | "strava";
};

const MANUAL_RUNS: ManualRun[] = [
  { date: "2026-02-01", time: "09:06:00", distanceKm: 14.1, duration: "1:28:20", avgHr: 130, elevationM: 36, source: "healthfit" },
  { date: "2026-02-04", time: "09:27:00", distanceKm: 8.1, duration: "46:23", avgHr: 138, elevationM: 25, source: "healthfit" },
  { date: "2026-02-07", time: "15:17:00", distanceKm: 12.0, duration: "58:44", avgHr: 158, elevationM: 44, source: "healthfit" },
  { date: "2026-02-09", time: "10:55:00", distanceKm: 25.0, duration: "2:11:45", avgHr: 152, elevationM: 79, source: "healthfit" },
  { date: "2026-02-10", time: "16:36:00", distanceKm: 7.0, duration: "40:29", avgHr: 134, elevationM: 43, source: "healthfit" },
  { date: "2026-02-12", time: "09:58:00", distanceKm: 8.0, duration: "42:20", avgHr: 143, elevationM: 26, source: "healthfit" },
  { date: "2026-02-15", time: "08:53:00", distanceKm: 12.0, duration: "59:29", avgHr: 152, elevationM: 25, source: "healthfit" },
  { date: "2026-02-17", time: "16:45:00", distanceKm: 10.0, duration: "50:35", avgHr: 146, elevationM: 33, source: "healthfit" },
  { date: "2026-02-20", time: "09:25:00", distanceKm: 10.0, duration: "55:56", avgHr: 139, elevationM: 54, source: "healthfit" },
  { date: "2026-02-22", time: "08:23:00", distanceKm: 13.0, duration: "1:11:55", avgHr: 135, elevationM: 45, source: "healthfit" },
  { date: "2026-02-23", time: "09:31:00", distanceKm: 8.0, duration: "40:49", avgHr: 145, elevationM: 160, source: "healthfit" },
  { date: "2026-02-26", time: "12:09:00", distanceKm: 0.5, duration: "5:51", avgHr: 97, source: "strava" },
  { date: "2026-02-26", time: "12:27:00", distanceKm: 1.0, duration: "6:44", avgHr: 162, source: "strava" },
  { date: "2026-02-27", time: "09:05:00", distanceKm: 15.0, duration: "1:17:26", avgHr: 148, elevationM: 68, source: "healthfit" },
  { date: "2026-03-02", time: "13:14:00", distanceKm: 10.03, duration: "48:42", avgHr: 159, maxHr: 175, source: "healthfit" }
];

function parseDurationToSec(value: string) {
  const parts = value.split(":").map((x) => Number(x));
  if (parts.some((x) => !Number.isFinite(x) || x < 0)) {
    throw new Error(`Invalid duration: ${value}`);
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  throw new Error(`Invalid duration format: ${value}`);
}

function toIsoUtc(date: string, time: string) {
  const t = `${date}T${time}.000Z`;
  const iso = new Date(t).toISOString();
  return iso;
}

function buildWorkout(input: ManualRun): Workout {
  const startAt = toIsoUtc(input.date, input.time);
  const durationSec = parseDurationToSec(input.duration);
  const distanceM = Math.round(input.distanceKm * 1000);
  const paceAvg = distanceM > 0 ? durationSec / 60 / (distanceM / 1000) : null;
  const baseHr = input.avgHr ?? 145;
  const tssLike = Math.max(8, Math.round((durationSec / 60) * (baseHr / 130)));
  const canonicalKey = `run|${startAt}`;
  const stable = `${canonicalKey}|${distanceM}|${durationSec}|manual-2026-patch`;
  const hash = createHash("sha1").update(stable).digest("hex");

  return {
    id: randomUUID(),
    source: input.source ?? "healthfit",
    userId: "local-user",
    sport: "run",
    startAt,
    durationSec,
    distanceM,
    avgHr: input.avgHr ?? null,
    maxHr: input.maxHr ?? null,
    elevationM: input.elevationM ?? null,
    powerAvg: null,
    paceAvg,
    tssLike,
    trimp: tssLike,
    canonicalKey,
    rawFileHash: `manual:2026:${hash}`,
    rawFilePath: null
  };
}

function hasSmashrunMatch(date: string, distanceM: number, durationSec: number) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id FROM workouts
       WHERE sport = 'run'
         AND source = 'smashrun'
         AND substr(startAt, 1, 10) = ?
         AND ABS(COALESCE(distanceM, 0) - ?) <= 250
         AND ABS(durationSec - ?) <= 300
       LIMIT 1`
    )
    .get(date, distanceM, durationSec) as { id: string } | undefined;
  return Boolean(row?.id);
}

function cleanupDuplicateHealthfitRowsAgainstSmashrun() {
  const db = getDb();
  const result = db
    .prepare(
      `DELETE FROM workouts
       WHERE id IN (
         SELECT h.id
         FROM workouts h
         JOIN workouts s
           ON h.sport = 'run'
          AND s.sport = 'run'
          AND h.id <> s.id
          AND h.source = 'healthfit'
          AND s.source = 'smashrun'
          AND substr(h.startAt, 1, 10) = substr(s.startAt, 1, 10)
          AND ABS(COALESCE(h.distanceM, 0) - COALESCE(s.distanceM, 0)) <= 250
          AND ABS(h.durationSec - s.durationSec) <= 300
       )`
    )
    .run() as { changes: number };

  return result.changes ?? 0;
}

function summarize2026() {
  const runs = getWorkoutsBetween("2026-01-01T00:00:00.000Z", "2027-01-01T00:00:00.000Z").filter((w) => w.sport === "run");
  const km = runs.reduce((sum, w) => sum + (w.distanceM ?? 0) / 1000, 0);
  return { count: runs.length, km: Math.round(km * 100) / 100 };
}

async function main() {
  const removed = cleanupDuplicateHealthfitRowsAgainstSmashrun();
  let inserted = 0;
  let skippedAsDuplicate = 0;

  for (const run of MANUAL_RUNS) {
    const workout = buildWorkout(run);
    if (hasSmashrunMatch(run.date, workout.distanceM ?? 0, workout.durationSec)) {
      skippedAsDuplicate += 1;
      continue;
    }
    upsertWorkout(workout);
    inserted += 1;
  }
  recomputeBestEffortsAll();
  recalculateNutritionFrom(undefined, 8);

  const summary = summarize2026();
  console.log(
    `Patch done. input=${MANUAL_RUNS.length} inserted=${inserted} skipped_duplicate=${skippedAsDuplicate} removed_old_duplicate=${removed}. 2026 runs in DB: ${summary.count}, km=${summary.km}.`
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
