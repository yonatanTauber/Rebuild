import { randomUUID } from "node:crypto";
import { addDaysISO, formatISODate } from "@/lib/date";
import { dbExec, dbQuery, dbQueryOne } from "@/lib/db-driver";

export type StrengthEquipmentType =
  | "dumbbell"
  | "kettlebell"
  | "barbell"
  | "bench"
  | "pullup"
  | "cable"
  | "leg_press"
  | "row"
  | "shoulder_press"
  | "bodyweight"
  | "other";

export type StrengthHandMode = "one" | "two";
export type StrengthSessionStatus = "active" | "paused" | "completed";

export type StrengthExerciseTemplate = {
  key: string;
  equipmentType: StrengthEquipmentType;
  name: string;
  defaultWeightKg: number;
  defaultRepsMin: number;
  defaultRepsMax: number;
  defaultSets: number;
  defaultHandMode: StrengthHandMode;
  weightStepKg: number;
};

export type StrengthSessionExercise = {
  id: string;
  sessionId: string;
  equipmentType: StrengthEquipmentType;
  exerciseKey: string;
  exerciseName: string;
  weightKg: number;
  repsMin: number;
  repsMax: number;
  targetSets: number;
  completedSets: number;
  handMode: StrengthHandMode;
  note: string | null;
  orderIndex: number;
  options: Array<{ value: string; label: string }>;
  weightStepKg: number;
};

export type StrengthSessionData = {
  id: string;
  date: string;
  status: StrengthSessionStatus;
  source: string;
  workoutId: string | null;
  startedAt: string;
  completedAt: string | null;
  lastExerciseId: string | null;
  lastInputAt: string | null;
  equipmentTypes: StrengthEquipmentType[];
  exercises: StrengthSessionExercise[];
};

type DbSessionRow = {
  id: string;
  date: string;
  status: StrengthSessionStatus;
  source: string;
  workoutid: string | null;
  startedat: string;
  completedat: string | null;
  lastexerciseid: string | null;
  lastinputat: string | null;
};

type DbExerciseRow = {
  id: string;
  sessionid: string;
  equipmenttype: StrengthEquipmentType;
  exercisekey: string;
  exercisename: string;
  weightkg: number;
  repsmin: number;
  repsmax: number;
  targetsets: number;
  completedsets: number;
  handmode: StrengthHandMode;
  note: string | null;
  orderindex: number;
};

