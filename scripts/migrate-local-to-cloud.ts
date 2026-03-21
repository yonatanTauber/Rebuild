import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { loadEnvConfig } from "@next/env";
import { migrateDb } from "@/lib/db-migrate";
import { dbExec, dbQuery } from "@/lib/db-driver";

type AnyRow = Record<string, any>;
type SqliteDb = any;

function sqlitePath() {
  return path.join(process.cwd(), "data", "rebuild.db");
}

function openLocalSqlite() {
  const p = sqlitePath();
  if (!fs.existsSync(p)) {
    throw new Error(`Local DB not found at ${p}`);
  }
  return new Database(p);
}

function hasTable(db: SqliteDb, name: string) {
  const row = db
    .prepare("SELECT 1 as ok FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1")
    .get(name) as { ok?: number } | undefined;
  return Boolean(row?.ok);
}

function safeAll<T extends AnyRow = AnyRow>(db: SqliteDb, sql: string) {
  try {
    return db.prepare(sql).all() as T[];
  } catch {
    return [] as T[];
  }
}

function isoOrNull(value: any) {
  if (value == null) return null;
  const s = String(value);
  return s;
}

function numOrNull(value: any) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function strOrNull(value: any) {
  if (value == null) return null;
  const s = String(value);
  return s.length ? s : null;
}

function boolInt(value: any) {
  if (value == null) return 0;
  if (typeof value === "boolean") return value ? 1 : 0;
  const n = Number(value);
  return Number.isFinite(n) && n !== 0 ? 1 : 0;
}

