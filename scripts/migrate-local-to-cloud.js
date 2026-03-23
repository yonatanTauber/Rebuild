/* eslint-disable no-console */
// One-time local -> cloud migration (SQLite -> Vercel Postgres/Neon).
// Runs with plain Node (no tsx) because the sandbox blocks tsx IPC sockets.

const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");
const { neon } = require("@neondatabase/serverless");

function loadDotEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function sqlitePath() {
  return path.join(process.cwd(), "data", "rebuild.db");
}

function openLocalSqlite() {
  const p = sqlitePath();
  if (!fs.existsSync(p)) throw new Error(`Local DB not found at ${p}`);
  return new Database(p);
}

function safeAll(db, sql) {
  try {
    return db.prepare(sql).all();
  } catch {
    return [];
  }
}

function parseIsoMs(iso) {
  const ms = Date.parse(String(iso));
  return Number.isFinite(ms) ? ms : 0;
}

function numOrNull(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function strOrNull(v) {
  if (v == null) return null;
  const s = String(v);
  return s.length ? s : null;
}

function boolInt(v) {
  if (v == null) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n !== 0 ? 1 : 0;
}

function withinTolerance(local, cloud) {
  const localStart = parseIsoMs(local.startAt);
  const cloudStart = parseIsoMs(cloud.startAt ?? cloud.startat);
  const startDiffSec = Math.abs(localStart - cloudStart) / 1000;
  if (startDiffSec > 10800) return false;

  const d1 = Number(local.durationSec ?? 0);
  const d2 = Number(cloud.durationSec ?? cloud.durationsec ?? 0);
  const durTol = Math.max(420, d1 * 0.18);
  if (Math.abs(d1 - d2) > durTol) return false;

  const dist1 = local.distanceM == null ? null : Number(local.distanceM);
  const dist2Raw = cloud.distanceM ?? cloud.distancem;
  const dist2 = dist2Raw == null ? null : Number(dist2Raw);
  if (dist1 != null && dist2 != null) {
    const distTol = Math.max(1200, dist1 * 0.15);
    if (Math.abs(dist1 - dist2) > distTol) return false;
  }
  return true;
}

async function ensureSchema(sql) {
  // Keep this minimal: only tables we write into as part of migration.
  // These are idempotent and safe if tables already exist.
  const stmts = [
    `CREATE TABLE IF NOT EXISTS daily_recovery (
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
    )`,
    `CREATE TABLE IF NOT EXISTS pain_areas (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      createdAt TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS daily_checkin_progress (
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
    )`,
    `CREATE TABLE IF NOT EXISTS athlete_profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      restingHrBaseline DOUBLE PRECISION,
      hrvBaseline DOUBLE PRECISION,
      sleepHoursBaseline DOUBLE PRECISION,
      updatedAt TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS running_shoe_brands (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      createdAt TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS running_shoes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      brand TEXT NOT NULL,
      startKm DOUBLE PRECISION NOT NULL,
      targetKm DOUBLE PRECISION NOT NULL,
      isDefault INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS nutrition_daily_plan (
      date TEXT PRIMARY KEY,
      carbsG DOUBLE PRECISION NOT NULL,
      proteinG DOUBLE PRECISION NOT NULL,
      fatG DOUBLE PRECISION NOT NULL,
      hydrationMl DOUBLE PRECISION NOT NULL,
      preWorkoutNote TEXT NOT NULL,
      postWorkoutNote TEXT NOT NULL,
      rationaleJson TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS nutrition_ingredients (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      category TEXT NOT NULL,
      kcalPer100 DOUBLE PRECISION NOT NULL,
      proteinPer100 DOUBLE PRECISION NOT NULL,
      carbsPer100 DOUBLE PRECISION NOT NULL,
      fatPer100 DOUBLE PRECISION NOT NULL,
      defaultUnit TEXT NOT NULL,
      gramsPerUnit DOUBLE PRECISION NOT NULL,
      isBuiltIn INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS nutrition_meal_activation (
      date TEXT NOT NULL,
      mealSlot TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      PRIMARY KEY (date, mealSlot)
    )`,
    `CREATE TABLE IF NOT EXISTS nutrition_meal_history (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      mealSlot TEXT NOT NULL,
      title TEXT NOT NULL,
      itemsJson TEXT NOT NULL,
      totalKcal DOUBLE PRECISION NOT NULL,
      proteinG DOUBLE PRECISION NOT NULL,
      carbsG DOUBLE PRECISION NOT NULL,
      fatG DOUBLE PRECISION NOT NULL,
      compromiseNote TEXT,
      accepted INTEGER,
      createdAt TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS nutrition_ingredient_favorites (
      ingredientId TEXT PRIMARY KEY,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS nutrition_pantry_items (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      ingredientId TEXT NOT NULL,
      quantity DOUBLE PRECISION NOT NULL,
      unit TEXT NOT NULL,
      gramsEffective DOUBLE PRECISION NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS nutrition_preferences (
      id TEXT PRIMARY KEY,
      ingredientId TEXT NOT NULL,
      mealSlot TEXT NOT NULL,
      score DOUBLE PRECISION NOT NULL,
      lastUsedAt TEXT NOT NULL,
      UNIQUE (ingredientId, mealSlot)
    )`,
    `CREATE TABLE IF NOT EXISTS workout_manual_overrides (
      workoutId TEXT PRIMARY KEY,
      officialDurationSec INTEGER,
      updatedAt TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS workout_feedback (
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
    )`,
    `CREATE TABLE IF NOT EXISTS workout_fueling (
      id TEXT PRIMARY KEY,
      workoutId TEXT NOT NULL,
      itemName TEXT NOT NULL,
      quantity DOUBLE PRECISION NOT NULL,
      unitLabel TEXT NOT NULL,
      carbsG DOUBLE PRECISION NOT NULL,
      kcal DOUBLE PRECISION,
      caffeineMg DOUBLE PRECISION,
      notes TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS workout_best_efforts (
      id TEXT PRIMARY KEY,
      workoutId TEXT NOT NULL,
      distanceKey TEXT NOT NULL,
      timeSec DOUBLE PRECISION NOT NULL,
      source TEXT NOT NULL,
      segmentStartSec DOUBLE PRECISION,
      segmentEndSec DOUBLE PRECISION,
      createdAt TEXT NOT NULL,
      UNIQUE(workoutId, distanceKey, source, segmentStartSec, segmentEndSec)
    )`
  ];
  for (const stmt of stmts) await sql.query(stmt);

  // Backward-compatible column adds (tables may already exist from older deployments).
  // These match the app's migrateDb() schema.
  await sql.query(`ALTER TABLE athlete_profile ADD COLUMN IF NOT EXISTS vo2MaxBaseline DOUBLE PRECISION`);
  await sql.query(`ALTER TABLE athlete_profile ADD COLUMN IF NOT EXISTS sourceSummaryJson TEXT`);
  await sql.query(`ALTER TABLE nutrition_daily_plan ADD COLUMN IF NOT EXISTS totalKcal DOUBLE PRECISION DEFAULT 0`);
}

async function findCloudWorkoutMatch(sql, localWorkout) {
  const startIso = String(localWorkout.startAt);
  const startMs = parseIsoMs(startIso);
  if (!startMs) return null;
  const from = new Date(startMs - 3 * 3600 * 1000).toISOString();
  const to = new Date(startMs + 3 * 3600 * 1000).toISOString();
  const sport = String(localWorkout.sport ?? "");

  const res = await sql.query(
    `SELECT
       id,
       sport,
       startat AS "startAt",
       durationsec AS "durationSec",
       distancem AS "distanceM"
     FROM workouts
     WHERE sport = $1 AND startat >= $2 AND startat <= $3
     ORDER BY startat ASC`,
    [sport, from, to]
  );
  const list = (res || []).filter((row) => withinTolerance(localWorkout, row));
  if (!list.length) return null;

  function score(row) {
    const startDiffMin = Math.abs(parseIsoMs(String(row.startAt)) - startMs) / 1000 / 60;
    const durDiffMin = Math.abs(Number(row.durationSec ?? 0) - Number(localWorkout.durationSec ?? 0)) / 60;
    const distDiffKm =
      localWorkout.distanceM == null || row.distanceM == null ? 0 : Math.abs(Number(row.distanceM) - Number(localWorkout.distanceM)) / 1000;
    return startDiffMin * 1.4 + durDiffMin * 1.0 + distDiffKm * 0.8;
  }

  const best = [...list].sort((a, b) => score(a) - score(b))[0];
  return best?.id ? String(best.id) : null;
}

async function upsertWorkouts(sql, rows) {
  let inserted = 0;
  let updated = 0;
  for (const w of rows) {
    const id = String(w.id ?? "");
    const source = String(w.source ?? "import");
    const sport = String(w.sport ?? "");
    const startAt = String(w.startAt ?? "");
    const durationSec = Number(w.durationSec ?? 0);
    const rawFileHash = strOrNull(w.rawFileHash) || `${source}:${id || startAt}:${durationSec}`;
    if (!id || !sport || !startAt || !Number.isFinite(durationSec) || durationSec <= 0) continue;

    const res = await sql.query(
      `INSERT INTO workouts
        (id, source, userId, sport, startAt, durationSec, distanceM, avgHr, maxHr, elevationM, powerAvg, paceAvg, tssLike, trimp, canonicalKey, rawFileHash, rawFilePath, shoeId, shoeKmAtAssign)
       VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT (id) DO UPDATE SET
        source=EXCLUDED.source,
        userId=EXCLUDED.userId,
        sport=EXCLUDED.sport,
        startAt=EXCLUDED.startAt,
        durationSec=EXCLUDED.durationSec,
        distanceM=EXCLUDED.distanceM,
        avgHr=EXCLUDED.avgHr,
        maxHr=EXCLUDED.maxHr,
        elevationM=EXCLUDED.elevationM,
        powerAvg=EXCLUDED.powerAvg,
        paceAvg=EXCLUDED.paceAvg,
        tssLike=EXCLUDED.tssLike,
        trimp=EXCLUDED.trimp,
        canonicalKey=EXCLUDED.canonicalKey,
        rawFileHash=EXCLUDED.rawFileHash,
        rawFilePath=EXCLUDED.rawFilePath,
        shoeId=EXCLUDED.shoeId,
        shoeKmAtAssign=EXCLUDED.shoeKmAtAssign
       RETURNING (xmax = 0) AS inserted`,
      [
        id,
        source,
        strOrNull(w.userId),
        sport,
        startAt,
        Math.round(durationSec),
        numOrNull(w.distanceM),
        numOrNull(w.avgHr),
        numOrNull(w.maxHr),
        numOrNull(w.elevationM),
        numOrNull(w.powerAvg),
        numOrNull(w.paceAvg),
        Number(w.tssLike ?? 0),
        Number(w.trimp ?? 0),
        strOrNull(w.canonicalKey),
        rawFileHash,
        strOrNull(w.rawFilePath),
        strOrNull(w.shoeId),
        numOrNull(w.shoeKmAtAssign)
      ]
    );

    const created = Boolean(res?.[0]?.inserted);
    if (created) inserted += 1;
    else updated += 1;
  }
  return { inserted, updated };
}

async function main() {
  loadDotEnvLocal();
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;
  if (!url) throw new Error("Missing DATABASE_URL/POSTGRES_URL (check .env.local)");

  const sql = neon(url);
  const local = openLocalSqlite();

  await ensureSchema(sql);

  const localRecovery = safeAll(local, "SELECT * FROM daily_recovery");
  const localProgress = safeAll(local, "SELECT * FROM daily_checkin_progress");
  const localPainAreas = safeAll(local, "SELECT * FROM pain_areas");
  const localProfile = (() => {
    try {
      return local.prepare("SELECT * FROM athlete_profile WHERE id = 1 LIMIT 1").get() || null;
    } catch {
      return null;
    }
  })();

  const shoeBrands = safeAll(local, "SELECT * FROM running_shoe_brands");
  const shoes = safeAll(local, "SELECT * FROM running_shoes");

  const dailyPlan = safeAll(local, "SELECT * FROM nutrition_daily_plan");
  const ingredients = safeAll(local, "SELECT * FROM nutrition_ingredients");
  const mealActivation = safeAll(local, "SELECT * FROM nutrition_meal_activation");
  const mealHistory = safeAll(local, "SELECT * FROM nutrition_meal_history");
  const favorites = safeAll(local, "SELECT * FROM nutrition_ingredient_favorites");
  const pantryItems = safeAll(local, "SELECT * FROM nutrition_pantry_items");
  const preferences = safeAll(local, "SELECT * FROM nutrition_preferences");
  const bestEfforts = safeAll(local, "SELECT * FROM workout_best_efforts");

  const localWorkouts = safeAll(local, "SELECT * FROM workouts");
  const localWorkoutsById = new Map(localWorkouts.map((w) => [String(w.id), w]));

  console.log(`Local DB: ${sqlitePath()}`);
  console.log(`Rows: recovery=${localRecovery.length} meals=${mealHistory.length} shoes=${shoes.length} feedback=${safeAll(local, "SELECT * FROM workout_feedback").length} bestEfforts=${bestEfforts.length}`);

  console.log(`Migrating workouts (${localWorkouts.length})...`);
  const workoutRes = await upsertWorkouts(sql, localWorkouts);
  console.log(`Workouts upserted: inserted=${workoutRes.inserted} updated=${workoutRes.updated}`);

  // workout_best_efforts
  for (const row of bestEfforts) {
    await sql.query(
      `INSERT INTO workout_best_efforts (id, workoutId, distanceKey, timeSec, source, segmentStartSec, segmentEndSec, createdAt)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (workoutId, distanceKey, source, segmentStartSec, segmentEndSec) DO UPDATE SET
         timeSec = LEAST(workout_best_efforts.timeSec, EXCLUDED.timeSec),
         createdAt = EXCLUDED.createdAt`,
      [
        String(row.id),
        String(row.workoutId ?? row.workoutid ?? ""),
        String(row.distanceKey ?? row.distancekey ?? ""),
        Number(row.timeSec ?? row.timesec ?? 0),
        String(row.source ?? "whole_workout"),
        row.segmentStartSec == null ? null : Number(row.segmentStartSec),
        row.segmentEndSec == null ? null : Number(row.segmentEndSec),
        strOrNull(row.createdAt) || new Date().toISOString()
      ]
    );
  }

  // daily_recovery
  for (const r of localRecovery) {
    await sql.query(
      `INSERT INTO daily_recovery (date, rpe, sleepHours, sleepQuality, hrv, restingHr, mood, sorenessGlobal, sorenessByArea, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (date) DO UPDATE SET
         rpe=EXCLUDED.rpe, sleepHours=EXCLUDED.sleepHours, sleepQuality=EXCLUDED.sleepQuality, hrv=EXCLUDED.hrv,
         restingHr=EXCLUDED.restingHr, mood=EXCLUDED.mood, sorenessGlobal=EXCLUDED.sorenessGlobal,
         sorenessByArea=EXCLUDED.sorenessByArea, notes=EXCLUDED.notes`,
      [
        String(r.date),
        Number(r.rpe ?? 0),
        numOrNull(r.sleepHours),
        numOrNull(r.sleepQuality),
        numOrNull(r.hrv),
        numOrNull(r.restingHr),
        numOrNull(r.mood),
        numOrNull(r.sorenessGlobal),
        strOrNull(r.sorenessByArea),
        strOrNull(r.notes)
      ]
    );
  }

  // daily_checkin_progress
  for (const r of localProgress) {
    await sql.query(
      `INSERT INTO daily_checkin_progress (date, exertion, sleep, hrv, restingHr, mood, sorenessLevel, painAreasJson, lastStep, updatedAt)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (date) DO UPDATE SET
         exertion=EXCLUDED.exertion, sleep=EXCLUDED.sleep, hrv=EXCLUDED.hrv, restingHr=EXCLUDED.restingHr,
         mood=EXCLUDED.mood, sorenessLevel=EXCLUDED.sorenessLevel, painAreasJson=EXCLUDED.painAreasJson,
         lastStep=EXCLUDED.lastStep, updatedAt=EXCLUDED.updatedAt`,
      [
        String(r.date),
        strOrNull(r.exertion),
        strOrNull(r.sleep),
        strOrNull(r.hrv),
        strOrNull(r.restingHr),
        strOrNull(r.mood),
        strOrNull(r.sorenessLevel),
        strOrNull(r.painAreasJson),
        r.lastStep == null ? null : Number(r.lastStep),
        strOrNull(r.updatedAt) || new Date().toISOString()
      ]
    );
  }

  // pain_areas
  for (const r of localPainAreas) {
    await sql.query(
      `INSERT INTO pain_areas (id, name, createdAt)
       VALUES ($1,$2,$3)
       ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name`,
      [String(r.id), String(r.name), strOrNull(r.createdAt) || new Date().toISOString()]
    );
  }

  // athlete_profile
  if (localProfile) {
    await sql.query(
      `INSERT INTO athlete_profile (id, restingHrBaseline, hrvBaseline, vo2MaxBaseline, sleepHoursBaseline, sourceSummaryJson, updatedAt)
       VALUES (1,$1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO UPDATE SET
         restingHrBaseline=EXCLUDED.restingHrBaseline, hrvBaseline=EXCLUDED.hrvBaseline, vo2MaxBaseline=EXCLUDED.vo2MaxBaseline,
         sleepHoursBaseline=EXCLUDED.sleepHoursBaseline, sourceSummaryJson=EXCLUDED.sourceSummaryJson, updatedAt=EXCLUDED.updatedAt`,
      [
        numOrNull(localProfile.restingHrBaseline),
        numOrNull(localProfile.hrvBaseline),
        numOrNull(localProfile.vo2MaxBaseline),
        numOrNull(localProfile.sleepHoursBaseline),
        strOrNull(localProfile.sourceSummaryJson),
        strOrNull(localProfile.updatedAt) || new Date().toISOString()
      ]
    );
  }

  // shoes
  for (const b of shoeBrands) {
    await sql.query(
      `INSERT INTO running_shoe_brands (id, name, createdAt)
       VALUES ($1,$2,$3)
       ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name`,
      [String(b.id), String(b.name), strOrNull(b.createdAt) || new Date().toISOString()]
    );
  }
  for (const s of shoes) {
    await sql.query(
      `INSERT INTO running_shoes (id, name, brand, startKm, targetKm, isDefault, active, createdAt, updatedAt)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET
         name=EXCLUDED.name, brand=EXCLUDED.brand, startKm=EXCLUDED.startKm, targetKm=EXCLUDED.targetKm,
         isDefault=EXCLUDED.isDefault, active=EXCLUDED.active, updatedAt=EXCLUDED.updatedAt`,
      [
        String(s.id),
        String(s.name),
        String(s.brand),
        Number(s.startKm ?? 0),
        Number(s.targetKm ?? 700),
        boolInt(s.isDefault) ?? 0,
        boolInt(s.active) ?? 1,
        strOrNull(s.createdAt) || new Date().toISOString(),
        strOrNull(s.updatedAt) || new Date().toISOString()
      ]
    );
  }

  // nutrition_daily_plan
  for (const r of dailyPlan) {
    await sql.query(
      `INSERT INTO nutrition_daily_plan (date, carbsG, proteinG, fatG, hydrationMl, preWorkoutNote, postWorkoutNote, rationaleJson, updatedAt)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (date) DO UPDATE SET
         carbsG=EXCLUDED.carbsG, proteinG=EXCLUDED.proteinG, fatG=EXCLUDED.fatG, hydrationMl=EXCLUDED.hydrationMl,
         preWorkoutNote=EXCLUDED.preWorkoutNote, postWorkoutNote=EXCLUDED.postWorkoutNote, rationaleJson=EXCLUDED.rationaleJson,
         updatedAt=EXCLUDED.updatedAt`,
      [
        String(r.date),
        Number(r.carbsG ?? 0),
        Number(r.proteinG ?? 0),
        Number(r.fatG ?? 0),
        Number(r.hydrationMl ?? 0),
        String(r.preWorkoutNote ?? ""),
        String(r.postWorkoutNote ?? ""),
        String(r.rationaleJson ?? "{}"),
        strOrNull(r.updatedAt) || new Date().toISOString()
      ]
    );
  }

  // nutrition_ingredients (by name)
  const localIngredientById = new Map();
  for (const r of ingredients) localIngredientById.set(String(r.id), r);

  const nameToCloudId = new Map();
  for (const r of ingredients) {
    const name = String(r.name ?? "").trim();
    if (!name) continue;
    const now = new Date().toISOString();
    const res = await sql.query(
      `INSERT INTO nutrition_ingredients
        (id, name, category, kcalPer100, proteinPer100, carbsPer100, fatPer100, defaultUnit, gramsPerUnit, isBuiltIn, createdAt, updatedAt)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (name) DO UPDATE SET
         category=EXCLUDED.category, kcalPer100=EXCLUDED.kcalPer100, proteinPer100=EXCLUDED.proteinPer100,
         carbsPer100=EXCLUDED.carbsPer100, fatPer100=EXCLUDED.fatPer100, defaultUnit=EXCLUDED.defaultUnit,
         gramsPerUnit=EXCLUDED.gramsPerUnit, updatedAt=EXCLUDED.updatedAt
       RETURNING id`,
      [
        String(r.id ?? name),
        name,
        String(r.category ?? "general"),
        Number(r.kcalPer100 ?? 0),
        Number(r.proteinPer100 ?? 0),
        Number(r.carbsPer100 ?? 0),
        Number(r.fatPer100 ?? 0),
        String(r.defaultUnit ?? "g"),
        Number(r.gramsPerUnit ?? 1),
        boolInt(r.isBuiltIn) ?? 0,
        strOrNull(r.createdAt) || now,
        strOrNull(r.updatedAt) || now
      ]
    );
    if (res?.[0]?.id) nameToCloudId.set(name, String(res[0].id));
  }
  // refresh all ingredient IDs
  const allIng = await sql.query(`SELECT id, name FROM nutrition_ingredients`, []);
  for (const row of allIng || []) nameToCloudId.set(String(row.name), String(row.id));

  function remapIngredientId(localId) {
    const local = localIngredientById.get(localId);
    const name = local?.name ? String(local.name) : null;
    if (name && nameToCloudId.has(name)) return nameToCloudId.get(name);
    return null;
  }

  // nutrition_meal_activation
  for (const row of mealActivation) {
    await sql.query(
      `INSERT INTO nutrition_meal_activation (date, mealSlot, createdAt)
       VALUES ($1,$2,$3)
       ON CONFLICT (date, mealSlot) DO UPDATE SET createdAt=EXCLUDED.createdAt`,
      [String(row.date), String(row.mealSlot ?? row.mealslot), strOrNull(row.createdAt) || new Date().toISOString()]
    );
  }

  // nutrition_meal_history
  for (const row of mealHistory) {
    const itemsRaw = (() => {
      try {
        return JSON.parse(String(row.itemsJson ?? row.itemsjson ?? "[]"));
      } catch {
        return [];
      }
    })();
    const items = Array.isArray(itemsRaw) ? itemsRaw : [];
    const remapped = items.map((it) => {
      const localId = String(it.ingredientId ?? "");
      const cloudId = remapIngredientId(localId);
      return {
        ingredientId: cloudId || localId,
        name: String(it.name ?? ""),
        grams: Number(it.grams ?? 0),
        quantity: Number(it.quantity ?? 0),
        unit: String(it.unit ?? "g"),
        kcal: Number(it.kcal ?? 0),
        proteinG: Number(it.proteinG ?? 0),
        carbsG: Number(it.carbsG ?? 0),
        fatG: Number(it.fatG ?? 0)
      };
    });

    await sql.query(
      `INSERT INTO nutrition_meal_history (id, date, mealSlot, title, itemsJson, totalKcal, proteinG, carbsG, fatG, compromiseNote, accepted, createdAt)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO UPDATE SET
         itemsJson=EXCLUDED.itemsJson, totalKcal=EXCLUDED.totalKcal, proteinG=EXCLUDED.proteinG,
         carbsG=EXCLUDED.carbsG, fatG=EXCLUDED.fatG, compromiseNote=EXCLUDED.compromiseNote, accepted=EXCLUDED.accepted`,
      [
        String(row.id),
        String(row.date),
        String(row.mealSlot ?? row.mealslot),
        String(row.title ?? ""),
        JSON.stringify(remapped),
        Number(row.totalKcal ?? row.totalkcal ?? 0),
        Number(row.proteinG ?? row.proteing ?? 0),
        Number(row.carbsG ?? row.carbsg ?? 0),
        Number(row.fatG ?? row.fatg ?? 0),
        row.compromiseNote == null ? null : String(row.compromiseNote),
        row.accepted == null ? null : boolInt(row.accepted),
        strOrNull(row.createdAt) || new Date().toISOString()
      ]
    );
  }

  // favorites
  for (const row of favorites) {
    const localIngId = String(row.ingredientId ?? row.ingredientid ?? "");
    const local = localIngredientById.get(localIngId);
    const name = local?.name ? String(local.name) : null;
    const cloudId = name ? nameToCloudId.get(name) : null;
    if (!cloudId) continue;
    const now = new Date().toISOString();
    await sql.query(
      `INSERT INTO nutrition_ingredient_favorites (ingredientId, createdAt, updatedAt)
       VALUES ($1,$2,$3)
       ON CONFLICT (ingredientId) DO UPDATE SET updatedAt=EXCLUDED.updatedAt`,
      [cloudId, now, now]
    );
  }

  // pantry items
  for (const row of pantryItems) {
    const localIngId = String(row.ingredientId ?? row.ingredientid ?? "");
    const local = localIngredientById.get(localIngId);
    const name = local?.name ? String(local.name) : null;
    const cloudId = name ? nameToCloudId.get(name) : null;
    if (!cloudId) continue;
    await sql.query(
      `INSERT INTO nutrition_pantry_items (id, date, ingredientId, quantity, unit, gramsEffective, createdAt, updatedAt)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET
         quantity=EXCLUDED.quantity, unit=EXCLUDED.unit, gramsEffective=EXCLUDED.gramsEffective, updatedAt=EXCLUDED.updatedAt`,
      [
        String(row.id),
        String(row.date),
        cloudId,
        Number(row.quantity ?? 0),
        String(row.unit ?? "g"),
        Number(row.gramsEffective ?? row.gramseffective ?? 0),
        strOrNull(row.createdAt) || new Date().toISOString(),
        strOrNull(row.updatedAt) || new Date().toISOString()
      ]
    );
  }

  // preferences
  for (const row of preferences) {
    const localIngId = String(row.ingredientId ?? row.ingredientid ?? "");
    const local = localIngredientById.get(localIngId);
    const name = local?.name ? String(local.name) : null;
    const cloudId = name ? nameToCloudId.get(name) : null;
    if (!cloudId) continue;
    await sql.query(
      `INSERT INTO nutrition_preferences (id, ingredientId, mealSlot, score, lastUsedAt)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (ingredientId, mealSlot) DO UPDATE SET score=EXCLUDED.score, lastUsedAt=EXCLUDED.lastUsedAt`,
      [String(row.id), cloudId, String(row.mealSlot ?? row.mealslot ?? "breakfast"), Number(row.score ?? 0), strOrNull(row.lastUsedAt) || new Date().toISOString()]
    );
  }

  // Workout-linked: feedback, overrides, fueling, shoe assignment -> map to cloud workouts by tolerance
  const feedbackRows = safeAll(local, "SELECT * FROM workout_feedback");
  const overrides = safeAll(local, "SELECT * FROM workout_manual_overrides");
  const fueling = safeAll(local, "SELECT * FROM workout_fueling");

  let matched = 0;
  let unmatched = 0;
  const localToCloud = new Map();

  async function mapWorkoutId(localWorkoutId) {
    if (localToCloud.has(localWorkoutId)) return localToCloud.get(localWorkoutId);
    const localWorkout = localWorkoutsById.get(localWorkoutId);
    if (!localWorkout) return null;
    const cloudId = await findCloudWorkoutMatch(sql, localWorkout);
    if (cloudId) localToCloud.set(localWorkoutId, cloudId);
    return cloudId;
  }

  for (const row of feedbackRows) {
    const localWorkoutId = String(row.workoutId ?? row.workoutid ?? "");
    const cloudWorkoutId = await mapWorkoutId(localWorkoutId);
    if (!cloudWorkoutId) {
      unmatched += 1;
      continue;
    }
    matched += 1;
    const updatedAt = strOrNull(row.updatedAt) || new Date().toISOString();
    await sql.query(
      `INSERT INTO workout_feedback (
        workoutId, date, sport, perceivedEffort, bodyFeel, breathingFeel,
        rpeScore, legsLoadScore, painScore, painArea, addFiveKmScore, recoveryScore,
        breathingScore, overallLoadScore, preRunNutritionScore, environmentScore, satisfactionScore,
        openNote, fuelingSource, fuelingQuantity,
        strengthTechniqueScore, strengthFailureProximityScore, strengthFocusArea,
        strengthEffortScore, strengthMuscleLoadScore, strengthPainScore, strengthRecoveryScore,
        strengthPainArea, strengthOpenNote,
        updatedAt
      ) VALUES (
        $1,$2,$3,$4,$5,$6,
        $7,$8,$9,$10,$11,$12,
        $13,$14,$15,$16,$17,
        $18,$19,$20,
        $21,$22,$23,
        $24,$25,$26,$27,
        $28,$29,
        $30
      )
      ON CONFLICT (workoutId) DO UPDATE SET
        date=EXCLUDED.date, sport=EXCLUDED.sport,
        perceivedEffort=EXCLUDED.perceivedEffort, bodyFeel=EXCLUDED.bodyFeel, breathingFeel=EXCLUDED.breathingFeel,
        rpeScore=EXCLUDED.rpeScore, legsLoadScore=EXCLUDED.legsLoadScore, painScore=EXCLUDED.painScore, painArea=EXCLUDED.painArea,
        addFiveKmScore=EXCLUDED.addFiveKmScore, recoveryScore=EXCLUDED.recoveryScore, breathingScore=EXCLUDED.breathingScore, overallLoadScore=EXCLUDED.overallLoadScore,
        preRunNutritionScore=EXCLUDED.preRunNutritionScore, environmentScore=EXCLUDED.environmentScore, satisfactionScore=EXCLUDED.satisfactionScore,
        openNote=EXCLUDED.openNote, fuelingSource=EXCLUDED.fuelingSource, fuelingQuantity=EXCLUDED.fuelingQuantity,
        strengthTechniqueScore=EXCLUDED.strengthTechniqueScore, strengthFailureProximityScore=EXCLUDED.strengthFailureProximityScore, strengthFocusArea=EXCLUDED.strengthFocusArea,
        strengthEffortScore=EXCLUDED.strengthEffortScore, strengthMuscleLoadScore=EXCLUDED.strengthMuscleLoadScore, strengthPainScore=EXCLUDED.strengthPainScore, strengthRecoveryScore=EXCLUDED.strengthRecoveryScore,
        strengthPainArea=EXCLUDED.strengthPainArea, strengthOpenNote=EXCLUDED.strengthOpenNote,
        updatedAt=EXCLUDED.updatedAt`,
      [
        cloudWorkoutId,
        String(row.date),
        String(row.sport),
        strOrNull(row.perceivedEffort),
        strOrNull(row.bodyFeel),
        strOrNull(row.breathingFeel),
        row.rpeScore == null ? null : Number(row.rpeScore),
        row.legsLoadScore == null ? null : Number(row.legsLoadScore),
        row.painScore == null ? null : Number(row.painScore),
        strOrNull(row.painArea),
        row.addFiveKmScore == null ? null : Number(row.addFiveKmScore),
        row.recoveryScore == null ? null : Number(row.recoveryScore),
        row.breathingScore == null ? null : Number(row.breathingScore),
        row.overallLoadScore == null ? null : Number(row.overallLoadScore),
        row.preRunNutritionScore == null ? null : Number(row.preRunNutritionScore),
        row.environmentScore == null ? null : Number(row.environmentScore),
        row.satisfactionScore == null ? null : Number(row.satisfactionScore),
        strOrNull(row.openNote),
        strOrNull(row.fuelingSource),
        row.fuelingQuantity == null ? null : Number(row.fuelingQuantity),
        row.strengthTechniqueScore == null ? null : Number(row.strengthTechniqueScore),
        row.strengthFailureProximityScore == null ? null : Number(row.strengthFailureProximityScore),
        strOrNull(row.strengthFocusArea),
        row.strengthEffortScore == null ? null : Number(row.strengthEffortScore),
        row.strengthMuscleLoadScore == null ? null : Number(row.strengthMuscleLoadScore),
        row.strengthPainScore == null ? null : Number(row.strengthPainScore),
        row.strengthRecoveryScore == null ? null : Number(row.strengthRecoveryScore),
        strOrNull(row.strengthPainArea),
        strOrNull(row.strengthOpenNote),
        updatedAt
      ]
    );
  }

  for (const row of overrides) {
    const localWorkoutId = String(row.workoutId ?? row.workoutid ?? "");
    const cloudWorkoutId = await mapWorkoutId(localWorkoutId);
    if (!cloudWorkoutId) continue;
    await sql.query(
      `INSERT INTO workout_manual_overrides (workoutId, officialDurationSec, updatedAt)
       VALUES ($1,$2,$3)
       ON CONFLICT (workoutId) DO UPDATE SET officialDurationSec=EXCLUDED.officialDurationSec, updatedAt=EXCLUDED.updatedAt`,
      [cloudWorkoutId, row.officialDurationSec == null ? null : Number(row.officialDurationSec), strOrNull(row.updatedAt) || new Date().toISOString()]
    );
  }

  for (const row of fueling) {
    const localWorkoutId = String(row.workoutId ?? row.workoutid ?? "");
    const cloudWorkoutId = await mapWorkoutId(localWorkoutId);
    if (!cloudWorkoutId) continue;
    await sql.query(
      `INSERT INTO workout_fueling (id, workoutId, itemName, quantity, unitLabel, carbsG, kcal, caffeineMg, notes, createdAt, updatedAt)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO UPDATE SET
         workoutId=EXCLUDED.workoutId, itemName=EXCLUDED.itemName, quantity=EXCLUDED.quantity, unitLabel=EXCLUDED.unitLabel,
         carbsG=EXCLUDED.carbsG, kcal=EXCLUDED.kcal, caffeineMg=EXCLUDED.caffeineMg, notes=EXCLUDED.notes, updatedAt=EXCLUDED.updatedAt`,
      [
        String(row.id),
        cloudWorkoutId,
        String(row.itemName ?? ""),
        Number(row.quantity ?? 0),
        String(row.unitLabel ?? ""),
        Number(row.carbsG ?? 0),
        row.kcal == null ? null : Number(row.kcal),
        row.caffeineMg == null ? null : Number(row.caffeineMg),
        strOrNull(row.notes),
        strOrNull(row.createdAt) || new Date().toISOString(),
        strOrNull(row.updatedAt) || new Date().toISOString()
      ]
    );
  }

  // Shoe assignments for matched cloud workouts: set only if empty.
  for (const w of localWorkouts) {
    const shoeId = strOrNull(w.shoeId);
    if (!shoeId) continue;
    const cloudId = await findCloudWorkoutMatch(sql, w);
    if (!cloudId) continue;
    const shoeKmAtAssign = w.shoeKmAtAssign == null ? null : Number(w.shoeKmAtAssign);
    await sql.query(`UPDATE workouts SET shoeId = COALESCE(shoeId, $1), shoeKmAtAssign = COALESCE(shoeKmAtAssign, $2) WHERE id = $3`, [
      shoeId,
      shoeKmAtAssign,
      cloudId
    ]);
  }

  console.log(`Workout-linked migration: feedback matched=${matched} unmatched=${unmatched}`);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