const strengthTemplates: StrengthExerciseTemplate[] = [
  {
    key: "dumbbell_press",
    equipmentType: "dumbbell",
    name: "לחיצת חזה דאמבל",
    defaultWeightKg: 16,
    defaultRepsMin: 8,
    defaultRepsMax: 10,
    defaultSets: 3,
    defaultHandMode: "two",
    weightStepKg: 2
  },
  {
    key: "dumbbell_row",
    equipmentType: "dumbbell",
    name: "חתירה דאמבל",
    defaultWeightKg: 22,
    defaultRepsMin: 8,
    defaultRepsMax: 12,
    defaultSets: 3,
    defaultHandMode: "one",
    weightStepKg: 2
  },
  {
    key: "kettlebell_swing",
    equipmentType: "kettlebell",
    name: "קטלבל סווינג",
    defaultWeightKg: 20,
    defaultRepsMin: 12,
    defaultRepsMax: 16,
    defaultSets: 4,
    defaultHandMode: "two",
    weightStepKg: 4
  },
  {
    key: "kettlebell_goblet_squat",
    equipmentType: "kettlebell",
    name: "גובלט סקוואט קטלבל",
    defaultWeightKg: 20,
    defaultRepsMin: 8,
    defaultRepsMax: 12,
    defaultSets: 4,
    defaultHandMode: "two",
    weightStepKg: 4
  },
  {
    key: "barbell_back_squat",
    equipmentType: "barbell",
    name: "סקוואט מוט",
    defaultWeightKg: 60,
    defaultRepsMin: 5,
    defaultRepsMax: 8,
    defaultSets: 4,
    defaultHandMode: "two",
    weightStepKg: 2.5
  },
  {
    key: "barbell_deadlift",
    equipmentType: "barbell",
    name: "דדליפט מוט",
    defaultWeightKg: 80,
    defaultRepsMin: 4,
    defaultRepsMax: 6,
    defaultSets: 4,
    defaultHandMode: "two",
    weightStepKg: 2.5
  },
  {
    key: "bench_press_machine",
    equipmentType: "bench",
    name: "לחיצת חזה מכונה",
    defaultWeightKg: 40,
    defaultRepsMin: 8,
    defaultRepsMax: 12,
    defaultSets: 3,
    defaultHandMode: "two",
    weightStepKg: 2.5
  },
  {
    key: "pullup_assisted",
    equipmentType: "pullup",
    name: "מתח / מתח בסיוע",
    defaultWeightKg: 0,
    defaultRepsMin: 6,
    defaultRepsMax: 10,
    defaultSets: 4,
    defaultHandMode: "two",
    weightStepKg: 2.5
  },
  {
    key: "cable_row",
    equipmentType: "cable",
    name: "חתירה בכבל",
    defaultWeightKg: 35,
    defaultRepsMin: 10,
    defaultRepsMax: 12,
    defaultSets: 3,
    defaultHandMode: "two",
    weightStepKg: 2.5
  },
  {
    key: "leg_press",
    equipmentType: "leg_press",
    name: "לחיצת רגליים",
    defaultWeightKg: 110,
    defaultRepsMin: 10,
    defaultRepsMax: 12,
    defaultSets: 4,
    defaultHandMode: "two",
    weightStepKg: 5
  },
  {
    key: "seated_row",
    equipmentType: "row",
    name: "חתירה ישיבה",
    defaultWeightKg: 40,
    defaultRepsMin: 8,
    defaultRepsMax: 12,
    defaultSets: 3,
    defaultHandMode: "two",
    weightStepKg: 2.5
  },
  {
    key: "shoulder_press_machine",
    equipmentType: "shoulder_press",
    name: "לחיצת כתפיים מכונה",
    defaultWeightKg: 25,
    defaultRepsMin: 8,
    defaultRepsMax: 12,
    defaultSets: 3,
    defaultHandMode: "two",
    weightStepKg: 2.5
  },
  {
    key: "pushups",
    equipmentType: "bodyweight",
    name: "שכיבות סמיכה",
    defaultWeightKg: 0,
    defaultRepsMin: 10,
    defaultRepsMax: 15,
    defaultSets: 3,
    defaultHandMode: "two",
    weightStepKg: 0
  },
  {
    key: "plank",
    equipmentType: "bodyweight",
    name: "פלאנק",
    defaultWeightKg: 0,
    defaultRepsMin: 1,
    defaultRepsMax: 1,
    defaultSets: 3,
    defaultHandMode: "two",
    weightStepKg: 0
  },
  {
    key: "other_exercise",
    equipmentType: "other",
    name: "תרגיל אחר",
    defaultWeightKg: 0,
    defaultRepsMin: 8,
    defaultRepsMax: 12,
    defaultSets: 3,
    defaultHandMode: "two",
    weightStepKg: 2.5
  }
];

const equipmentLabels: Record<StrengthEquipmentType, string> = {
  dumbbell: "Dumbbell",
  kettlebell: "Kettlebell",
  barbell: "Barbell",
  bench: "Bench",
  pullup: "Pull-up",
  cable: "Cable",
  leg_press: "Leg Press",
  row: "Row",
  shoulder_press: "Shoulder Press",
  bodyweight: "Bodyweight",
  other: "אחר"
};

export const strengthEquipmentOptions = (Object.keys(equipmentLabels) as StrengthEquipmentType[]).map((value) => ({
  value,
  label: equipmentLabels[value]
}));

