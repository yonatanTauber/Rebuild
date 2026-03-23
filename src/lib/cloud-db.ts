import { sql } from "@vercel/postgres";
import { randomUUID } from "node:crypto";

export type CloudDailyRecovery = {
  date: string;
  rpe: number;
  sleepHours: number | null;
  sleepQuality: number | null;
  hrv: number | null;
  restingHr: number | null;
  mood: number | null;
  sorenessGlobal: number | null;
  sorenessByArea: string | null;
  notes: string | null;
};

export type CloudDailyCheckinProgress = {
  date: string;
  exertion: string | null;
  sleep: string | null;
  hrv: string | null;
  restingHr: string | null;
  mood: string | null;
  sorenessLevel: string | null;
  painAreas: string[];
  lastStep: number | null;
  updatedAt: string;
};

export type CloudPainArea = { id: string; name: string; createdAt: string };

export type CloudAthleteProfile = {
  restingHrBaseline: number | null;
  hrvBaseline: number | null;
  sleepHoursBaseline: number | null;
};

export function cloudEnabled() {
  const url =
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING;
  return process.env.VERCEL === "1" && Boolean(url);
}

let ensured = false;
export async function ensureCloudCoreTables() {
  if (ensured) return;
  ensured = true;

  await sql`
    CREATE TABLE IF NOT EXISTS daily_recovery (
      date TEXT PRIMARY KEY,
      rpe DOUBLE PRECISION NOT NULL,
      sleepHours DOUBLE PRECISION,
      sleepQuality DOUBLE PRECISION,
      hrv DOUBLE PRECISION,
      restingHr DOUBLE PRECISION,
      mood DOUBLE PRECISION,
      sorenessGlobal DOUBLE PRECISION,
      sorenessByArea TEXT,
      notes TEXT
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS pain_areas (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      createdAt TEXT NOT NULL
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS daily_checkin_progress (
      date TEXT PRIMARY KEY,
      exertion TEXT,
      sleep TEXT,
      hrv TEXT,
      restingHr TEXT,
      mood TEXT,
      sorenessLevel TEXT,
      painAreasJson TEXT,
      lastStep INTEGER,
      updatedAt TEXT NOT NULL
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS athlete_profile (
      id INTEGER PRIMARY KEY,
      restingHrBaseline DOUBLE PRECISION,
      hrvBaseline DOUBLE PRECISION,
      sleepHoursBaseline DOUBLE PRECISION,
      updatedAt TEXT NOT NULL
    );
  `;

  await sql`CREATE INDEX IF NOT EXISTS daily_recovery_date_idx ON daily_recovery(date);`;
}

export type CloudWorkout = {
  id: string;
  source: "strava" | "healthfit" | "bavel" | "smashrun";
  sport: "run" | "bike" | "swim" | "strength";
  startAt: string;
  durationSec: number;
  distanceM: number | null;
  avgHr: number | null;
  maxHr: number | null;
  elevationM: number | null;
  powerAvg: number | null;
  paceAvg: number | null;
  tssLike: number;
  trimp: number;
  canonicalKey: string | null;
  rawFileHash: string;
  rawFilePath: string | null;
  shoeId: string | null;
  shoeKmAtAssign: number | null;
  shoeName?: string | null;
};

export type CloudTopEffort = {
  id: string;
  distanceKey: string;
  timeSec: number;
  paceMinPerKm: number;
  workoutId: string;
  workoutStartAt: string;
  source: "whole_workout" | "rolling_segment";
  segmentStartSec: number | null;
  segmentEndSec: number | null;
  distanceKm: number;
};

export type CloudWorkoutFeedback = {
  workoutId: string;
  date: string;
  sport: "run" | "bike" | "swim" | "strength";
  perceivedEffort: "easy" | "moderate" | "hard" | "max";
  bodyFeel: "fresh" | "normal" | "heavy" | "pain";
  breathingFeel: "easy" | "steady" | "hard";
  rpeScore: number | null;
  legsLoadScore: number | null;
  painScore: number | null;
  painArea: string | null;
  addFiveKmScore: number | null;
  recoveryScore: number | null;
  breathingScore: number | null;
  overallLoadScore: number | null;
  preRunNutritionScore: number | null;
  environmentScore: number | null;
  satisfactionScore: number | null;
  openNote: string | null;
  fuelingSource: string | null;
  fuelingQuantity: number | null;
  strengthTechniqueScore: number | null;
  strengthFailureProximityScore: number | null;
  strengthFocusArea: string | null;
  strengthEffortScore: number | null;
  strengthMuscleLoadScore: number | null;
  strengthPainScore: number | null;
  strengthRecoveryScore: number | null;
  strengthPainArea: string | null;
  strengthOpenNote: string | null;
  updatedAt: string;
};