function parseIsoMs(iso: string) {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

function withinTolerance(local: AnyRow, cloud: AnyRow) {
  const localStart = parseIsoMs(String(local.startAt));
  const cloudStart = parseIsoMs(String(cloud.startAt));
  const startDiffSec = Math.abs(localStart - cloudStart) / 1000;
  if (startDiffSec > 10800) return false;

  const d1 = Number(local.durationSec ?? 0);
  const d2 = Number(cloud.durationSec ?? 0);
  const durTol = Math.max(420, d1 * 0.18);
  if (Math.abs(d1 - d2) > durTol) return false;

  const dist1 = local.distanceM == null ? null : Number(local.distanceM);
  const dist2 = cloud.distanceM == null ? null : Number(cloud.distanceM);
  if (dist1 != null && dist2 != null) {
    const distTol = Math.max(1200, dist1 * 0.15);
    if (Math.abs(dist1 - dist2) > distTol) return false;
  }

  return true;
}

async function findCloudWorkoutMatch(localWorkout: AnyRow) {
  const startIso = String(localWorkout.startAt);
  const startMs = parseIsoMs(startIso);
  if (!startMs) return null;
  const from = new Date(startMs - 3 * 3600 * 1000).toISOString();
  const to = new Date(startMs + 3 * 3600 * 1000).toISOString();
  const sport = String(localWorkout.sport ?? "");

  const candidates = await dbQuery<AnyRow>(
    `
    SELECT id, sport, startAt, durationSec, distanceM
    FROM workouts
    WHERE sport = $1 AND startAt >= $2 AND startAt <= $3
    ORDER BY startAt ASC
    `,
    [sport, from, to]
  );
  const list = candidates.rows.filter((row) => withinTolerance(localWorkout, row));
  if (!list.length) return null;

  function score(row: AnyRow) {
    const startDiffMin = Math.abs(parseIsoMs(String(row.startAt)) - startMs) / 1000 / 60;
    const durDiffMin = Math.abs(Number(row.durationSec ?? 0) - Number(localWorkout.durationSec ?? 0)) / 60;
    const distDiffKm =
      localWorkout.distanceM == null || row.distanceM == null
        ? 0
        : Math.abs(Number(row.distanceM) - Number(localWorkout.distanceM)) / 1000;
    return startDiffMin * 1.4 + durDiffMin * 1.0 + distDiffKm * 0.8;
  }

  const best = [...list].sort((a, b) => score(a) - score(b))[0];
  return best?.id ? String(best.id) : null;
}

async function upsertDailyRecovery(rows: AnyRow[]) {
  for (const r of rows) {
    await dbQuery(
      `
      INSERT INTO daily_recovery
        (date, rpe, sleepHours, sleepQuality, hrv, restingHr, mood, sorenessGlobal, sorenessByArea, notes)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
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
      `,
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
}

async function upsertDailyCheckinProgress(rows: AnyRow[]) {
  for (const r of rows) {
    await dbQuery(
      `
      INSERT INTO daily_checkin_progress
        (date, exertion, sleep, hrv, restingHr, mood, sorenessLevel, painAreasJson, lastStep, updatedAt)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (date) DO UPDATE SET
        exertion = EXCLUDED.exertion,
        sleep = EXCLUDED.sleep,
        hrv = EXCLUDED.hrv,
        restingHr = EXCLUDED.restingHr,
        mood = EXCLUDED.mood,
        sorenessLevel = EXCLUDED.sorenessLevel,
        painAreasJson = EXCLUDED.painAreasJson,
        lastStep = EXCLUDED.lastStep,
        updatedAt = EXCLUDED.updatedAt
      `,
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
        isoOrNull(r.updatedAt) ?? new Date().toISOString()
      ]
    );
  }
}

async function upsertPainAreas(rows: AnyRow[]) {
  for (const r of rows) {
    await dbQuery(
      `
      INSERT INTO pain_areas (id, name, createdAt)
      VALUES ($1,$2,$3)
      ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
      `,
      [String(r.id), String(r.name), isoOrNull(r.createdAt) ?? new Date().toISOString()]
    );
  }
}

async function upsertAthleteProfile(row: AnyRow | null) {
  if (!row) return;
  await dbQuery(
    `
    INSERT INTO athlete_profile (id, restingHrBaseline, hrvBaseline, sleepHoursBaseline, sourceSummaryJson, updatedAt)
    VALUES (1,$1,$2,$3,$4,$5)
    ON CONFLICT (id) DO UPDATE SET
      restingHrBaseline = EXCLUDED.restingHrBaseline,
      hrvBaseline = EXCLUDED.hrvBaseline,
      sleepHoursBaseline = EXCLUDED.sleepHoursBaseline,
      sourceSummaryJson = EXCLUDED.sourceSummaryJson,
      updatedAt = EXCLUDED.updatedAt
    `,
    [
      numOrNull(row.restingHrBaseline),
      numOrNull(row.hrvBaseline),
      numOrNull(row.sleepHoursBaseline),
      strOrNull(row.sourceSummaryJson),
      isoOrNull(row.updatedAt) ?? new Date().toISOString()
    ]
  );
}

async function upsertShoes(brands: AnyRow[], shoes: AnyRow[]) {
  for (const b of brands) {
    await dbQuery(
      `
      INSERT INTO running_shoe_brands (id, name, createdAt)
      VALUES ($1,$2,$3)
      ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
      `,
      [String(b.id), String(b.name), isoOrNull(b.createdAt) ?? new Date().toISOString()]
    );
  }

  for (const s of shoes) {
    await dbQuery(
      `
      INSERT INTO running_shoes (id, name, brand, startKm, targetKm, isDefault, active, createdAt, updatedAt)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        brand = EXCLUDED.brand,
        startKm = EXCLUDED.startKm,
        targetKm = EXCLUDED.targetKm,
        isDefault = EXCLUDED.isDefault,
        active = EXCLUDED.active,
        updatedAt = EXCLUDED.updatedAt
      `,
      [
        String(s.id),
        String(s.name),
        String(s.brand),
        Number(s.startKm ?? 0),
        Number(s.targetKm ?? 700),
        boolInt(s.isDefault),
        boolInt(s.active),
        isoOrNull(s.createdAt) ?? new Date().toISOString(),
        isoOrNull(s.updatedAt) ?? new Date().toISOString()
      ]
    );
  }
}

async function upsertNutritionDailyPlan(rows: AnyRow[]) {
  for (const r of rows) {
    await dbQuery(
      `
      INSERT INTO nutrition_daily_plan
        (date, carbsG, proteinG, fatG, hydrationMl, preWorkoutNote, postWorkoutNote, rationaleJson, updatedAt)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (date) DO UPDATE SET
        carbsG = EXCLUDED.carbsG,
        proteinG = EXCLUDED.proteinG,
        fatG = EXCLUDED.fatG,
        hydrationMl = EXCLUDED.hydrationMl,
        preWorkoutNote = EXCLUDED.preWorkoutNote,
        postWorkoutNote = EXCLUDED.postWorkoutNote,
        rationaleJson = EXCLUDED.rationaleJson,
        updatedAt = EXCLUDED.updatedAt
      `,
      [
        String(r.date),
        Number(r.carbsG ?? 0),
        Number(r.proteinG ?? 0),
        Number(r.fatG ?? 0),
        Number(r.hydrationMl ?? 0),
        String(r.preWorkoutNote ?? ""),
        String(r.postWorkoutNote ?? ""),
        String(r.rationaleJson ?? "{}"),
        isoOrNull(r.updatedAt) ?? new Date().toISOString()
      ]
    );
  }
}

async function upsertNutritionIngredients(rows: AnyRow[]) {
  // Only insert/update by name; IDs differ between local/cloud.
  const nameToCloudId = new Map<string, string>();

  for (const r of rows) {
    const name = String(r.name ?? "").trim();
    if (!name) continue;
    const now = new Date().toISOString();
    const res = await dbQuery<{ id: string }>(
      `
      INSERT INTO nutrition_ingredients
        (id, name, category, kcalPer100, proteinPer100, carbsPer100, fatPer100, defaultUnit, gramsPerUnit, isBuiltIn, createdAt, updatedAt)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (name) DO UPDATE SET
        category = EXCLUDED.category,
        kcalPer100 = EXCLUDED.kcalPer100,
        proteinPer100 = EXCLUDED.proteinPer100,
        carbsPer100 = EXCLUDED.carbsPer100,
        fatPer100 = EXCLUDED.fatPer100,
        defaultUnit = EXCLUDED.defaultUnit,
        gramsPerUnit = EXCLUDED.gramsPerUnit,
        updatedAt = EXCLUDED.updatedAt
      RETURNING id
      `,
      [
        // keep stable ID if local has one; otherwise generate deterministic-ish by reusing name hash is overkill.
        String(r.id ?? name),
        name,
        String(r.category ?? "general"),
        Number(r.kcalPer100 ?? 0),
        Number(r.proteinPer100 ?? 0),
        Number(r.carbsPer100 ?? 0),
        Number(r.fatPer100 ?? 0),
        String(r.defaultUnit ?? "g"),
        Number(r.gramsPerUnit ?? 1),
        boolInt(r.isBuiltIn),
        isoOrNull(r.createdAt) ?? now,
        isoOrNull(r.updatedAt) ?? now
      ]
    );
    const id = res.rows[0]?.id ? String(res.rows[0].id) : null;
    if (id) nameToCloudId.set(name, id);
  }

  // Refresh from DB to ensure we have IDs for built-ins, too.
  const all = await dbQuery<{ id: string; name: string }>("SELECT id, name FROM nutrition_ingredients", []);
  for (const r of all.rows) {
    nameToCloudId.set(String((r as any).name), String((r as any).id));
  }

  return nameToCloudId;
}

async function overwriteNutritionTables(input: {
  mealActivation: AnyRow[];
  mealHistory: AnyRow[];
  favorites: AnyRow[];
  pantryItems: AnyRow[];
  preferences: AnyRow[];
  nameToCloudId: Map<string, string>;
  localIngredientById: Map<string, AnyRow>;
}) {
  for (const row of input.mealActivation) {
    await dbQuery(
      `
      INSERT INTO nutrition_meal_activation (date, mealSlot, createdAt)
      VALUES ($1,$2,$3)
      ON CONFLICT (date, mealSlot) DO UPDATE SET createdAt = EXCLUDED.createdAt
      `,
      [String(row.date), String(row.mealSlot ?? row.mealslot), isoOrNull(row.createdAt) ?? new Date().toISOString()]
    );
  }

  function remapIngredientId(localId: string) {
    const local = input.localIngredientById.get(localId);
    const name = local?.name ? String(local.name) : null;
    if (name && input.nameToCloudId.has(name)) return input.nameToCloudId.get(name)!;
    return null;
  }

  function computeTotals(items: any[]) {
    let kcal = 0;
    let p = 0;
    let c = 0;
    let f = 0;
    for (const it of items) {
      kcal += Number(it.kcal ?? 0);
      p += Number(it.proteinG ?? 0);
      c += Number(it.carbsG ?? 0);
      f += Number(it.fatG ?? 0);
    }
    return {
      totalKcal: Math.round(kcal),
      proteinG: Math.round(p * 10) / 10,
      carbsG: Math.round(c * 10) / 10,
      fatG: Math.round(f * 10) / 10
    };
  }

  for (const row of input.mealHistory) {
    const date = String(row.date);
    const slot = String(row.mealSlot ?? row.mealslot);
    const title = String(row.title ?? "");
    const createdAt = isoOrNull(row.createdAt) ?? new Date().toISOString();
    const accepted = row.accepted == null ? null : boolInt(row.accepted);
    const compromiseNote = row.compromiseNote ?? row.compromisenote ?? null;

    const itemsRaw = (() => {
      try {
        return JSON.parse(String(row.itemsJson ?? row.itemsjson ?? "[]"));
      } catch {
        return [];
      }
    })();

    const items = Array.isArray(itemsRaw) ? itemsRaw : [];
    const remapped: any[] = [];
    for (const it of items) {
      const localId = String(it.ingredientId ?? "");
      const cloudId = remapIngredientId(localId);
      const name = String(it.name ?? "");
      remapped.push({
        ingredientId: cloudId ?? localId,
        name,
        grams: Number(it.grams ?? 0),
        quantity: Number(it.quantity ?? 0),
        unit: String(it.unit ?? "g"),
        kcal: Number(it.kcal ?? 0),
        proteinG: Number(it.proteinG ?? 0),
        carbsG: Number(it.carbsG ?? 0),
        fatG: Number(it.fatG ?? 0)
      });
    }

    const totals = computeTotals(remapped);

    await dbQuery(
      `
      INSERT INTO nutrition_meal_history
        (id, date, mealSlot, title, itemsJson, totalKcal, proteinG, carbsG, fatG, compromiseNote, accepted, createdAt)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (id) DO UPDATE SET
        itemsJson = EXCLUDED.itemsJson,
        totalKcal = EXCLUDED.totalKcal,
        proteinG = EXCLUDED.proteinG,
        carbsG = EXCLUDED.carbsG,
        fatG = EXCLUDED.fatG,
        compromiseNote = EXCLUDED.compromiseNote,
        accepted = EXCLUDED.accepted
      `,
      [
        String(row.id),
        date,
        slot,
        title,
        JSON.stringify(remapped),
        totals.totalKcal,
        totals.proteinG,
        totals.carbsG,
        totals.fatG,
        compromiseNote == null ? null : String(compromiseNote),
        accepted,
        createdAt
      ]
    );
  }

  for (const row of input.favorites) {
    const localIngId = String(row.ingredientId ?? row.ingredientid ?? "");
    const local = input.localIngredientById.get(localIngId);
    const name = local?.name ? String(local.name) : null;
    const cloudId = name ? input.nameToCloudId.get(name) : null;
    if (!cloudId) continue;
    const now = new Date().toISOString();
    await dbQuery(
      `
      INSERT INTO nutrition_ingredient_favorites (ingredientId, createdAt, updatedAt)
      VALUES ($1,$2,$3)
      ON CONFLICT (ingredientId) DO UPDATE SET updatedAt = EXCLUDED.updatedAt
      `,
      [cloudId, now, now]
    );
  }

  for (const row of input.pantryItems) {
    const localIngId = String(row.ingredientId ?? row.ingredientid ?? "");
    const local = input.localIngredientById.get(localIngId);
    const name = local?.name ? String(local.name) : null;
    const cloudId = name ? input.nameToCloudId.get(name) : null;
    if (!cloudId) continue;
    await dbQuery(
      `
      INSERT INTO nutrition_pantry_items
        (id, date, ingredientId, quantity, unit, gramsEffective, createdAt, updatedAt)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (id) DO UPDATE SET
        quantity = EXCLUDED.quantity,
        unit = EXCLUDED.unit,
        gramsEffective = EXCLUDED.gramsEffective,
        updatedAt = EXCLUDED.updatedAt
      `,
      [
        String(row.id),
        String(row.date),
        cloudId,
        Number(row.quantity ?? 0),
        String(row.unit ?? "g"),
        Number(row.gramsEffective ?? row.gramseffective ?? 0),
        isoOrNull(row.createdAt) ?? new Date().toISOString(),
        isoOrNull(row.updatedAt) ?? new Date().toISOString()
      ]
    );
  }

  for (const row of input.preferences) {
    const localIngId = String(row.ingredientId ?? row.ingredientid ?? "");
    const local = input.localIngredientById.get(localIngId);
    const name = local?.name ? String(local.name) : null;
    const cloudId = name ? input.nameToCloudId.get(name) : null;
    if (!cloudId) continue;
    await dbQuery(
      `
      INSERT INTO nutrition_preferences (id, ingredientId, mealSlot, score, lastUsedAt)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (ingredientId, mealSlot) DO UPDATE SET
        score = EXCLUDED.score,
        lastUsedAt = EXCLUDED.lastUsedAt
      `,
      [
        String(row.id),
        cloudId,
        String(row.mealSlot ?? row.mealslot ?? "breakfast"),
        Number(row.score ?? 0),
        isoOrNull(row.lastUsedAt) ?? new Date().toISOString()
      ]
    );
  }
}

async function migrateWorkoutLinkedTables(input: {
  localDb: SqliteDb;
  localWorkoutsById: Map<string, AnyRow>;
  shoeIdByCloudWorkoutId: Map<string, { shoeId: string; shoeKmAtAssign: number | null }>;
}) {
  if (!hasTable(input.localDb, "workout_feedback")) return { matched: 0, unmatched: 0 };

  // Pull cloud workouts once per sport/date-range would be faster, but this is fine for one-time migration.
  const feedbackRows = safeAll<AnyRow>(input.localDb, "SELECT * FROM workout_feedback");
  const overrides = hasTable(input.localDb, "workout_manual_overrides")
    ? safeAll<AnyRow>(input.localDb, "SELECT * FROM workout_manual_overrides")
    : [];
  const fueling = hasTable(input.localDb, "workout_fueling") ? safeAll<AnyRow>(input.localDb, "SELECT * FROM workout_fueling") : [];

  let matched = 0;
  let unmatched = 0;

  const localToCloud = new Map<string, string>();

  async function mapWorkoutId(localWorkoutId: string) {
    if (localToCloud.has(localWorkoutId)) return localToCloud.get(localWorkoutId) ?? null;
    const localWorkout = input.localWorkoutsById.get(localWorkoutId);
    if (!localWorkout) return null;
    const cloudId = await findCloudWorkoutMatch(localWorkout);
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
    const updatedAt = isoOrNull(row.updatedAt) ?? new Date().toISOString();
    await dbQuery(
      `
      INSERT INTO workout_feedback (
        workoutId, date, sport,
        perceivedEffort, bodyFeel, breathingFeel,
        rpeScore, legsLoadScore, painScore, painArea,
        addFiveKmScore, recoveryScore, breathingScore, overallLoadScore,
        preRunNutritionScore, environmentScore, satisfactionScore,
        strengthTechniqueScore, strengthFailureProximityScore, strengthFocusArea,
        strengthEffortScore, strengthMuscleLoadScore, strengthPainScore, strengthRecoveryScore,
        strengthPainArea, strengthOpenNote,
        openNote, fuelingSource, fuelingQuantity,
        updatedAt
      ) VALUES (
        $1,$2,$3,
        $4,$5,$6,
        $7,$8,$9,$10,
        $11,$12,$13,$14,
        $15,$16,$17,
        $18,$19,$20,
        $21,$22,$23,$24,
        $25,$26,
        $27,$28,$29,
        $30
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
        strengthTechniqueScore = EXCLUDED.strengthTechniqueScore,
        strengthFailureProximityScore = EXCLUDED.strengthFailureProximityScore,
        strengthFocusArea = EXCLUDED.strengthFocusArea,
        strengthEffortScore = EXCLUDED.strengthEffortScore,
        strengthMuscleLoadScore = EXCLUDED.strengthMuscleLoadScore,
        strengthPainScore = EXCLUDED.strengthPainScore,
        strengthRecoveryScore = EXCLUDED.strengthRecoveryScore,
        strengthPainArea = EXCLUDED.strengthPainArea,
        strengthOpenNote = EXCLUDED.strengthOpenNote,
        openNote = EXCLUDED.openNote,
        fuelingSource = EXCLUDED.fuelingSource,
        fuelingQuantity = EXCLUDED.fuelingQuantity,
        updatedAt = EXCLUDED.updatedAt
      `,
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
        row.strengthTechniqueScore == null ? null : Number(row.strengthTechniqueScore),
        row.strengthFailureProximityScore == null ? null : Number(row.strengthFailureProximityScore),
        strOrNull(row.strengthFocusArea),
        row.strengthEffortScore == null ? null : Number(row.strengthEffortScore),
        row.strengthMuscleLoadScore == null ? null : Number(row.strengthMuscleLoadScore),
        row.strengthPainScore == null ? null : Number(row.strengthPainScore),
        row.strengthRecoveryScore == null ? null : Number(row.strengthRecoveryScore),
        strOrNull(row.strengthPainArea),
        strOrNull(row.strengthOpenNote),
        strOrNull(row.openNote),
        strOrNull(row.fuelingSource),
        row.fuelingQuantity == null ? null : Number(row.fuelingQuantity),
        updatedAt
      ]
    );
  }

  for (const row of overrides) {
    const localWorkoutId = String(row.workoutId ?? row.workoutid ?? "");
    const cloudWorkoutId = await mapWorkoutId(localWorkoutId);
    if (!cloudWorkoutId) continue;
    await dbQuery(
      `
      INSERT INTO workout_manual_overrides (workoutId, officialDurationSec, updatedAt)
      VALUES ($1,$2,$3)
      ON CONFLICT (workoutId) DO UPDATE SET
        officialDurationSec = EXCLUDED.officialDurationSec,
        updatedAt = EXCLUDED.updatedAt
      `,
      [cloudWorkoutId, row.officialDurationSec == null ? null : Number(row.officialDurationSec), isoOrNull(row.updatedAt) ?? new Date().toISOString()]
    );
  }

  for (const row of fueling) {
    const localWorkoutId = String(row.workoutId ?? row.workoutid ?? "");
    const cloudWorkoutId = await mapWorkoutId(localWorkoutId);
    if (!cloudWorkoutId) continue;
    await dbQuery(
      `
      INSERT INTO workout_fueling
        (id, workoutId, itemName, quantity, unitLabel, carbsG, kcal, caffeineMg, notes, createdAt, updatedAt)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (id) DO UPDATE SET
        workoutId = EXCLUDED.workoutId,
        itemName = EXCLUDED.itemName,
        quantity = EXCLUDED.quantity,
        unitLabel = EXCLUDED.unitLabel,
        carbsG = EXCLUDED.carbsG,
        kcal = EXCLUDED.kcal,
        caffeineMg = EXCLUDED.caffeineMg,
        notes = EXCLUDED.notes,
        updatedAt = EXCLUDED.updatedAt
      `,
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
        isoOrNull(row.createdAt) ?? new Date().toISOString(),
        isoOrNull(row.updatedAt) ?? new Date().toISOString()
      ]
    );
  }

  // Shoe assignments: set on cloud workouts if empty (best-effort).
  for (const [cloudWorkoutId, shoe] of input.shoeIdByCloudWorkoutId.entries()) {
    await dbQuery(
      `UPDATE workouts SET shoeId = COALESCE(shoeId, $1), shoeKmAtAssign = COALESCE(shoeKmAtAssign, $2) WHERE id = $3`,
      [shoe.shoeId, shoe.shoeKmAtAssign, cloudWorkoutId]
    );
  }

  return { matched, unmatched };
}