export async function ensureStrengthTables() {
  await dbExec(`
    CREATE TABLE IF NOT EXISTS strength_sessions (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      source TEXT NOT NULL DEFAULT 'app',
      workoutId TEXT,
      startedAt TEXT NOT NULL,
      completedAt TEXT,
      lastExerciseId TEXT,
      lastInputAt TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS strength_session_exercises (
      id TEXT PRIMARY KEY,
      sessionId TEXT NOT NULL,
      equipmentType TEXT NOT NULL,
      exerciseKey TEXT NOT NULL,
      exerciseName TEXT NOT NULL,
      weightKg DOUBLE PRECISION NOT NULL DEFAULT 0,
      repsMin INTEGER NOT NULL DEFAULT 8,
      repsMax INTEGER NOT NULL DEFAULT 12,
      targetSets INTEGER NOT NULL DEFAULT 3,
      completedSets INTEGER NOT NULL DEFAULT 0,
      handMode TEXT NOT NULL DEFAULT 'two',
      note TEXT,
      orderIndex INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      UNIQUE(sessionId, id)
    );

    CREATE TABLE IF NOT EXISTS strength_session_sets (
      id TEXT PRIMARY KEY,
      sessionId TEXT NOT NULL,
      exerciseId TEXT NOT NULL,
      setNumber INTEGER NOT NULL,
      weightKg DOUBLE PRECISION,
      reps INTEGER,
      handMode TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS strength_exercise_defaults (
      id TEXT PRIMARY KEY,
      exerciseKey TEXT UNIQUE NOT NULL,
      equipmentType TEXT NOT NULL,
      exerciseName TEXT NOT NULL,
      weightKg DOUBLE PRECISION NOT NULL DEFAULT 0,
      repsMin INTEGER NOT NULL DEFAULT 8,
      repsMax INTEGER NOT NULL DEFAULT 12,
      targetSets INTEGER NOT NULL DEFAULT 3,
      handMode TEXT NOT NULL DEFAULT 'two',
      updatedAt TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
  `);
}

function normalizeExerciseTemplate(key: string, equipmentType: StrengthEquipmentType) {
  const byKey = strengthTemplates.find((t) => t.key === key);
  if (byKey) return byKey;
  const byEquipment = strengthTemplates.find((t) => t.equipmentType === equipmentType);
  if (byEquipment) return byEquipment;
  return strengthTemplates.find((t) => t.equipmentType === "other") as StrengthExerciseTemplate;
}

function exerciseOptionsForEquipment(equipmentType: StrengthEquipmentType) {
  return strengthTemplates
    .filter((template) => template.equipmentType === equipmentType)
    .map((template) => ({ value: template.key, label: template.name }));
}

function toDayRange(date: string) {
  const start = `${date}T00:00:00.000Z`;
  const end = `${addDaysISO(date, 1)}T00:00:00.000Z`;
  return { start, end };
}

async function getWorkoutCandidatesForDate(date: string) {
  const { start, end } = toDayRange(date);
  const workouts = await dbQuery<{ id: string; startat: string; sport: string }>(
    `SELECT id, startAt, sport
     FROM workouts
     WHERE startAt >= $1 AND startAt < $2 AND sport = 'strength'
     ORDER BY startAt ASC`,
    [start, end]
  );
  return workouts.rows.map((row) => ({
    id: row.id,
    startAt: row.startat,
    sport: row.sport
  }));
}

async function attachSessionToNearestWorkout(sessionId: string, date: string, anchorIso: string) {
  const candidates = await getWorkoutCandidatesForDate(date);
  if (!candidates.length) return null;
  const anchorMs = Date.parse(anchorIso);
  if (!Number.isFinite(anchorMs)) return null;

  let best: { id: string; diff: number } | null = null;
  for (const row of candidates) {
    const startMs = Date.parse(row.startAt);
    if (!Number.isFinite(startMs)) continue;
    const diff = Math.abs(startMs - anchorMs);
    if (!best || diff < best.diff) best = { id: row.id, diff };
  }
  if (!best || best.diff > 6 * 60 * 60 * 1000) return null;

  const now = new Date().toISOString();
  await dbQuery(
    `UPDATE strength_sessions
     SET workoutId = $1, updatedAt = $2
     WHERE id = $3`,
    [best.id, now, sessionId]
  );
  return best.id;
}