async function ensureCloudWorkoutTable() {
  await ensureCloudCoreTables();
  // keep in sync with the Strava helper (idempotent)
  await sql`
    CREATE TABLE IF NOT EXISTS workouts (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      userId TEXT,
      sport TEXT NOT NULL,
      startAt TEXT NOT NULL,
      durationSec INTEGER NOT NULL,
      distanceM DOUBLE PRECISION,
      avgHr DOUBLE PRECISION,
      maxHr DOUBLE PRECISION,
      elevationM DOUBLE PRECISION,
      powerAvg DOUBLE PRECISION,
      paceAvg DOUBLE PRECISION,
      tssLike DOUBLE PRECISION NOT NULL,
      trimp DOUBLE PRECISION NOT NULL,
      canonicalKey TEXT,
      rawFileHash TEXT UNIQUE NOT NULL,
      rawFilePath TEXT,
      shoeId TEXT,
      shoeKmAtAssign DOUBLE PRECISION
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS workouts_startAt_idx ON workouts(startAt);`;
  await sql`CREATE INDEX IF NOT EXISTS workouts_sport_startAt_idx ON workouts(sport, startAt);`;
}

async function ensureCloudWorkoutOverridesTable() {
  await ensureCloudWorkoutTable();
  await sql`
    CREATE TABLE IF NOT EXISTS workout_manual_overrides (
      workoutId TEXT PRIMARY KEY,
      officialDurationSec INTEGER,
      updatedAt TEXT NOT NULL
    );
  `;
}

async function ensureCloudWorkoutFeedbackTables() {
  await ensureCloudWorkoutTable();
  await sql`
    CREATE TABLE IF NOT EXISTS workout_feedback (
      workoutId TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      sport TEXT NOT NULL,
      perceivedEffort TEXT,
      bodyFeel TEXT,
      breathingFeel TEXT,
      rpeScore INTEGER,
      legsLoadScore INTEGER,
      painScore INTEGER,
      painArea TEXT,
      addFiveKmScore INTEGER,
      recoveryScore INTEGER,
      breathingScore INTEGER,
      overallLoadScore INTEGER,
      preRunNutritionScore INTEGER,
      environmentScore INTEGER,
      satisfactionScore INTEGER,
      openNote TEXT,
      fuelingSource TEXT,
      fuelingQuantity DOUBLE PRECISION,
      strengthTechniqueScore INTEGER,
      strengthFailureProximityScore INTEGER,
      strengthFocusArea TEXT,
      strengthEffortScore INTEGER,
      strengthMuscleLoadScore INTEGER,
      strengthPainScore INTEGER,
      strengthRecoveryScore INTEGER,
      strengthPainArea TEXT,
      strengthOpenNote TEXT,
      updatedAt TEXT NOT NULL
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS workout_feedback_dismissed (
      workoutId TEXT PRIMARY KEY,
      dismissedAt TEXT NOT NULL
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS workout_feedback_date_idx ON workout_feedback(date);`;
}

function mapWorkoutRow(row: Record<string, unknown>): CloudWorkout {
  const get = <T>(key: string) => row[key] as T;
  return {
    id: String(get("id")),
    source: (String(get("source")) as CloudWorkout["source"]) ?? "strava",
    sport: (String(get("sport")) as CloudWorkout["sport"]) ?? "run",
    startAt: String(get("startat") ?? get("startAt")),
    durationSec: Number(get("durationsec") ?? get("durationSec") ?? 0),
    distanceM: get("distancem") == null ? null : Number(get("distancem")),
    avgHr: get("avghr") == null ? null : Number(get("avghr")),
    maxHr: get("maxhr") == null ? null : Number(get("maxhr")),
    elevationM: get("elevationm") == null ? null : Number(get("elevationm")),
    powerAvg: get("poweravg") == null ? null : Number(get("poweravg")),
    paceAvg: get("paceavg") == null ? null : Number(get("paceavg")),
    tssLike: Number(get("tsslike") ?? 0),
    trimp: Number(get("trimp") ?? 0),
    canonicalKey: get("canonicalkey") == null ? null : String(get("canonicalkey")),
    rawFileHash: String(get("rawfilehash") ?? get("rawFileHash") ?? ""),
    rawFilePath: get("rawfilepath") == null ? null : String(get("rawfilepath")),
    shoeId: get("shoeid") == null ? null : String(get("shoeid")),
    shoeKmAtAssign: get("shoekmatassign") == null ? null : Number(get("shoekmatassign")),
    shoeName: null
  };
}