async function upsertRulesAndPlans(localDb: SqliteDb) {
  const tables = ["logic_rules", "weekly_plan", "forecast_overrides", "forecast_feedback"] as const;
  for (const t of tables) {
    if (!hasTable(localDb, t)) continue;
    const rows = safeAll<AnyRow>(localDb, `SELECT * FROM ${t}`);
    if (!rows.length) continue;
    for (const r of rows) {
      const keys = Object.keys(r);
      const cols = keys.join(", ");
      const params = keys.map((_, idx) => `$${idx + 1}`).join(", ");
      const values = keys.map((k) => (r as any)[k]);
      // Best-effort merge; if schema doesn't have constraints we may duplicate.
      await dbQuery(`INSERT INTO ${t} (${cols}) VALUES (${params})`, values);
    }
  }
}

async function main() {
  // Load .env.local (DATABASE_URL) for local one-time migration runs.
  loadEnvConfig(process.cwd(), true);

  // Force postgres provider for this script.
  process.env.REBUILD_DB_PROVIDER = "postgres";

  const local = openLocalSqlite();
  console.log(`Local: ${sqlitePath()}`);

  await migrateDb();
  console.log("Cloud schema ensured.");

  const localRecovery = hasTable(local, "daily_recovery") ? safeAll(local, "SELECT * FROM daily_recovery") : [];
  const localProgress = hasTable(local, "daily_checkin_progress")
    ? safeAll(local, "SELECT * FROM daily_checkin_progress")
    : [];
  const localPainAreas = hasTable(local, "pain_areas") ? safeAll(local, "SELECT * FROM pain_areas") : [];
  const localProfile = hasTable(local, "athlete_profile")
    ? (local.prepare("SELECT * FROM athlete_profile WHERE id = 1 LIMIT 1").get() as AnyRow | undefined) ?? null
    : null;

  const shoeBrands = hasTable(local, "running_shoe_brands") ? safeAll(local, "SELECT * FROM running_shoe_brands") : [];
  const shoes = hasTable(local, "running_shoes") ? safeAll(local, "SELECT * FROM running_shoes") : [];

  const dailyPlan = hasTable(local, "nutrition_daily_plan") ? safeAll(local, "SELECT * FROM nutrition_daily_plan") : [];
  const ingredients = hasTable(local, "nutrition_ingredients") ? safeAll(local, "SELECT * FROM nutrition_ingredients") : [];
  const mealActivation = hasTable(local, "nutrition_meal_activation")
    ? safeAll(local, "SELECT * FROM nutrition_meal_activation")
    : [];
  const mealHistory = hasTable(local, "nutrition_meal_history") ? safeAll(local, "SELECT * FROM nutrition_meal_history") : [];
  const favorites = hasTable(local, "nutrition_ingredient_favorites")
    ? safeAll(local, "SELECT * FROM nutrition_ingredient_favorites")
    : [];
  const pantryItems = hasTable(local, "nutrition_pantry_items") ? safeAll(local, "SELECT * FROM nutrition_pantry_items") : [];
  const preferences = hasTable(local, "nutrition_preferences") ? safeAll(local, "SELECT * FROM nutrition_preferences") : [];

  // Workouts (for mapping feedback/overrides/fueling/shoes).
  const localWorkouts = hasTable(local, "workouts") ? safeAll(local, "SELECT * FROM workouts") : [];
  const localWorkoutsById = new Map(localWorkouts.map((w) => [String(w.id), w]));

  // Prepare shoe assignment mapping (best-effort) by matching workouts to cloud.
  const shoeIdByCloudWorkoutId = new Map<string, { shoeId: string; shoeKmAtAssign: number | null }>();
  for (const w of localWorkouts) {
    const shoeId = strOrNull(w.shoeId);
    if (!shoeId) continue;
    const cloudId = await findCloudWorkoutMatch(w);
    if (!cloudId) continue;
    shoeIdByCloudWorkoutId.set(cloudId, {
      shoeId,
      shoeKmAtAssign: w.shoeKmAtAssign == null ? null : Number(w.shoeKmAtAssign)
    });
  }

  console.log("Migrating daily recovery...");
  await upsertDailyRecovery(localRecovery);

  console.log("Migrating daily check-in progress...");
  await upsertDailyCheckinProgress(localProgress);

  console.log("Migrating pain areas...");
  await upsertPainAreas(localPainAreas);

  console.log("Migrating athlete profile...");
  await upsertAthleteProfile(localProfile);

  console.log("Migrating shoes...");
  await upsertShoes(shoeBrands, shoes);

  console.log("Migrating nutrition daily plans...");
  await upsertNutritionDailyPlan(dailyPlan);

  const localIngredientById = new Map<string, AnyRow>();
  for (const r of ingredients) localIngredientById.set(String(r.id), r);

  console.log("Migrating nutrition ingredients...");
  const nameToCloudId = await upsertNutritionIngredients(ingredients);

  console.log("Migrating nutrition meals/pantry/favorites...");
  await overwriteNutritionTables({
    mealActivation,
    mealHistory,
    favorites,
    pantryItems,
    preferences,
    nameToCloudId,
    localIngredientById
  });

  console.log("Migrating workout-linked data (feedback/overrides/fueling/shoe assignments)...");
  const linkRes = await migrateWorkoutLinkedTables({ localDb: local, localWorkoutsById, shoeIdByCloudWorkoutId });
  console.log(`Workout feedback matched=${linkRes.matched} unmatched=${linkRes.unmatched}`);

  console.log("Migrating weekly/forecast/logic tables...");
  await upsertRulesAndPlans(local);

  console.log("Done. Cloud should now include your previous local data.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