async function hydrateSession(row: DbSessionRow | null): Promise<StrengthSessionData | null> {
  if (!row) return null;
  const exerciseRows = await dbQuery<DbExerciseRow>(
    `SELECT id, sessionId, equipmentType, exerciseKey, exerciseName, weightKg, repsMin, repsMax, targetSets, completedSets, handMode, note, orderIndex
     FROM strength_session_exercises
     WHERE sessionId = $1
     ORDER BY orderIndex ASC, createdAt ASC`,
    [row.id]
  );

  const exercises = exerciseRows.rows.map((exercise) => {
    const template = normalizeExerciseTemplate(exercise.exercisekey, exercise.equipmenttype);
    return {
      id: exercise.id,
      sessionId: exercise.sessionid,
      equipmentType: exercise.equipmenttype,
      exerciseKey: exercise.exercisekey,
      exerciseName: exercise.exercisename,
      weightKg: Number(exercise.weightkg ?? 0),
      repsMin: Number(exercise.repsmin ?? 8),
      repsMax: Number(exercise.repsmax ?? 12),
      targetSets: Number(exercise.targetsets ?? 3),
      completedSets: Number(exercise.completedsets ?? 0),
      handMode: exercise.handmode ?? "two",
      note: exercise.note ?? null,
      orderIndex: Number(exercise.orderindex ?? 0),
      options: exerciseOptionsForEquipment(exercise.equipmenttype),
      weightStepKg: template.weightStepKg
    } satisfies StrengthSessionExercise;
  });

  const equipmentTypes = Array.from(new Set(exercises.map((exercise) => exercise.equipmentType)));

  return {
    id: row.id,
    date: row.date,
    status: row.status,
    source: row.source,
    workoutId: row.workoutid ?? null,
    startedAt: row.startedat,
    completedAt: row.completedat ?? null,
    lastExerciseId: row.lastexerciseid ?? null,
    lastInputAt: row.lastinputat ?? null,
    equipmentTypes,
    exercises
  };
}

async function upsertExerciseDefault(input: {
  exerciseKey: string;
  equipmentType: StrengthEquipmentType;
  exerciseName: string;
  weightKg: number;
  repsMin: number;
  repsMax: number;
  targetSets: number;
  handMode: StrengthHandMode;
}) {
  const existing = await dbQueryOne<{ id: string }>(
    `SELECT id FROM strength_exercise_defaults WHERE exerciseKey = $1 LIMIT 1`,
    [input.exerciseKey]
  );
  const now = new Date().toISOString();
  const id = existing?.id ?? randomUUID();
  await dbQuery(
    `INSERT INTO strength_exercise_defaults
     (id, exerciseKey, equipmentType, exerciseName, weightKg, repsMin, repsMax, targetSets, handMode, createdAt, updatedAt)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (exerciseKey) DO UPDATE SET
       equipmentType = EXCLUDED.equipmentType,
       exerciseName = EXCLUDED.exerciseName,
       weightKg = EXCLUDED.weightKg,
       repsMin = EXCLUDED.repsMin,
       repsMax = EXCLUDED.repsMax,
       targetSets = EXCLUDED.targetSets,
       handMode = EXCLUDED.handMode,
       updatedAt = EXCLUDED.updatedAt`,
    [
      id,
      input.exerciseKey,
      input.equipmentType,
      input.exerciseName,
      input.weightKg,
      input.repsMin,
      input.repsMax,
      input.targetSets,
      input.handMode,
      now,
      now
    ]
  );
}