function mapWorkoutFeedbackRow(row: Record<string, unknown>): CloudWorkoutFeedback {
  const get = <T>(key: string) => row[key] as T;
  const perceivedRaw = (get("perceivedeffort") ?? get("perceivedEffort") ?? null) as string | null;
  const bodyRaw = (get("bodyfeel") ?? get("bodyFeel") ?? null) as string | null;
  const breathRaw = (get("breathingfeel") ?? get("breathingFeel") ?? null) as string | null;
  return {
    workoutId: String(get("workoutid") ?? get("workoutId")),
    date: String(get("date")),
    sport: (String(get("sport")) as CloudWorkoutFeedback["sport"]) ?? "run",
    perceivedEffort:
      perceivedRaw === "easy" || perceivedRaw === "moderate" || perceivedRaw === "hard" || perceivedRaw === "max"
        ? (perceivedRaw as any)
        : "moderate",
    bodyFeel:
      bodyRaw === "fresh" || bodyRaw === "normal" || bodyRaw === "heavy" || bodyRaw === "pain"
        ? (bodyRaw as any)
        : "normal",
    breathingFeel: breathRaw === "easy" || breathRaw === "steady" || breathRaw === "hard" ? (breathRaw as any) : "steady",
    rpeScore: get("rpescore") == null ? null : Number(get("rpescore")),
    legsLoadScore: get("legsloadscore") == null ? null : Number(get("legsloadscore")),
    painScore: get("painscore") == null ? null : Number(get("painscore")),
    painArea: get("painarea") == null ? null : String(get("painarea")),
    addFiveKmScore: get("addfivekmscore") == null ? null : Number(get("addfivekmscore")),
    recoveryScore: get("recoveryscore") == null ? null : Number(get("recoveryscore")),
    breathingScore: get("breathingscore") == null ? null : Number(get("breathingscore")),
    overallLoadScore: get("overallloadscore") == null ? null : Number(get("overallloadscore")),
    preRunNutritionScore: get("prerunnutritionscore") == null ? null : Number(get("prerunnutritionscore")),
    environmentScore: get("environmentscore") == null ? null : Number(get("environmentscore")),
    satisfactionScore: get("satisfactionscore") == null ? null : Number(get("satisfactionscore")),
    openNote: get("opennote") == null ? null : String(get("opennote")),
    fuelingSource: get("fuelingsource") == null ? null : String(get("fuelingsource")),
    fuelingQuantity: get("fuelingquantity") == null ? null : Number(get("fuelingquantity")),
    strengthTechniqueScore: get("strengthtechniquescore") == null ? null : Number(get("strengthtechniquescore")),
    strengthFailureProximityScore:
      get("strengthfailureproximityscore") == null ? null : Number(get("strengthfailureproximityscore")),
    strengthFocusArea: get("strengthfocusarea") == null ? null : String(get("strengthfocusarea")),
    strengthEffortScore: get("strengtheffortscore") == null ? null : Number(get("strengtheffortscore")),
    strengthMuscleLoadScore: get("strengthmuscleloadscore") == null ? null : Number(get("strengthmuscleloadscore")),
    strengthPainScore: get("strengthpainscore") == null ? null : Number(get("strengthpainscore")),
    strengthRecoveryScore: get("strengthrecoveryscore") == null ? null : Number(get("strengthrecoveryscore")),
    strengthPainArea: get("strengthpainarea") == null ? null : String(get("strengthpainarea")),
    strengthOpenNote: get("strengthopennote") == null ? null : String(get("strengthopennote")),
    updatedAt: String(get("updatedat") ?? get("updatedAt") ?? new Date().toISOString())
  };
}

function withinDuplicateTolerance(a: CloudWorkout, b: CloudWorkout) {
  const aStart = Date.parse(a.startAt);
  const bStart = Date.parse(b.startAt);
  if (!Number.isFinite(aStart) || !Number.isFinite(bStart)) return false;
  const startDiffSec = Math.abs(aStart - bStart) / 1000;
  if (startDiffSec > 10800) return false;

  const durTol = Math.max(420, Number(a.durationSec ?? 0) * 0.18);
  if (Math.abs(Number(a.durationSec ?? 0) - Number(b.durationSec ?? 0)) > durTol) return false;

  const aDist = a.distanceM == null ? null : Number(a.distanceM);
  const bDist = b.distanceM == null ? null : Number(b.distanceM);
  if (aDist != null && bDist != null) {
    const distTol = Math.max(1200, aDist * 0.15);
    if (Math.abs(aDist - bDist) > distTol) return false;
  }

  return true;
}

function sourcePriority(source: string) {
  if (source === "strava") return 4;
  if (source === "smashrun") return 3;
  if (source === "healthfit") return 2;
  return 1;
}

function dedupeCloudWorkouts(rows: CloudWorkout[]): CloudWorkout[] {
  const out: CloudWorkout[] = [];
  for (const row of rows) {
    let matchedIndex = -1;
    for (let i = out.length - 1; i >= 0; i -= 1) {
      const candidate = out[i];
      if (candidate.sport !== row.sport) continue;
      if (!withinDuplicateTolerance(candidate, row)) continue;
      matchedIndex = i;
      break;
    }
    if (matchedIndex < 0) {
      out.push(row);
      continue;
    }

    const existing = out[matchedIndex];
    const rowScore =
      sourcePriority(row.source) * 1000 +
      (row.avgHr != null ? 50 : 0) +
      (row.maxHr != null ? 30 : 0) +
      (row.elevationM != null ? 20 : 0) +
      (row.rawFilePath ? 5 : 0);
    const existingScore =
      sourcePriority(existing.source) * 1000 +
      (existing.avgHr != null ? 50 : 0) +
      (existing.maxHr != null ? 30 : 0) +
      (existing.elevationM != null ? 20 : 0) +
      (existing.rawFilePath ? 5 : 0);

    if (rowScore > existingScore) out[matchedIndex] = row;
  }
  return out;
}

export async function cloudGetWorkoutsBetween(startInclusive: string, endExclusive: string): Promise<CloudWorkout[]> {
  await ensureCloudWorkoutTable();
  const res = await sql<Record<string, unknown>>`
    SELECT *
    FROM workouts
    WHERE startAt >= ${startInclusive} AND startAt < ${endExclusive}
    ORDER BY startAt ASC
  `;
  return dedupeCloudWorkouts(res.rows.map(mapWorkoutRow));
}

export async function cloudGetWorkoutsSince(isoDate: string): Promise<CloudWorkout[]> {
  await ensureCloudWorkoutTable();
  const res = await sql<Record<string, unknown>>`
    SELECT *
    FROM workouts
    WHERE startAt >= ${isoDate}
    ORDER BY startAt DESC
  `;
  return dedupeCloudWorkouts(res.rows.map(mapWorkoutRow));
}

export async function cloudGetTopEfforts(distanceKey: string, limit = 5, includeSegments = false): Promise<CloudTopEffort[]> {
  await ensureCloudWorkoutTable();
  await sql`
    CREATE TABLE IF NOT EXISTS workout_best_efforts (
      id TEXT PRIMARY KEY,
      workoutId TEXT NOT NULL,
      distanceKey TEXT NOT NULL,
      timeSec DOUBLE PRECISION NOT NULL,
      source TEXT NOT NULL,
      segmentStartSec DOUBLE PRECISION,
      segmentEndSec DOUBLE PRECISION,
      createdAt TEXT NOT NULL,
      UNIQUE(workoutId, distanceKey, source, segmentStartSec, segmentEndSec)
    );
  `;
  const res = await sql<Record<string, unknown>>`
    SELECT
      e.id,
      e.distanceKey,
      e.timeSec,
      ((e.timeSec / 60.0) / CASE e.distanceKey
        WHEN '1k' THEN 1
        WHEN '3k' THEN 3
        WHEN '5k' THEN 5
        WHEN '10k' THEN 10
        WHEN '15k' THEN 15
        WHEN 'half' THEN 21.0975
        WHEN '25k' THEN 25
        WHEN '30k' THEN 30
        ELSE 1 END
      ) as paceMinPerKm,
      w.id as workoutId,
      w.startAt as workoutStartAt,
      e.source,
      e.segmentStartSec,
      e.segmentEndSec
    FROM workout_best_efforts e
    JOIN workouts w ON w.id = e.workoutId
    WHERE e.distanceKey = ${distanceKey}
      AND (${includeSegments ? 1 : 0} = 1 OR e.source = 'whole_workout')
    ORDER BY e.timeSec ASC,
             CASE WHEN e.source = 'rolling_segment' THEN 0 ELSE 1 END ASC,
             w.startAt DESC
    LIMIT ${limit}
  `;

  const distanceKm =
    distanceKey === "1k"
      ? 1
      : distanceKey === "3k"
        ? 3
        : distanceKey === "5k"
          ? 5
          : distanceKey === "10k"
            ? 10
            : distanceKey === "15k"
              ? 15
              : distanceKey === "half"
                ? 21.0975
                : distanceKey === "25k"
                  ? 25
                  : 30;

  return res.rows.map((row) => ({
    id: String(row.id),
    distanceKey: String(row.distancekey ?? row.distanceKey),
    timeSec: Number(row.timesec ?? row.timeSec ?? 0),
    paceMinPerKm: Number(row.paceminperkm ?? row.paceMinPerKm ?? 0),
    workoutId: String(row.workoutid ?? row.workoutId),
    workoutStartAt: String(row.workoutstartat ?? row.workoutStartAt),
    source: String(row.source) === "rolling_segment" ? "rolling_segment" : "whole_workout",
    segmentStartSec: row.segmentstartsec == null ? null : Number(row.segmentstartsec),
    segmentEndSec: row.segmentendsec == null ? null : Number(row.segmentendsec),
    distanceKm
  }));
}