async function defaultValuesForTemplate(template: StrengthExerciseTemplate) {
  const existing = await dbQueryOne<{
    weightkg: number;
    repsmin: number;
    repsmax: number;
    targetsets: number;
    handmode: StrengthHandMode;
  }>(
    `SELECT weightKg, repsMin, repsMax, targetSets, handMode
     FROM strength_exercise_defaults
     WHERE exerciseKey = $1
     LIMIT 1`,
    [template.key]
  );

  if (!existing) {
    return {
      weightKg: template.defaultWeightKg,
      repsMin: template.defaultRepsMin,
      repsMax: template.defaultRepsMax,
      targetSets: template.defaultSets,
      handMode: template.defaultHandMode
    };
  }

  return {
    weightKg: Number(existing.weightkg ?? template.defaultWeightKg),
    repsMin: Number(existing.repsmin ?? template.defaultRepsMin),
    repsMax: Number(existing.repsmax ?? template.defaultRepsMax),
    targetSets: Number(existing.targetsets ?? template.defaultSets),
    handMode: (existing.handmode ?? template.defaultHandMode) as StrengthHandMode
  };
}

export async function getActiveStrengthSession(date: string): Promise<StrengthSessionData | null> {
  await ensureStrengthTables();
  const row = await dbQueryOne<DbSessionRow>(
    `SELECT id, date, status, source, workoutId, startedAt, completedAt, lastExerciseId, lastInputAt
     FROM strength_sessions
     WHERE date = $1 AND status IN ('active', 'paused')
     ORDER BY updatedAt DESC
     LIMIT 1`,
    [date]
  );
  return hydrateSession(row);
}

export async function startStrengthSession(input: {
  date?: string;
  startedAt?: string;
  equipmentTypes: StrengthEquipmentType[];
}) {
  await ensureStrengthTables();
  const date = input.date ?? formatISODate();
  const existing = await getActiveStrengthSession(date);
  if (existing) return existing;

  const startedAt = input.startedAt ?? new Date().toISOString();
  const now = new Date().toISOString();
  const sessionId = randomUUID();
  await dbQuery(
    `INSERT INTO strength_sessions (id, date, status, source, workoutId, startedAt, completedAt, lastExerciseId, lastInputAt, createdAt, updatedAt)
     VALUES ($1, $2, 'active', 'app', NULL, $3, NULL, NULL, $4, $4, $4)`,
    [sessionId, date, startedAt, now]
  );

  let orderIndex = 1;
  const equipmentTypes: StrengthEquipmentType[] = input.equipmentTypes.length
    ? input.equipmentTypes
    : ["dumbbell"];
  for (const equipmentType of equipmentTypes) {
    const template = normalizeExerciseTemplate("", equipmentType);
    const defaults = await defaultValuesForTemplate(template);
    await dbQuery(
      `INSERT INTO strength_session_exercises
       (id, sessionId, equipmentType, exerciseKey, exerciseName, weightKg, repsMin, repsMax, targetSets, completedSets, handMode, note, orderIndex, createdAt, updatedAt)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, $10, NULL, $11, $12, $12)`,
      [
        randomUUID(),
        sessionId,
        equipmentType,
        template.key,
        template.name,
        defaults.weightKg,
        defaults.repsMin,
        defaults.repsMax,
        defaults.targetSets,
        defaults.handMode,
        orderIndex,
        now
      ]
    );
    orderIndex += 1;
  }

  await attachSessionToNearestWorkout(sessionId, date, startedAt);
  const fresh = await getStrengthSessionById(sessionId);
  return fresh;
}

export async function getStrengthSessionById(sessionId: string): Promise<StrengthSessionData | null> {
  await ensureStrengthTables();
  const row = await dbQueryOne<DbSessionRow>(
    `SELECT id, date, status, source, workoutId, startedAt, completedAt, lastExerciseId, lastInputAt
     FROM strength_sessions
     WHERE id = $1
     LIMIT 1`,
    [sessionId]
  );
  return hydrateSession(row);
}