export async function cloudGetTopEffortsForWorkout(workoutId: string): Promise<CloudTopEffort[]> {
  await ensureCloudWorkoutTable();
  await sql`
    CREATE TABLE IF NOT EXISTS workout_best_efforts (
      id TEXT PRIMARY KEY,
      workoutId TEXT NOT NULL,
      distanceKey TEXT NOT NULL,
      timeSec DOUBLE PRECISION NOT NULL,
      source TEXT NOT NULL,
      segmentStartSec DOUBLE PRECISION,
      segmentEndSec DOUBLE PRECISION,
      createdAt TEXT NOT NULL,
      UNIQUE(workoutId, distanceKey, source, segmentStartSec, segmentEndSec)
    );
  `;
  const res = await sql<Record<string, unknown>>`
    SELECT
      e.id,
      e.distanceKey,
      e.timeSec,
      ((e.timeSec / 60.0) / CASE e.distanceKey
        WHEN '1k' THEN 1
        WHEN '3k' THEN 3
        WHEN '5k' THEN 5
        WHEN '10k' THEN 10
        WHEN '15k' THEN 15
        WHEN 'half' THEN 21.0975
        WHEN '25k' THEN 25
        WHEN '30k' THEN 30
        ELSE 1 END
      ) as paceMinPerKm,
      w.id as workoutId,
      w.startAt as workoutStartAt,
      e.source,
      e.segmentStartSec,
      e.segmentEndSec
    FROM workout_best_efforts e
    JOIN workouts w ON w.id = e.workoutId
    WHERE e.workoutId = ${workoutId}
    ORDER BY CASE e.distanceKey
      WHEN '1k' THEN 1
      WHEN '3k' THEN 3
      WHEN '5k' THEN 5
      WHEN '10k' THEN 10
      WHEN '15k' THEN 15
      WHEN 'half' THEN 21.0975
      WHEN '25k' THEN 25
      WHEN '30k' THEN 30
      ELSE 999 END ASC,
      e.timeSec ASC,
      CASE WHEN e.source = 'rolling_segment' THEN 0 ELSE 1 END ASC
  `;

  const distanceByKey: Record<string, number> = {
    "1k": 1,
    "3k": 3,
    "5k": 5,
    "10k": 10,
    "15k": 15,
    half: 21.0975,
    "25k": 25,
    "30k": 30
  };

  return res.rows.map((row) => ({
    id: String(row.id),
    distanceKey: String(row.distancekey ?? row.distanceKey),
    timeSec: Number(row.timesec ?? row.timeSec ?? 0),
    paceMinPerKm: Number(row.paceminperkm ?? row.paceMinPerKm ?? 0),
    workoutId: String(row.workoutid ?? row.workoutId),
    workoutStartAt: String(row.workoutstartat ?? row.workoutStartAt),
    source: String(row.source) === "rolling_segment" ? "rolling_segment" : "whole_workout",
    segmentStartSec: row.segmentstartsec == null ? null : Number(row.segmentstartsec),
    segmentEndSec: row.segmentendsec == null ? null : Number(row.segmentendsec),
    distanceKm: distanceByKey[String(row.distancekey ?? row.distanceKey)] ?? 0
  }));
}

export async function cloudGetWorkoutById(id: string): Promise<CloudWorkout | null> {
  await ensureCloudWorkoutTable();
  const res = await sql<Record<string, unknown>>`SELECT * FROM workouts WHERE id = ${id} LIMIT 1`;
  const row = res.rows[0];
  return row ? mapWorkoutRow(row) : null;
}

export async function cloudGetAdjacentWorkoutIds(workoutId: string): Promise<{
  previous: { id: string; startAt: string } | null;
  next: { id: string; startAt: string } | null;
}> {
  await ensureCloudWorkoutTable();
  const current = await sql<{ id: string; startAt: string }>`
    SELECT id, startAt
    FROM workouts
    WHERE id = ${workoutId}
    LIMIT 1
  `;
  const cur = current.rows[0];
  if (!cur) return { previous: null, next: null };

  const prev = await sql<{ id: string; startAt: string }>`
    SELECT id, startAt
    FROM workouts
    WHERE startAt < ${cur.startAt}
       OR (startAt = ${cur.startAt} AND id < ${cur.id})
    ORDER BY startAt DESC, id DESC
    LIMIT 1
  `;
  const next = await sql<{ id: string; startAt: string }>`
    SELECT id, startAt
    FROM workouts
    WHERE startAt > ${cur.startAt}
       OR (startAt = ${cur.startAt} AND id > ${cur.id})
    ORDER BY startAt ASC, id ASC
    LIMIT 1
  `;
  return {
    previous: prev.rows[0] ? { id: prev.rows[0].id, startAt: prev.rows[0].startAt } : null,
    next: next.rows[0] ? { id: next.rows[0].id, startAt: next.rows[0].startAt } : null
  };
}

export async function cloudGetWorkoutOfficialDurationSec(workoutId: string): Promise<number | null> {
  await ensureCloudWorkoutOverridesTable();
  const res = await sql<{ officialDurationSec: number | null }>`
    SELECT officialDurationSec
    FROM workout_manual_overrides
    WHERE workoutId = ${workoutId}
    LIMIT 1
  `;
  const row = res.rows[0];
  if (!row) return null;
  return row.officialDurationSec == null ? null : Number(row.officialDurationSec);
}