export async function addStrengthSessionItem(input: {
  sessionId: string;
  equipmentType: StrengthEquipmentType;
  exerciseKey?: string;
}) {
  await ensureStrengthTables();
  const session = await getStrengthSessionById(input.sessionId);
  if (!session || session.status === "completed") return null;

  const template = normalizeExerciseTemplate(input.exerciseKey ?? "", input.equipmentType);
  const defaults = await defaultValuesForTemplate(template);
  const maxOrder = session.exercises.reduce((acc, item) => Math.max(acc, item.orderIndex), 0);
  const now = new Date().toISOString();
  await dbQuery(
    `INSERT INTO strength_session_exercises
     (id, sessionId, equipmentType, exerciseKey, exerciseName, weightKg, repsMin, repsMax, targetSets, completedSets, handMode, note, orderIndex, createdAt, updatedAt)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, $10, NULL, $11, $12, $12)`,
    [
      randomUUID(),
      input.sessionId,
      input.equipmentType,
      template.key,
      template.name,
      defaults.weightKg,
      defaults.repsMin,
      defaults.repsMax,
      defaults.targetSets,
      defaults.handMode,
      maxOrder + 1,
      now
    ]
  );
  await dbQuery(`UPDATE strength_sessions SET updatedAt = $1 WHERE id = $2`, [now, input.sessionId]);
  return getStrengthSessionById(input.sessionId);
}

export async function updateStrengthSessionExercise(input: {
  sessionId: string;
  exerciseId: string;
  exerciseKey?: string;
  weightKg?: number;
  repsMin?: number;
  repsMax?: number;
  targetSets?: number;
  handMode?: StrengthHandMode;
  note?: string | null;
  setAsDefault?: boolean;
}) {
  await ensureStrengthTables();
  const row = await dbQueryOne<DbExerciseRow>(
    `SELECT id, sessionId, equipmentType, exerciseKey, exerciseName, weightKg, repsMin, repsMax, targetSets, completedSets, handMode, note, orderIndex
     FROM strength_session_exercises
     WHERE id = $1 AND sessionId = $2
     LIMIT 1`,
    [input.exerciseId, input.sessionId]
  );
  if (!row) return null;

  const template = normalizeExerciseTemplate(input.exerciseKey ?? row.exercisekey, row.equipmenttype);
  const nextExerciseKey = input.exerciseKey ?? row.exercisekey;
  const nextExerciseName = input.exerciseKey ? template.name : row.exercisename;
  const nextWeight = Math.max(0, Number(input.weightKg ?? row.weightkg ?? 0));
  const nextRepsMin = Math.max(1, Math.round(Number(input.repsMin ?? row.repsmin ?? 8)));
  const nextRepsMax = Math.max(nextRepsMin, Math.round(Number(input.repsMax ?? row.repsmax ?? 12)));
  const nextTargetSets = Math.max(1, Math.round(Number(input.targetSets ?? row.targetsets ?? 3)));
  const nextHandMode = (input.handMode ?? row.handmode ?? "two") as StrengthHandMode;
  const nextNote = input.note === undefined ? row.note ?? null : input.note;
  const now = new Date().toISOString();

  await dbQuery(
    `UPDATE strength_session_exercises
     SET exerciseKey = $1,
         exerciseName = $2,
         weightKg = $3,
         repsMin = $4,
         repsMax = $5,
         targetSets = $6,
         handMode = $7,
         note = $8,
         updatedAt = $9
     WHERE id = $10 AND sessionId = $11`,
    [
      nextExerciseKey,
      nextExerciseName,
      nextWeight,
      nextRepsMin,
      nextRepsMax,
      nextTargetSets,
      nextHandMode,
      nextNote,
      now,
      input.exerciseId,
      input.sessionId
    ]
  );

  await dbQuery(
    `UPDATE strength_sessions
     SET lastExerciseId = $1, lastInputAt = $2, updatedAt = $2
     WHERE id = $3`,
    [input.exerciseId, now, input.sessionId]
  );

  if (input.setAsDefault) {
    await upsertExerciseDefault({
      exerciseKey: nextExerciseKey,
      equipmentType: row.equipmenttype,
      exerciseName: nextExerciseName,
      weightKg: nextWeight,
      repsMin: nextRepsMin,
      repsMax: nextRepsMax,
      targetSets: nextTargetSets,
      handMode: nextHandMode
    });
  }

  return getStrengthSessionById(input.sessionId);
}