export async function cloudUpsertWorkoutOfficialDurationSec(workoutId: string, officialDurationSec: number | null) {
  await ensureCloudWorkoutOverridesTable();
  if (officialDurationSec == null) {
    await sql`DELETE FROM workout_manual_overrides WHERE workoutId = ${workoutId}`;
    return;
  }
  const now = new Date().toISOString();
  await sql`
    INSERT INTO workout_manual_overrides (workoutId, officialDurationSec, updatedAt)
    VALUES (${workoutId}, ${Math.round(officialDurationSec)}, ${now})
    ON CONFLICT (workoutId) DO UPDATE SET
      officialDurationSec = EXCLUDED.officialDurationSec,
      updatedAt = EXCLUDED.updatedAt
  `;
}

export async function cloudGetWorkoutFeedback(workoutId: string): Promise<CloudWorkoutFeedback | null> {
  await ensureCloudWorkoutFeedbackTables();
  const res = await sql<Record<string, unknown>>`SELECT * FROM workout_feedback WHERE workoutId = ${workoutId} LIMIT 1`;
  const row = res.rows[0];
  return row ? mapWorkoutFeedbackRow(row) : null;
}

export async function cloudGetWorkoutFeedbackForDate(date: string): Promise<CloudWorkoutFeedback[]> {
  await ensureCloudWorkoutFeedbackTables();
  const res = await sql<Record<string, unknown>>`SELECT * FROM workout_feedback WHERE date = ${date}`;
  return res.rows.map(mapWorkoutFeedbackRow);
}

export async function cloudUpsertWorkoutFeedback(input: Omit<CloudWorkoutFeedback, "updatedAt">) {
  await ensureCloudWorkoutFeedbackTables();
  const updatedAt = new Date().toISOString();
  await sql`
    INSERT INTO workout_feedback (
      workoutId, date, sport, perceivedEffort, bodyFeel, breathingFeel,
      rpeScore, legsLoadScore, painScore, painArea, addFiveKmScore, recoveryScore,
      breathingScore, overallLoadScore, preRunNutritionScore, environmentScore, satisfactionScore,
      openNote, fuelingSource, fuelingQuantity,
      strengthTechniqueScore, strengthFailureProximityScore, strengthFocusArea,
      strengthEffortScore, strengthMuscleLoadScore, strengthPainScore, strengthRecoveryScore,
      strengthPainArea, strengthOpenNote,
      updatedAt
    ) VALUES (
      ${input.workoutId},
      ${input.date},
      ${input.sport},
      ${input.perceivedEffort},
      ${input.bodyFeel},
      ${input.breathingFeel},
      ${input.rpeScore},
      ${input.legsLoadScore},
      ${input.painScore},
      ${input.painArea},
      ${input.addFiveKmScore},
      ${input.recoveryScore},
      ${input.breathingScore},
      ${input.overallLoadScore},
      ${input.preRunNutritionScore},
      ${input.environmentScore},
      ${input.satisfactionScore},
      ${input.openNote},
      ${input.fuelingSource},
      ${input.fuelingQuantity},
      ${input.strengthTechniqueScore},
      ${input.strengthFailureProximityScore},
      ${input.strengthFocusArea},
      ${input.strengthEffortScore},
      ${input.strengthMuscleLoadScore},
      ${input.strengthPainScore},
      ${input.strengthRecoveryScore},
      ${input.strengthPainArea},
      ${input.strengthOpenNote},
      ${updatedAt}
    )
    ON CONFLICT (workoutId) DO UPDATE SET
      date = EXCLUDED.date,
      sport = EXCLUDED.sport,
      perceivedEffort = EXCLUDED.perceivedEffort,
      bodyFeel = EXCLUDED.bodyFeel,
      breathingFeel = EXCLUDED.breathingFeel,
      rpeScore = EXCLUDED.rpeScore,
      legsLoadScore = EXCLUDED.legsLoadScore,
      painScore = EXCLUDED.painScore,
      painArea = EXCLUDED.painArea,
      addFiveKmScore = EXCLUDED.addFiveKmScore,
      recoveryScore = EXCLUDED.recoveryScore,
      breathingScore = EXCLUDED.breathingScore,
      overallLoadScore = EXCLUDED.overallLoadScore,
      preRunNutritionScore = EXCLUDED.preRunNutritionScore,
      environmentScore = EXCLUDED.environmentScore,
      satisfactionScore = EXCLUDED.satisfactionScore,
      openNote = EXCLUDED.openNote,
      fuelingSource = EXCLUDED.fuelingSource,
      fuelingQuantity = EXCLUDED.fuelingQuantity,
      strengthTechniqueScore = EXCLUDED.strengthTechniqueScore,
      strengthFailureProximityScore = EXCLUDED.strengthFailureProximityScore,
      strengthFocusArea = EXCLUDED.strengthFocusArea,
      strengthEffortScore = EXCLUDED.strengthEffortScore,
      strengthMuscleLoadScore = EXCLUDED.strengthMuscleLoadScore,
      strengthPainScore = EXCLUDED.strengthPainScore,
      strengthRecoveryScore = EXCLUDED.strengthRecoveryScore,
      strengthPainArea = EXCLUDED.strengthPainArea,
      strengthOpenNote = EXCLUDED.strengthOpenNote,
      updatedAt = EXCLUDED.updatedAt
  `;
}

export async function cloudDismissWorkoutFeedback(workoutId: string) {
  await ensureCloudWorkoutFeedbackTables();
  const now = new Date().toISOString();
  await sql`
    INSERT INTO workout_feedback_dismissed (workoutId, dismissedAt)
    VALUES (${workoutId}, ${now})
    ON CONFLICT (workoutId) DO UPDATE SET dismissedAt = EXCLUDED.dismissedAt
  `;
}

export async function cloudGetPendingWorkoutFeedback(limit = 2, days = 7) {
  await ensureCloudWorkoutFeedbackTables();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const res = await sql<Record<string, unknown>>`
    SELECT w.id as "workoutId", w.sport, w.startAt, w.distanceM, w.durationSec
    FROM workouts w
    LEFT JOIN workout_feedback f ON f.workoutId = w.id
    LEFT JOIN workout_feedback_dismissed d ON d.workoutId = w.id
    WHERE f.workoutId IS NULL
      AND d.workoutId IS NULL
      AND w.startAt >= ${since}
    ORDER BY w.startAt DESC
    LIMIT ${limit}
  `;
  return res.rows.map((row) => ({
    workoutId: String((row as any).workoutId ?? (row as any).workoutid),
    sport: (String((row as any).sport) as any) ?? "run",
    startAt: String((row as any).startAt ?? (row as any).startat),
    distanceM:
      (row as any).distanceM == null && (row as any).distancem == null
        ? null
        : Number((row as any).distanceM ?? (row as any).distancem),
    durationSec: Number((row as any).durationSec ?? (row as any).durationsec ?? 0)
  }));
}

export async function cloudGetAthleteProfile(): Promise<CloudAthleteProfile> {
  await ensureCloudCoreTables();
  const res = await sql<{
    restinghrbaseline: number | null;
    hrvbaseline: number | null;
    sleephoursbaseline: number | null;
  }>`SELECT restingHrBaseline, hrvBaseline, sleepHoursBaseline FROM athlete_profile WHERE id = 1`;
  const row = res.rows[0];
  return {
    restingHrBaseline: row?.restinghrbaseline ?? null,
    hrvBaseline: row?.hrvbaseline ?? null,
    sleepHoursBaseline: row?.sleephoursbaseline ?? null
  };
}

export async function cloudHasRecovery(date: string) {
  await ensureCloudCoreTables();
  const res = await sql<{ ok: number }>`SELECT 1 as ok FROM daily_recovery WHERE date = ${date} LIMIT 1`;
  return Boolean(res.rows[0]?.ok);
}

export async function cloudGetRecovery(date: string): Promise<CloudDailyRecovery | null> {
  await ensureCloudCoreTables();
  const res = await sql<{
    date: string;
    rpe: number;
    sleephours: number | null;
    sleepquality: number | null;
    hrv: number | null;
    restinghr: number | null;
    mood: number | null;
    sorenessglobal: number | null;
    sorenessbyarea: string | null;
    notes: string | null;
  }>`SELECT * FROM daily_recovery WHERE date = ${date} LIMIT 1`;
  const row = res.rows[0];
  if (!row) return null;
  return {
    date: row.date,
    rpe: Number(row.rpe),
    sleepHours: row.sleephours == null ? null : Number(row.sleephours),
    sleepQuality: row.sleepquality == null ? null : Number(row.sleepquality),
    hrv: row.hrv == null ? null : Number(row.hrv),
    restingHr: row.restinghr == null ? null : Number(row.restinghr),
    mood: row.mood == null ? null : Number(row.mood),
    sorenessGlobal: row.sorenessglobal == null ? null : Number(row.sorenessglobal),
    sorenessByArea: row.sorenessbyarea ?? null,
    notes: row.notes ?? null
  };
}