export async function completeStrengthSessionSet(input: {
  sessionId: string;
  exerciseId: string;
  reps?: number;
  weightKg?: number;
}) {
  await ensureStrengthTables();
  const exercise = await dbQueryOne<DbExerciseRow>(
    `SELECT id, sessionId, equipmentType, exerciseKey, exerciseName, weightKg, repsMin, repsMax, targetSets, completedSets, handMode, note, orderIndex
     FROM strength_session_exercises
     WHERE id = $1 AND sessionId = $2
     LIMIT 1`,
    [input.exerciseId, input.sessionId]
  );
  if (!exercise) return null;

  const nextSetNumber = Math.max(1, Number(exercise.completedsets ?? 0) + 1);
  const reps = input.reps != null ? Math.max(1, Math.round(input.reps)) : Math.round((Number(exercise.repsmin) + Number(exercise.repsmax)) / 2);
  const weightKg = input.weightKg != null ? Math.max(0, Number(input.weightKg)) : Number(exercise.weightkg ?? 0);
  const now = new Date().toISOString();

  await dbQuery(
    `INSERT INTO strength_session_sets (id, sessionId, exerciseId, setNumber, weightKg, reps, handMode, createdAt)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [randomUUID(), input.sessionId, input.exerciseId, nextSetNumber, weightKg, reps, exercise.handmode, now]
  );
  await dbQuery(
    `UPDATE strength_session_exercises
     SET completedSets = $1, updatedAt = $2
     WHERE id = $3`,
    [nextSetNumber, now, input.exerciseId]
  );
  await dbQuery(
    `UPDATE strength_sessions
     SET lastExerciseId = $1, lastInputAt = $2, updatedAt = $2, status = 'active'
     WHERE id = $3`,
    [input.exerciseId, now, input.sessionId]
  );

  return getStrengthSessionById(input.sessionId);
}

export async function pauseStrengthSession(sessionId: string) {
  await ensureStrengthTables();
  const now = new Date().toISOString();
  await dbQuery(`UPDATE strength_sessions SET status = 'paused', updatedAt = $1 WHERE id = $2`, [now, sessionId]);
  return getStrengthSessionById(sessionId);
}

export async function completeStrengthSession(input: { sessionId: string; completedAt?: string }) {
  await ensureStrengthTables();
  const session = await getStrengthSessionById(input.sessionId);
  if (!session) return null;
  const completedAt = input.completedAt ?? new Date().toISOString();
  const now = new Date().toISOString();
  const workoutId = session.workoutId ?? (await attachSessionToNearestWorkout(session.id, session.date, session.startedAt));
  await dbQuery(
    `UPDATE strength_sessions
     SET status = 'completed',
         completedAt = $1,
         updatedAt = $2,
         workoutId = COALESCE(workoutId, $3)
     WHERE id = $4`,
    [completedAt, now, workoutId, input.sessionId]
  );
  return getStrengthSessionById(input.sessionId);
}

export async function attachOpenStrengthSessionsForDate(date: string) {
  await ensureStrengthTables();
  const rows = await dbQuery<{ id: string; date: string; startedat: string }>(
    `SELECT id, date, startedAt
     FROM strength_sessions
     WHERE date = $1
       AND workoutId IS NULL
       AND status IN ('active', 'paused', 'completed')
     ORDER BY startedAt ASC`,
    [date]
  );
  for (const row of rows.rows) {
    await attachSessionToNearestWorkout(row.id, row.date, row.startedat);
  }
}

export function strengthExerciseOptionsForEquipment(equipmentType: StrengthEquipmentType) {
  return exerciseOptionsForEquipment(equipmentType);
}