export async function cloudUpsertRecovery(input: CloudDailyRecovery) {
  await ensureCloudCoreTables();
  await sql`
    INSERT INTO daily_recovery (date, rpe, sleepHours, sleepQuality, hrv, restingHr, mood, sorenessGlobal, sorenessByArea, notes)
    VALUES (
      ${input.date},
      ${input.rpe},
      ${input.sleepHours},
      ${input.sleepQuality},
      ${input.hrv},
      ${input.restingHr},
      ${input.mood},
      ${input.sorenessGlobal},
      ${input.sorenessByArea},
      ${input.notes}
    )
    ON CONFLICT (date) DO UPDATE SET
      rpe = EXCLUDED.rpe,
      sleepHours = EXCLUDED.sleepHours,
      sleepQuality = EXCLUDED.sleepQuality,
      hrv = EXCLUDED.hrv,
      restingHr = EXCLUDED.restingHr,
      mood = EXCLUDED.mood,
      sorenessGlobal = EXCLUDED.sorenessGlobal,
      sorenessByArea = EXCLUDED.sorenessByArea,
      notes = EXCLUDED.notes
  `;
}

export async function cloudGetDailyCheckinProgress(date: string): Promise<CloudDailyCheckinProgress | null> {
  await ensureCloudCoreTables();
  const res = await sql<{
    date: string;
    exertion: string | null;
    sleep: string | null;
    hrv: string | null;
    restinghr: string | null;
    mood: string | null;
    sorenesslevel: string | null;
    painareasjson: string | null;
    laststep: number | null;
    updatedat: string;
  }>`
    SELECT date, exertion, sleep, hrv, restingHr, mood, sorenessLevel, painAreasJson, lastStep, updatedAt
    FROM daily_checkin_progress
    WHERE date = ${date}
    LIMIT 1
  `;
  const row = res.rows[0];
  if (!row) return null;
  return {
    date: row.date,
    exertion: row.exertion,
    sleep: row.sleep,
    hrv: row.hrv,
    restingHr: row.restinghr,
    mood: row.mood,
    sorenessLevel: row.sorenesslevel,
    painAreas: row.painareasjson ? ((JSON.parse(row.painareasjson) as string[]) ?? []) : [],
    lastStep: row.laststep,
    updatedAt: row.updatedat
  };
}

export async function cloudUpsertDailyCheckinProgress(input: {
  date: string;
  exertion?: string | null;
  sleep?: string | null;
  hrv?: string | null;
  restingHr?: string | null;
  mood?: string | null;
  sorenessLevel?: string | null;
  painAreas?: string[] | null;
  lastStep?: number | null;
}) {
  await ensureCloudCoreTables();
  const updatedAt = new Date().toISOString();
  await sql`
    INSERT INTO daily_checkin_progress (date, exertion, sleep, hrv, restingHr, mood, sorenessLevel, painAreasJson, lastStep, updatedAt)
    VALUES (
      ${input.date},
      ${input.exertion ?? null},
      ${input.sleep ?? null},
      ${input.hrv ?? null},
      ${input.restingHr ?? null},
      ${input.mood ?? null},
      ${input.sorenessLevel ?? null},
      ${input.painAreas ? JSON.stringify(input.painAreas) : null},
      ${input.lastStep ?? null},
      ${updatedAt}
    )
    ON CONFLICT (date) DO UPDATE SET
      exertion = COALESCE(EXCLUDED.exertion, daily_checkin_progress.exertion),
      sleep = COALESCE(EXCLUDED.sleep, daily_checkin_progress.sleep),
      hrv = COALESCE(EXCLUDED.hrv, daily_checkin_progress.hrv),
      restingHr = COALESCE(EXCLUDED.restingHr, daily_checkin_progress.restingHr),
      mood = COALESCE(EXCLUDED.mood, daily_checkin_progress.mood),
      sorenessLevel = COALESCE(EXCLUDED.sorenessLevel, daily_checkin_progress.sorenessLevel),
      painAreasJson = COALESCE(EXCLUDED.painAreasJson, daily_checkin_progress.painAreasJson),
      lastStep = COALESCE(EXCLUDED.lastStep, daily_checkin_progress.lastStep),
      updatedAt = EXCLUDED.updatedAt
  `;
}

export async function cloudClearDailyCheckinProgress(date: string) {
  await ensureCloudCoreTables();
  await sql`DELETE FROM daily_checkin_progress WHERE date = ${date}`;
}

export async function cloudListPainAreas(): Promise<CloudPainArea[]> {
  await ensureCloudCoreTables();
  const res = await sql<CloudPainArea>`SELECT id, name, createdAt FROM pain_areas ORDER BY name ASC`;
  return res.rows;
}

export async function cloudAddPainArea(nameRaw: string): Promise<CloudPainArea | null> {
  await ensureCloudCoreTables();
  const name = String(nameRaw || "").trim();
  if (!name) return null;
  const now = new Date().toISOString();
  const id = randomUUID();
  await sql`INSERT INTO pain_areas (id, name, createdAt) VALUES (${id}, ${name}, ${now}) ON CONFLICT (name) DO NOTHING`;
  const res = await sql<CloudPainArea>`SELECT id, name, createdAt FROM pain_areas WHERE name = ${name} LIMIT 1`;
  return res.rows[0] ?? null;
}
