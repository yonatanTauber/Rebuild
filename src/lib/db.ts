import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { addDaysISO, formatISODate, isSaturdayISO, startOfTrainingWeekISO } from "@/lib/date";
import { normalizeNutritionUnit, nutritionQuantityToGrams } from "@/lib/nutrition-units";
import type {
  AthleteProfile,
  DailyRecovery,
  LogicRules,
  MealSlot,
  NutritionDailyPlan,
  NutritionIngredient,
  NutritionIngredientCategory,
  NutritionMeal,
  NutritionPantryItem,
  NutritionUnit,
  RunningShoe,
  RunningShoeBrand,
  TopEffort,
  Workout,
  WorkoutFuelingEntry
} from "@/lib/types";

const bundledDataDir = path.join(process.cwd(), "data");
const isVercelRuntime = process.env.VERCEL === "1";
const runtimeDataDir = isVercelRuntime ? path.join("/tmp", "rebuild-data") : bundledDataDir;

if (!fs.existsSync(runtimeDataDir)) {
  fs.mkdirSync(runtimeDataDir, { recursive: true });
}

function ensureRuntimeDatabase() {
  if (!isVercelRuntime) {
    return;
  }

  const filenames = ["rebuild.db", "rebuild.db-wal", "rebuild.db-shm"];

  for (const filename of filenames) {
    const sourcePath = path.join(bundledDataDir, filename);
    const targetPath = path.join(runtimeDataDir, filename);

    if (!fs.existsSync(sourcePath) || fs.existsSync(targetPath)) {
      continue;
    }

    fs.copyFileSync(sourcePath, targetPath);
  }
}

ensureRuntimeDatabase();

const dbPath = path.join(runtimeDataDir, "rebuild.db");
const db = new Database(dbPath);
db.exec(`PRAGMA journal_mode = ${isVercelRuntime ? "DELETE" : "WAL"};`);
db.exec("PRAGMA busy_timeout = 5000;");

function hasColumn(table: string, column: string) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

function hasView(name: string) {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'view' AND name = ? LIMIT 1`)
    .get(name) as { name: string } | undefined;
  return Boolean(row?.name);
}

function addColumnIfMissing(table: string, column: string, definitionSql: string) {
  if (hasColumn(table, column)) {
    return;
  }
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definitionSql};`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/duplicate column name/i.test(message)) {
      return;
    }
    throw error;
  }
}

function normalizeExistingWorkoutKeys() {
  db.exec(`
    UPDATE workouts
    SET canonicalKey = sport || '|' || startAt
    WHERE canonicalKey IS NULL;
  `);

  // Keep only one record for the same sport+start timestamp.
  db.exec(`
    DELETE FROM workouts
    WHERE rowid NOT IN (
      SELECT MIN(rowid)
      FROM workouts
      GROUP BY canonicalKey
    );
  `);

  const defaultBrands = ["ADIDAS", "ASICS", "ALTRA", "Li Ning"];
  const now = new Date().toISOString();
  const insertBrandStmt = db.prepare(
    "INSERT OR IGNORE INTO running_shoe_brands (id, name, createdAt) VALUES (?, ?, ?)"
  );
  for (const brand of defaultBrands) {
    insertBrandStmt.run(randomUUID(), brand, now);
  }
}

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workouts (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      userId TEXT,
      sport TEXT NOT NULL,
      startAt TEXT NOT NULL,
      durationSec INTEGER NOT NULL,
      distanceM REAL,
      avgHr REAL,
      maxHr REAL,
      elevationM REAL,
      powerAvg REAL,
      paceAvg REAL,
      tssLike REAL NOT NULL,
      trimp REAL NOT NULL,
      canonicalKey TEXT,
      rawFileHash TEXT UNIQUE NOT NULL,
      rawFilePath TEXT,
      shoeId TEXT,
      shoeKmAtAssign REAL
    );

    CREATE TABLE IF NOT EXISTS workout_manual_overrides (
      workoutId TEXT PRIMARY KEY,
      officialDurationSec INTEGER,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY(workoutId) REFERENCES workouts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS running_shoes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      brand TEXT NOT NULL,
      startKm REAL NOT NULL DEFAULT 0,
      targetKm REAL NOT NULL DEFAULT 700,
      isDefault INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS running_shoe_brands (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS daily_recovery (
      date TEXT PRIMARY KEY,
      rpe REAL NOT NULL,
      sleepHours REAL,
      sleepQuality REAL,
      hrv REAL,
      restingHr REAL,
      mood REAL,
      sorenessGlobal REAL,
      sorenessByArea TEXT,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS workout_feedback (
      workoutId TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      sport TEXT NOT NULL,
      perceivedEffort TEXT NOT NULL,
      bodyFeel TEXT NOT NULL,
      breathingFeel TEXT NOT NULL,
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
      strengthTechniqueScore INTEGER,
      strengthFailureProximityScore INTEGER,
      strengthFocusArea TEXT,
      openNote TEXT,
      fuelingSource TEXT,
      fuelingQuantity REAL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY(workoutId) REFERENCES workouts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS workout_feedback_dismissed (
      workoutId TEXT PRIMARY KEY,
      dismissedAt TEXT NOT NULL,
      FOREIGN KEY(workoutId) REFERENCES workouts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS logic_rules (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      weeklyTimeBudgetHours REAL NOT NULL,
      runPriority REAL NOT NULL,
      crossTrainingWeight REAL NOT NULL,
      hardDaysPerWeek INTEGER NOT NULL,
      noHardIfLowReadiness REAL NOT NULL,
      minEasyBetweenHard INTEGER NOT NULL,
      injuryFlags TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ingest_runs (
      id TEXT PRIMARY KEY,
      startedAt TEXT NOT NULL,
      finishedAt TEXT,
      success INTEGER NOT NULL,
      filesQueued INTEGER NOT NULL,
      filesIngested INTEGER NOT NULL,
      errors TEXT
    );

    CREATE TABLE IF NOT EXISTS forecast_overrides (
      date TEXT PRIMARY KEY,
      optionId TEXT NOT NULL,
      optionJson TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS forecast_feedback (
      date TEXT PRIMARY KEY,
      effort TEXT NOT NULL,
      loadAdjust REAL NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS weekly_plan (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      profile TEXT NOT NULL,
      availability TEXT NOT NULL,
      lockedWeekStart TEXT,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pain_areas (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      createdAt TEXT NOT NULL
    );

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

    CREATE TABLE IF NOT EXISTS athlete_profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      restingHrBaseline REAL,
      hrvBaseline REAL,
      vo2MaxBaseline REAL,
      sleepHoursBaseline REAL,
      sourceSummaryJson TEXT,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workout_best_efforts (
      id TEXT PRIMARY KEY,
      workoutId TEXT NOT NULL,
      distanceKey TEXT NOT NULL,
      timeSec REAL NOT NULL,
      source TEXT NOT NULL,
      segmentStartSec REAL,
      segmentEndSec REAL,
      createdAt TEXT NOT NULL,
      UNIQUE(workoutId, distanceKey, source, segmentStartSec, segmentEndSec),
      FOREIGN KEY(workoutId) REFERENCES workouts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS nutrition_daily_plan (
      date TEXT PRIMARY KEY,
      carbsG REAL NOT NULL,
      proteinG REAL NOT NULL,
      fatG REAL NOT NULL,
      hydrationMl REAL NOT NULL,
      preWorkoutNote TEXT NOT NULL,
      postWorkoutNote TEXT NOT NULL,
      rationaleJson TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS nutrition_events (
      date TEXT PRIMARY KEY,
      workoutLoad REAL NOT NULL,
      runMinutes REAL NOT NULL,
      runKm REAL NOT NULL,
      generatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS nutrition_ingredients (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      category TEXT NOT NULL,
      kcalPer100 REAL NOT NULL,
      proteinPer100 REAL NOT NULL,
      carbsPer100 REAL NOT NULL,
      fatPer100 REAL NOT NULL,
      defaultUnit TEXT NOT NULL,
      gramsPerUnit REAL NOT NULL,
      isBuiltIn INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS nutrition_pantry_items (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      ingredientId TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit TEXT NOT NULL,
      gramsEffective REAL NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY(ingredientId) REFERENCES nutrition_ingredients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS nutrition_preferences (
      id TEXT PRIMARY KEY,
      ingredientId TEXT NOT NULL,
      mealSlot TEXT NOT NULL,
      score REAL NOT NULL DEFAULT 0,
      lastUsedAt TEXT NOT NULL,
      UNIQUE(ingredientId, mealSlot),
      FOREIGN KEY(ingredientId) REFERENCES nutrition_ingredients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS nutrition_ingredient_favorites (
      ingredientId TEXT PRIMARY KEY,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY(ingredientId) REFERENCES nutrition_ingredients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS nutrition_meal_history (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      mealSlot TEXT NOT NULL,
      title TEXT NOT NULL,
      itemsJson TEXT NOT NULL,
      totalKcal REAL NOT NULL,
      proteinG REAL NOT NULL,
      carbsG REAL NOT NULL,
      fatG REAL NOT NULL,
      compromiseNote TEXT,
      accepted INTEGER,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS nutrition_meal_activation (
      date TEXT NOT NULL,
      mealSlot TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      PRIMARY KEY(date, mealSlot)
    );

    CREATE TABLE IF NOT EXISTS workout_fueling (
      id TEXT PRIMARY KEY,
      workoutId TEXT NOT NULL,
      itemName TEXT NOT NULL,
      quantity REAL NOT NULL,
      unitLabel TEXT NOT NULL,
      carbsG REAL NOT NULL,
      kcal REAL,
      caffeineMg REAL,
      notes TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY(workoutId) REFERENCES workouts(id) ON DELETE CASCADE
    );
  `);

  addColumnIfMissing("workouts", "canonicalKey", "TEXT");
  addColumnIfMissing("workouts", "rawFilePath", "TEXT");
  addColumnIfMissing("workouts", "userId", "TEXT");
  addColumnIfMissing("workouts", "shoeId", "TEXT");
  addColumnIfMissing("workouts", "shoeKmAtAssign", "REAL");
  addColumnIfMissing("nutrition_daily_plan", "totalKcal", "REAL DEFAULT 0");
  addColumnIfMissing("nutrition_meal_history", "compromiseNote", "TEXT");
  addColumnIfMissing("weekly_plan", "lockedWeekStart", "TEXT");
  addColumnIfMissing("workout_feedback", "rpeScore", "INTEGER");
  addColumnIfMissing("workout_feedback", "legsLoadScore", "INTEGER");
  addColumnIfMissing("workout_feedback", "painScore", "INTEGER");
  addColumnIfMissing("workout_feedback", "painArea", "TEXT");
  addColumnIfMissing("workout_feedback", "addFiveKmScore", "INTEGER");
  addColumnIfMissing("workout_feedback", "recoveryScore", "INTEGER");
  addColumnIfMissing("workout_feedback", "breathingScore", "INTEGER");
  addColumnIfMissing("workout_feedback", "overallLoadScore", "INTEGER");
  addColumnIfMissing("workout_feedback", "preRunNutritionScore", "INTEGER");
  addColumnIfMissing("workout_feedback", "environmentScore", "INTEGER");
  addColumnIfMissing("workout_feedback", "satisfactionScore", "INTEGER");
  addColumnIfMissing("workout_feedback", "strengthTechniqueScore", "INTEGER");
  addColumnIfMissing("workout_feedback", "strengthFailureProximityScore", "INTEGER");
  addColumnIfMissing("workout_feedback", "strengthFocusArea", "TEXT");
  addColumnIfMissing("workout_feedback", "openNote", "TEXT");
  addColumnIfMissing("workout_feedback", "fuelingSource", "TEXT");
  addColumnIfMissing("workout_feedback", "fuelingQuantity", "REAL");
  db.exec(`DROP INDEX IF EXISTS workouts_canonical_key_idx;`);
  normalizeExistingWorkoutKeys();
  db.exec(`CREATE INDEX IF NOT EXISTS workouts_canonical_key_idx ON workouts(canonicalKey) WHERE canonicalKey IS NOT NULL;`);

  const row = db.prepare("SELECT COUNT(*) as count FROM logic_rules WHERE id = 1").get() as { count: number };
  if (row.count === 0) {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO logic_rules (id, weeklyTimeBudgetHours, runPriority, crossTrainingWeight, hardDaysPerWeek, noHardIfLowReadiness, minEasyBetweenHard, injuryFlags, updatedAt)
      VALUES (1, 6, 1, 0.9, 2, 45, 1, '[]', ?)`
    ).run(now);
  }

  const painAreasCount = db.prepare("SELECT COUNT(*) as count FROM pain_areas").get() as { count: number };
  if (painAreasCount.count === 0) {
    const now = new Date().toISOString();
    const defaults = [
      "ברך ימין",
      "ברך שמאל",
      "שוק ימין",
      "שוק שמאל",
      "ירך אחורית ימין",
      "ירך אחורית שמאל",
      "גב תחתון",
      "קרסול ימין",
      "קרסול שמאל",
      "כף רגל ימין",
      "כף רגל שמאל"
    ];
    const stmt = db.prepare("INSERT INTO pain_areas (id, name, createdAt) VALUES (?, ?, ?)");
    for (const name of defaults) {
      stmt.run(randomUUID(), name, now);
    }
  }

  const weekPlanRow = db.prepare("SELECT COUNT(*) as count FROM weekly_plan WHERE id = 1").get() as { count: number };
  if (weekPlanRow.count === 0) {
    db.prepare("INSERT INTO weekly_plan (id, profile, availability, lockedWeekStart, updatedAt) VALUES (1, 'balanced', 'normal', NULL, ?)").run(
      new Date().toISOString()
    );
  }

  const athleteProfileRow = db.prepare("SELECT COUNT(*) as count FROM athlete_profile WHERE id = 1").get() as { count: number };
  if (athleteProfileRow.count === 0) {
    db.prepare(
      "INSERT INTO athlete_profile (id, restingHrBaseline, hrvBaseline, vo2MaxBaseline, sleepHoursBaseline, sourceSummaryJson, updatedAt) VALUES (1, NULL, NULL, NULL, NULL, NULL, ?)"
    ).run(new Date().toISOString());
  }

  // ── Verified built-in ingredients ──────────────────────────────────────────
  // Always upsert so macro / unit corrections propagate on next app restart.
  // gramsPerUnit for g/ml items = default display quantity in the add-food modal.
  // User-created ingredients (isBuiltIn=0) are never overwritten.
  {
    const now = new Date().toISOString();
    type SI = { name: string; category: NutritionIngredientCategory; kcalPer100: number; proteinPer100: number; carbsPer100: number; fatPer100: number; defaultUnit: NutritionUnit; gramsPerUnit: number };
    const builtIns: SI[] = [
      // Hydration (USDA + Israeli label data)
      { name: "מים",                            category: "hydration", kcalPer100: 0,   proteinPer100: 0,    carbsPer100: 0,    fatPer100: 0,    defaultUnit: "ml",   gramsPerUnit: 250 },
      { name: "אספרסו כפול",                    category: "hydration", kcalPer100: 3,   proteinPer100: 0.1,  carbsPer100: 0.5,  fatPer100: 0.2,  defaultUnit: "unit", gramsPerUnit: 60  },
      { name: "אספרסו כפול עם חלב",             category: "hydration", kcalPer100: 34,  proteinPer100: 1.8,  carbsPer100: 2.9,  fatPer100: 1.7,  defaultUnit: "unit", gramsPerUnit: 130 },
      // Dairy (Tenuva / Danone Israel labels, Open Food Facts)
      { name: "חלב 3% תנובה",                   category: "dairy",     kcalPer100: 60,  proteinPer100: 3.3,  carbsPer100: 5.0,  fatPer100: 3.0,  defaultUnit: "ml",   gramsPerUnit: 200 },
      { name: "קוטג׳ 5% תנובה",                 category: "dairy",     kcalPer100: 95,  proteinPer100: 11.0, carbsPer100: 1.5,  fatPer100: 5.0,  defaultUnit: "unit", gramsPerUnit: 250 },
      { name: "יוגורט יווני",                   category: "dairy",     kcalPer100: 97,  proteinPer100: 10.0, carbsPer100: 3.6,  fatPer100: 5.0,  defaultUnit: "unit", gramsPerUnit: 200 },
      { name: "יוגורט 4% תנובה",                category: "dairy",     kcalPer100: 63,  proteinPer100: 3.3,  carbsPer100: 4.5,  fatPer100: 4.0,  defaultUnit: "unit", gramsPerUnit: 200 },
      { name: "יוגורט דנונה PRO 1.5% (200 גרם)", category: "dairy",    kcalPer100: 70,  proteinPer100: 10.0, carbsPer100: 3.4,  fatPer100: 1.5,  defaultUnit: "unit", gramsPerUnit: 200 },
      { name: "יוגורט דנונה PRO 0% (200 גרם)",  category: "dairy",     kcalPer100: 58,  proteinPer100: 10.5, carbsPer100: 3.3,  fatPer100: 0.0,  defaultUnit: "unit", gramsPerUnit: 200 },
      // Protein
      { name: "ביצה",                           category: "protein",   kcalPer100: 143, proteinPer100: 12.6, carbsPer100: 0.7,  fatPer100: 9.5,  defaultUnit: "unit", gramsPerUnit: 55  },
      { name: "ביצה קשה",                       category: "protein",   kcalPer100: 143, proteinPer100: 12.6, carbsPer100: 0.7,  fatPer100: 9.5,  defaultUnit: "unit", gramsPerUnit: 55  },
      { name: "חביתה",                          category: "protein",   kcalPer100: 168, proteinPer100: 11.9, carbsPer100: 1.6,  fatPer100: 13.2, defaultUnit: "unit", gramsPerUnit: 110 },
      { name: "חזה עוף",                        category: "protein",   kcalPer100: 165, proteinPer100: 31.0, carbsPer100: 0.0,  fatPer100: 3.6,  defaultUnit: "g",    gramsPerUnit: 150 },
      { name: "טונה במים",                      category: "protein",   kcalPer100: 116, proteinPer100: 26.0, carbsPer100: 0.0,  fatPer100: 1.0,  defaultUnit: "unit", gramsPerUnit: 120 },
      { name: "טופו",                           category: "protein",   kcalPer100: 76,  proteinPer100: 8.0,  carbsPer100: 1.9,  fatPer100: 4.8,  defaultUnit: "g",    gramsPerUnit: 120 },
      { name: "עדשים מבושלות",                  category: "protein",   kcalPer100: 116, proteinPer100: 9.0,  carbsPer100: 20.0, fatPer100: 0.4,  defaultUnit: "g",    gramsPerUnit: 150 },
      // Carbs / grains (USDA FoodData Central)
      { name: "שיבולת שועל",                    category: "carb",      kcalPer100: 389, proteinPer100: 17.0, carbsPer100: 66.0, fatPer100: 7.0,  defaultUnit: "g",    gramsPerUnit: 80  },
      { name: "אורז מבושל",                     category: "carb",      kcalPer100: 130, proteinPer100: 2.7,  carbsPer100: 28.0, fatPer100: 0.3,  defaultUnit: "g",    gramsPerUnit: 185 },
      { name: "קינואה מבושלת",                  category: "carb",      kcalPer100: 120, proteinPer100: 4.4,  carbsPer100: 21.3, fatPer100: 1.9,  defaultUnit: "g",    gramsPerUnit: 185 },
      { name: "כוסמת מבושלת",                   category: "carb",      kcalPer100: 92,  proteinPer100: 3.4,  carbsPer100: 19.9, fatPer100: 0.6,  defaultUnit: "g",    gramsPerUnit: 170 },
      { name: "פסטה מבושלת",                    category: "carb",      kcalPer100: 158, proteinPer100: 5.8,  carbsPer100: 30.9, fatPer100: 0.9,  defaultUnit: "g",    gramsPerUnit: 200 },
      { name: "לחם מלא",                        category: "carb",      kcalPer100: 247, proteinPer100: 13.0, carbsPer100: 41.0, fatPer100: 4.2,  defaultUnit: "unit", gramsPerUnit: 35  },
      { name: "בטטה",                           category: "carb",      kcalPer100: 86,  proteinPer100: 1.6,  carbsPer100: 20.1, fatPer100: 0.1,  defaultUnit: "unit", gramsPerUnit: 200 },
      // Cooked dishes
      { name: "פסטה ברוטב עגבניות",             category: "carb",      kcalPer100: 130, proteinPer100: 4.0,  carbsPer100: 22.0, fatPer100: 2.0,  defaultUnit: "unit", gramsPerUnit: 300 },
      { name: "לזניה צמחונית",                  category: "carb",      kcalPer100: 130, proteinPer100: 6.0,  carbsPer100: 14.0, fatPer100: 5.5,  defaultUnit: "unit", gramsPerUnit: 285 },
      // Street food
      { name: "פלאפל",                          category: "carb",      kcalPer100: 333, proteinPer100: 13.3, carbsPer100: 31.8, fatPer100: 17.8, defaultUnit: "unit", gramsPerUnit: 20  },
      // Fats / spreads (USDA + Achla by Strauss Israeli label)
      { name: "טחינה גולמית",                   category: "fat",       kcalPer100: 595, proteinPer100: 17.0, carbsPer100: 21.0, fatPer100: 53.0, defaultUnit: "tbsp", gramsPerUnit: 15  },
      { name: "חומוס (ממרח)",                   category: "fat",       kcalPer100: 214, proteinPer100: 7.1,  carbsPer100: 10.7, fatPer100: 16.1, defaultUnit: "tbsp", gramsPerUnit: 25  },
      { name: "אבוקדו",                         category: "fat",       kcalPer100: 160, proteinPer100: 2.0,  carbsPer100: 9.0,  fatPer100: 15.0, defaultUnit: "unit", gramsPerUnit: 140 },
      { name: "שקדים",                          category: "fat",       kcalPer100: 579, proteinPer100: 21.0, carbsPer100: 22.0, fatPer100: 50.0, defaultUnit: "g",    gramsPerUnit: 25  },
      { name: "שמן זית",                        category: "fat",       kcalPer100: 884, proteinPer100: 0.0,  carbsPer100: 0.0,  fatPer100: 100.0, defaultUnit: "tbsp", gramsPerUnit: 13 },
      // Sweeteners
      { name: "דבש",                            category: "sweet",     kcalPer100: 304, proteinPer100: 0.3,  carbsPer100: 82.0, fatPer100: 0.0,  defaultUnit: "tbsp", gramsPerUnit: 21  },
      // Fruit (USDA FoodData Central)
      { name: "בננה",                           category: "fruit",     kcalPer100: 89,  proteinPer100: 1.1,  carbsPer100: 22.8, fatPer100: 0.3,  defaultUnit: "unit", gramsPerUnit: 118 },
      { name: "תפוח",                           category: "fruit",     kcalPer100: 52,  proteinPer100: 0.3,  carbsPer100: 13.8, fatPer100: 0.2,  defaultUnit: "unit", gramsPerUnit: 182 },
      { name: "תמר מג׳הול",                     category: "fruit",     kcalPer100: 277, proteinPer100: 1.8,  carbsPer100: 75.0, fatPer100: 0.2,  defaultUnit: "unit", gramsPerUnit: 24  },
      // Vegetables
      { name: "מלפפון",                         category: "vegetable", kcalPer100: 15,  proteinPer100: 0.7,  carbsPer100: 3.6,  fatPer100: 0.1,  defaultUnit: "unit", gramsPerUnit: 120 },
      { name: "עגבנייה",                        category: "vegetable", kcalPer100: 18,  proteinPer100: 0.9,  carbsPer100: 3.9,  fatPer100: 0.2,  defaultUnit: "unit", gramsPerUnit: 120 },
      { name: "רוקט",                           category: "vegetable", kcalPer100: 25,  proteinPer100: 2.6,  carbsPer100: 3.7,  fatPer100: 0.7,  defaultUnit: "g",    gramsPerUnit: 40  },
      { name: "פטרוזיליה",                      category: "vegetable", kcalPer100: 36,  proteinPer100: 3.0,  carbsPer100: 6.3,  fatPer100: 0.8,  defaultUnit: "g",    gramsPerUnit: 20  },
      // Misc
      { name: "מלח",                            category: "mixed",     kcalPer100: 0,   proteinPer100: 0.0,  carbsPer100: 0.0,  fatPer100: 0.0,  defaultUnit: "g",    gramsPerUnit: 5   },
      // Sweets (FatSecret / Eat This Much)
      { name: "Kinder Happy Hippo",             category: "sweet",     kcalPer100: 545, proteinPer100: 8.5,  carbsPer100: 57.0, fatPer100: 31.0, defaultUnit: "unit", gramsPerUnit: 21  },
      { name: "פסק זמן",                        category: "sweet",     kcalPer100: 556, proteinPer100: 6.0,  carbsPer100: 51.0, fatPer100: 33.0, defaultUnit: "unit", gramsPerUnit: 45  },
    ];
    const upsert = db.prepare(
      `INSERT INTO nutrition_ingredients
         (id, name, category, kcalPer100, proteinPer100, carbsPer100, fatPer100, defaultUnit, gramsPerUnit, isBuiltIn, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(name) DO UPDATE SET
         category      = excluded.category,
         kcalPer100    = excluded.kcalPer100,
         proteinPer100 = excluded.proteinPer100,
         carbsPer100   = excluded.carbsPer100,
         fatPer100     = excluded.fatPer100,
         defaultUnit   = excluded.defaultUnit,
         gramsPerUnit  = excluded.gramsPerUnit,
         isBuiltIn     = 1,
         updatedAt     = excluded.updatedAt`
    );
    const existing = new Set(
      (db.prepare("SELECT name FROM nutrition_ingredients WHERE isBuiltIn = 1").all() as { name: string }[]).map(r => r.name)
    );
    for (const item of builtIns) {
      const id = existing.has(item.name)
        ? (db.prepare("SELECT id FROM nutrition_ingredients WHERE name = ? LIMIT 1").get(item.name) as { id: string }).id
        : randomUUID();
      upsert.run(id, item.name, item.category, item.kcalPer100, item.proteinPer100, item.carbsPer100, item.fatPer100, item.defaultUnit, item.gramsPerUnit, now, now);
    }
  }

  if (!hasView("insight_day_view")) {
    db.exec(`
    CREATE VIEW insight_day_view AS
    WITH all_dates AS (
      SELECT date FROM daily_recovery
      UNION
      SELECT date(datetime(startAt, 'localtime')) AS date FROM workouts
      UNION
      SELECT date FROM nutrition_daily_plan
      UNION
      SELECT date FROM nutrition_meal_history
    ),
    workout_daily AS (
      SELECT
        date(datetime(startAt, 'localtime')) AS date,
        COUNT(*) AS workoutCount,
        SUM(CASE WHEN sport = 'run' THEN 1 ELSE 0 END) AS runCount,
        SUM(CASE WHEN sport = 'bike' THEN 1 ELSE 0 END) AS bikeCount,
        SUM(CASE WHEN sport = 'swim' THEN 1 ELSE 0 END) AS swimCount,
        ROUND(SUM(COALESCE(tssLike, 0)), 1) AS totalLoad,
        ROUND(SUM(COALESCE(trimp, 0)), 1) AS totalTrimp,
        ROUND(SUM(COALESCE(distanceM, 0)) / 1000.0, 2) AS totalDistanceKm,
        ROUND(SUM(CASE WHEN sport = 'run' THEN COALESCE(distanceM, 0) ELSE 0 END) / 1000.0, 2) AS runKm,
        ROUND(SUM(CASE WHEN sport = 'run' THEN durationSec ELSE 0 END) / 60.0, 1) AS runMinutes,
        ROUND(SUM(CASE WHEN sport = 'bike' THEN durationSec ELSE 0 END) / 60.0, 1) AS bikeMinutes,
        ROUND(SUM(CASE WHEN sport = 'swim' THEN durationSec ELSE 0 END) / 60.0, 1) AS swimMinutes,
        ROUND(AVG(CASE WHEN sport = 'run' THEN avgHr END), 1) AS avgRunHr,
        ROUND(AVG(avgHr), 1) AS avgWorkoutHr,
        MAX(maxHr) AS maxWorkoutHr
      FROM workouts
      GROUP BY date(datetime(startAt, 'localtime'))
    ),
    accepted_meals AS (
      SELECT
        date,
        SUM(CASE WHEN accepted = 1 THEN 1 ELSE 0 END) AS acceptedMealCount,
        ROUND(SUM(CASE WHEN accepted = 1 THEN totalKcal ELSE 0 END), 1) AS actualKcal,
        ROUND(SUM(CASE WHEN accepted = 1 THEN proteinG ELSE 0 END), 1) AS actualProteinG,
        ROUND(SUM(CASE WHEN accepted = 1 THEN carbsG ELSE 0 END), 1) AS actualCarbsG,
        ROUND(SUM(CASE WHEN accepted = 1 THEN fatG ELSE 0 END), 1) AS actualFatG,
        GROUP_CONCAT(CASE WHEN accepted = 1 THEN mealSlot END, ',') AS acceptedMealSlots
      FROM nutrition_meal_history
      GROUP BY date
    ),
    fueling_daily AS (
      SELECT
        date(datetime(w.startAt, 'localtime')) AS date,
        ROUND(SUM(COALESCE(f.carbsG, 0)), 1) AS fuelingCarbsG,
        ROUND(SUM(COALESCE(f.kcal, 0)), 1) AS fuelingKcal,
        COUNT(f.id) AS fuelingEntries
      FROM workouts w
      LEFT JOIN workout_fueling f ON f.workoutId = w.id
      GROUP BY date(datetime(w.startAt, 'localtime'))
    )
    SELECT
      d.date,
      r.rpe AS recoveryRpe,
      r.sleepHours,
      r.sleepQuality,
      r.hrv,
      r.restingHr,
      r.mood,
      r.sorenessGlobal,
      COALESCE(r.sorenessByArea, '') AS sorenessByArea,
      COALESCE(r.notes, '') AS recoveryNotes,
      CASE
        WHEN COALESCE(r.sorenessGlobal, 0) >= 5 OR LENGTH(TRIM(COALESCE(r.sorenessByArea, ''))) > 0 THEN 1
        ELSE 0
      END AS hasPain,
      COALESCE(w.workoutCount, 0) AS workoutCount,
      COALESCE(w.runCount, 0) AS runCount,
      COALESCE(w.bikeCount, 0) AS bikeCount,
      COALESCE(w.swimCount, 0) AS swimCount,
      COALESCE(w.totalLoad, 0) AS totalLoad,
      COALESCE(w.totalTrimp, 0) AS totalTrimp,
      COALESCE(w.totalDistanceKm, 0) AS totalDistanceKm,
      COALESCE(w.runKm, 0) AS runKm,
      COALESCE(w.runMinutes, 0) AS runMinutes,
      COALESCE(w.bikeMinutes, 0) AS bikeMinutes,
      COALESCE(w.swimMinutes, 0) AS swimMinutes,
      w.avgRunHr,
      w.avgWorkoutHr,
      w.maxWorkoutHr,
      COALESCE(n.totalKcal, 0) AS targetKcal,
      COALESCE(n.proteinG, 0) AS targetProteinG,
      COALESCE(n.carbsG, 0) AS targetCarbsG,
      COALESCE(n.fatG, 0) AS targetFatG,
      COALESCE(n.hydrationMl, 0) AS hydrationMl,
      COALESCE(m.acceptedMealCount, 0) AS acceptedMealCount,
      COALESCE(m.actualKcal, 0) AS actualKcal,
      COALESCE(m.actualProteinG, 0) AS actualProteinG,
      COALESCE(m.actualCarbsG, 0) AS actualCarbsG,
      COALESCE(m.actualFatG, 0) AS actualFatG,
      COALESCE(m.acceptedMealSlots, '') AS acceptedMealSlots,
      COALESCE(f.fuelingCarbsG, 0) AS fuelingCarbsG,
      COALESCE(f.fuelingKcal, 0) AS fuelingKcal,
      COALESCE(f.fuelingEntries, 0) AS fuelingEntries
    FROM all_dates d
    LEFT JOIN daily_recovery r ON r.date = d.date
    LEFT JOIN workout_daily w ON w.date = d.date
    LEFT JOIN nutrition_daily_plan n ON n.date = d.date
    LEFT JOIN accepted_meals m ON m.date = d.date
    LEFT JOIN fueling_daily f ON f.date = d.date;
  `);
  }

  if (!hasView("insight_workout_view")) {
    db.exec(`
    CREATE VIEW insight_workout_view AS
    WITH fueling_by_workout AS (
      SELECT
        workoutId,
        ROUND(SUM(COALESCE(carbsG, 0)), 1) AS fuelingCarbsG,
        ROUND(SUM(COALESCE(kcal, 0)), 1) AS fuelingKcal,
        COUNT(*) AS fuelingEntries,
        GROUP_CONCAT(itemName, ', ') AS fuelingItems
      FROM workout_fueling
      GROUP BY workoutId
    ),
    best_efforts_by_workout AS (
      SELECT
        workoutId,
        COUNT(*) AS bestEffortCount,
        GROUP_CONCAT(distanceKey || ':' || source, ',') AS bestEffortKeys
      FROM workout_best_efforts
      GROUP BY workoutId
    )
    SELECT
      w.id,
      date(datetime(w.startAt, 'localtime')) AS date,
      w.startAt,
      CAST(strftime('%H', datetime(w.startAt, 'localtime')) AS INTEGER) AS hourOfDay,
      w.source,
      w.sport,
      w.durationSec,
      ROUND(COALESCE(w.distanceM, 0) / 1000.0, 2) AS distanceKm,
      CASE
        WHEN COALESCE(w.distanceM, 0) > 0 THEN ROUND((w.durationSec / 60.0) / (w.distanceM / 1000.0), 2)
        ELSE NULL
      END AS paceMinPerKm,
      w.avgHr,
      w.maxHr,
      w.elevationM,
      w.tssLike,
      w.trimp,
      w.shoeId,
      COALESCE(s.name, 'ללא שיוך') AS shoeName,
      f.perceivedEffort,
      f.bodyFeel,
      f.breathingFeel,
      COALESCE(fw.fuelingCarbsG, 0) AS fuelingCarbsG,
      COALESCE(fw.fuelingKcal, 0) AS fuelingKcal,
      COALESCE(fw.fuelingEntries, 0) AS fuelingEntries,
      COALESCE(fw.fuelingItems, '') AS fuelingItems,
      COALESCE(be.bestEffortCount, 0) AS bestEffortCount,
      COALESCE(be.bestEffortKeys, '') AS bestEffortKeys
    FROM workouts w
    LEFT JOIN running_shoes s ON s.id = w.shoeId
    LEFT JOIN workout_feedback f ON f.workoutId = w.id
    LEFT JOIN fueling_by_workout fw ON fw.workoutId = w.id
    LEFT JOIN best_efforts_by_workout be ON be.workoutId = w.id;
  `);
  }
}

migrate();

export function getDb() {
  return db;
}

export function upsertWorkout(workout: Workout) {
  const payload = {
    id: workout.id,
    source: workout.source,
    userId: workout.userId ?? null,
    sport: workout.sport,
    startAt: workout.startAt,
    durationSec: workout.durationSec,
    distanceM: workout.distanceM ?? null,
    avgHr: workout.avgHr ?? null,
    maxHr: workout.maxHr ?? null,
    elevationM: workout.elevationM ?? null,
    powerAvg: workout.powerAvg ?? null,
    paceAvg: workout.paceAvg ?? null,
    tssLike: workout.tssLike,
    trimp: workout.trimp,
    canonicalKey: workout.canonicalKey ?? null,
    rawFileHash: workout.rawFileHash,
    rawFilePath: workout.rawFilePath ?? null,
    shoeId: workout.shoeId ?? null
  };

  const existing = db
    .prepare("SELECT id FROM workouts WHERE canonicalKey = ? LIMIT 1")
    .get(payload.canonicalKey) as { id: string } | undefined;

  if (existing?.id) {
    db.prepare(
      `UPDATE workouts
       SET source = @source,
           userId = @userId,
           sport = @sport,
           startAt = @startAt,
           durationSec = @durationSec,
           distanceM = @distanceM,
           avgHr = @avgHr,
           maxHr = @maxHr,
           elevationM = @elevationM,
           powerAvg = @powerAvg,
           paceAvg = @paceAvg,
           tssLike = @tssLike,
           trimp = @trimp,
           canonicalKey = @canonicalKey,
           rawFileHash = @rawFileHash,
           rawFilePath = @rawFilePath,
           shoeId = COALESCE(@shoeId, shoeId)
       WHERE id = @existingId`
    ).run({ ...payload, existingId: existing.id });
    return existing.id;
  }

  const nearExisting = db
    .prepare(
      `SELECT id, source
       FROM workouts
       WHERE sport = @sport
         AND source != @source
         AND ABS(strftime('%s', startAt) - strftime('%s', @startAt)) <= 10800
         AND ABS(durationSec - @durationSec) <=
           CASE
             WHEN (@durationSec * 0.18) > 420 THEN (@durationSec * 0.18)
             ELSE 420
           END
         AND (
           distanceM IS NULL
           OR @distanceM IS NULL
           OR ABS(distanceM - @distanceM) <=
             CASE
               WHEN (@distanceM * 0.15) > 1200 THEN (@distanceM * 0.15)
               ELSE 1200
             END
         )
       ORDER BY ABS(strftime('%s', startAt) - strftime('%s', @startAt)) ASC
       LIMIT 1`
    )
    .get({
      sport: payload.sport,
      source: payload.source,
      startAt: payload.startAt,
      durationSec: payload.durationSec,
      distanceM: payload.distanceM
    }) as { id: string; source: string } | undefined;

  if (nearExisting?.id) {
    if (nearExisting.source !== "strava" && workout.source === "strava") {
      db.prepare("UPDATE workouts SET source = 'strava' WHERE id = ?").run(nearExisting.id);
    }
    return nearExisting.id;
  }

  db.prepare(
    `INSERT INTO workouts (id, source, userId, sport, startAt, durationSec, distanceM, avgHr, maxHr, elevationM, powerAvg, paceAvg, tssLike, trimp, canonicalKey, rawFileHash, rawFilePath, shoeId)
     VALUES (@id, @source, @userId, @sport, @startAt, @durationSec, @distanceM, @avgHr, @maxHr, @elevationM, @powerAvg, @paceAvg, @tssLike, @trimp, @canonicalKey, @rawFileHash, @rawFilePath, @shoeId)
     ON CONFLICT(rawFileHash) DO UPDATE SET
       source = excluded.source,
       userId = excluded.userId,
       sport = excluded.sport,
       startAt = excluded.startAt,
       durationSec = excluded.durationSec,
       distanceM = excluded.distanceM,
       avgHr = excluded.avgHr,
       maxHr = excluded.maxHr,
       elevationM = excluded.elevationM,
       powerAvg = excluded.powerAvg,
       paceAvg = excluded.paceAvg,
       tssLike = excluded.tssLike,
       trimp = excluded.trimp,
       canonicalKey = excluded.canonicalKey,
       rawFilePath = excluded.rawFilePath,
       shoeId = COALESCE(excluded.shoeId, workouts.shoeId)`
  ).run(payload);

  const byHash = db.prepare("SELECT id FROM workouts WHERE rawFileHash = ? LIMIT 1").get(payload.rawFileHash) as { id: string } | undefined;
  return byHash?.id ?? payload.id;
}

export function getWorkouts(limit = 400): Workout[] {
  return db
    .prepare(
      `SELECT w.*, s.name as shoeName
       FROM workouts w
       LEFT JOIN running_shoes s ON s.id = w.shoeId
       ORDER BY w.startAt DESC
       LIMIT ?`
    )
    .all(limit) as Workout[];
}

export function getWorkoutById(id: string): Workout | null {
  return (
    (db
      .prepare(
        `SELECT w.*, s.name as shoeName
         FROM workouts w
         LEFT JOIN running_shoes s ON s.id = w.shoeId
         WHERE w.id = ?
         LIMIT 1`
      )
      .get(id) as Workout | undefined) ?? null
  );
}

export function getAdjacentWorkoutIds(workoutId: string) {
  const current = db
    .prepare(
      `SELECT id, startAt
       FROM workouts
       WHERE id = ?
       LIMIT 1`
    )
    .get(workoutId) as { id: string; startAt: string } | undefined;

  if (!current) {
    return { previous: null, next: null } as {
      previous: { id: string; startAt: string } | null;
      next: { id: string; startAt: string } | null;
    };
  }

  const previous = db
    .prepare(
      `SELECT id, startAt
       FROM workouts
       WHERE startAt < @startAt
          OR (startAt = @startAt AND id < @id)
       ORDER BY startAt DESC, id DESC
       LIMIT 1`
    )
    .get({ id: current.id, startAt: current.startAt }) as { id: string; startAt: string } | undefined;

  const next = db
    .prepare(
      `SELECT id, startAt
       FROM workouts
       WHERE startAt > @startAt
          OR (startAt = @startAt AND id > @id)
       ORDER BY startAt ASC, id ASC
       LIMIT 1`
    )
    .get({ id: current.id, startAt: current.startAt }) as { id: string; startAt: string } | undefined;

  return {
    previous: previous ?? null,
    next: next ?? null
  };
}

export function getWorkoutOfficialDurationSec(workoutId: string): number | null {
  const row = db
    .prepare(
      `SELECT officialDurationSec
       FROM workout_manual_overrides
       WHERE workoutId = ?
       LIMIT 1`
    )
    .get(workoutId) as { officialDurationSec: number | null } | undefined;
  if (!row) return null;
  return row.officialDurationSec != null ? Number(row.officialDurationSec) : null;
}

export function upsertWorkoutOfficialDurationSec(workoutId: string, officialDurationSec: number | null) {
  if (officialDurationSec == null) {
    db.prepare("DELETE FROM workout_manual_overrides WHERE workoutId = ?").run(workoutId);
    return;
  }

  db.prepare(
    `INSERT INTO workout_manual_overrides (workoutId, officialDurationSec, updatedAt)
     VALUES (?, ?, ?)
     ON CONFLICT(workoutId) DO UPDATE SET
       officialDurationSec = excluded.officialDurationSec,
       updatedAt = excluded.updatedAt`
  ).run(workoutId, Math.round(officialDurationSec), new Date().toISOString());
}

export function getWorkoutsBetween(startInclusive: string, endExclusive: string): Workout[] {
  return db
    .prepare(
      `SELECT w.*, s.name as shoeName
       FROM workouts w
       LEFT JOIN running_shoes s ON s.id = w.shoeId
       WHERE w.startAt >= ? AND w.startAt < ?
       ORDER BY w.startAt ASC`
    )
    .all(startInclusive, endExclusive) as Workout[];
}

export function getWorkoutsSince(isoDate: string): Workout[] {
  return db
    .prepare(
      `SELECT w.*, s.name as shoeName
       FROM workouts w
       LEFT JOIN running_shoes s ON s.id = w.shoeId
       WHERE w.startAt >= ?
       ORDER BY w.startAt DESC`
    )
    .all(isoDate) as Workout[];
}

export function upsertDailyRecovery(input: DailyRecovery) {
  db.prepare(
    `INSERT INTO daily_recovery (date, rpe, sleepHours, sleepQuality, hrv, restingHr, mood, sorenessGlobal, sorenessByArea, notes)
     VALUES (@date, @rpe, @sleepHours, @sleepQuality, @hrv, @restingHr, @mood, @sorenessGlobal, @sorenessByArea, @notes)
     ON CONFLICT(date) DO UPDATE SET
       rpe = excluded.rpe,
       sleepHours = excluded.sleepHours,
       sleepQuality = excluded.sleepQuality,
       hrv = excluded.hrv,
       restingHr = excluded.restingHr,
       mood = excluded.mood,
       sorenessGlobal = excluded.sorenessGlobal,
       sorenessByArea = excluded.sorenessByArea,
       notes = excluded.notes`
  ).run(input);
}

export function getRecovery(date: string): DailyRecovery | null {
  return (db.prepare("SELECT * FROM daily_recovery WHERE date = ?").get(date) as DailyRecovery | undefined) ?? null;
}

export function hasRecoveryForDate(date: string) {
  const row = db.prepare("SELECT 1 as ok FROM daily_recovery WHERE date = ? LIMIT 1").get(date) as { ok: number } | undefined;
  return Boolean(row?.ok);
}

export function getDailyCheckinProgress(date: string) {
  const row = db
    .prepare(
      `SELECT date, exertion, sleep, hrv, restingHr, mood, sorenessLevel, painAreasJson, lastStep, updatedAt
       FROM daily_checkin_progress
       WHERE date = ?
       LIMIT 1`
    )
    .get(date) as
    | {
        date: string;
        exertion: string | null;
        sleep: string | null;
        hrv: string | null;
        restingHr: string | null;
        mood: string | null;
        sorenessLevel: string | null;
        painAreasJson: string | null;
        lastStep: number | null;
        updatedAt: string;
      }
    | undefined;

  if (!row) return null;

  return {
    date: row.date,
    exertion: row.exertion,
    sleep: row.sleep,
    hrv: row.hrv,
    restingHr: row.restingHr,
    mood: row.mood,
    sorenessLevel: row.sorenessLevel,
    painAreas: row.painAreasJson ? ((JSON.parse(row.painAreasJson) as string[]) ?? []) : [],
    lastStep: row.lastStep,
    updatedAt: row.updatedAt
  };
}

export function upsertDailyCheckinProgress(input: {
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
  db.prepare(
    `INSERT INTO daily_checkin_progress (date, exertion, sleep, hrv, restingHr, mood, sorenessLevel, painAreasJson, lastStep, updatedAt)
     VALUES (@date, @exertion, @sleep, @hrv, @restingHr, @mood, @sorenessLevel, @painAreasJson, @lastStep, @updatedAt)
     ON CONFLICT(date) DO UPDATE SET
       exertion = COALESCE(excluded.exertion, daily_checkin_progress.exertion),
       sleep = COALESCE(excluded.sleep, daily_checkin_progress.sleep),
       hrv = COALESCE(excluded.hrv, daily_checkin_progress.hrv),
       restingHr = COALESCE(excluded.restingHr, daily_checkin_progress.restingHr),
       mood = COALESCE(excluded.mood, daily_checkin_progress.mood),
       sorenessLevel = COALESCE(excluded.sorenessLevel, daily_checkin_progress.sorenessLevel),
       painAreasJson = COALESCE(excluded.painAreasJson, daily_checkin_progress.painAreasJson),
       lastStep = COALESCE(excluded.lastStep, daily_checkin_progress.lastStep),
       updatedAt = excluded.updatedAt`
  ).run({
    date: input.date,
    exertion: input.exertion ?? null,
    sleep: input.sleep ?? null,
    hrv: input.hrv ?? null,
    restingHr: input.restingHr ?? null,
    mood: input.mood ?? null,
    sorenessLevel: input.sorenessLevel ?? null,
    painAreasJson: input.painAreas ? JSON.stringify(input.painAreas) : null,
    lastStep: input.lastStep ?? null,
    updatedAt: new Date().toISOString()
  });
}

export function clearDailyCheckinProgress(date: string) {
  db.prepare("DELETE FROM daily_checkin_progress WHERE date = ?").run(date);
}

export function upsertWorkoutFeedback(input: {
  workoutId: string;
  date: string;
  sport: "run" | "bike" | "swim" | "strength";
  perceivedEffort: "easy" | "moderate" | "hard" | "max";
  bodyFeel: "fresh" | "normal" | "heavy" | "pain";
  breathingFeel: "easy" | "steady" | "hard";
  rpeScore?: number | null;
  legsLoadScore?: number | null;
  painScore?: number | null;
  painArea?: string | null;
  addFiveKmScore?: number | null;
  recoveryScore?: number | null;
  breathingScore?: number | null;
  overallLoadScore?: number | null;
  preRunNutritionScore?: number | null;
  environmentScore?: number | null;
  satisfactionScore?: number | null;
  strengthTechniqueScore?: number | null;
  strengthFailureProximityScore?: number | null;
  strengthFocusArea?: string | null;
  openNote?: string | null;
  fuelingSource?: string | null;
  fuelingQuantity?: number | null;
}) {
  db.prepare(
    `INSERT INTO workout_feedback (
      workoutId, date, sport, perceivedEffort, bodyFeel, breathingFeel,
      rpeScore, legsLoadScore, painScore, painArea, addFiveKmScore, recoveryScore,
      breathingScore, overallLoadScore, preRunNutritionScore, environmentScore, satisfactionScore,
      strengthTechniqueScore, strengthFailureProximityScore, strengthFocusArea,
      openNote, fuelingSource, fuelingQuantity, updatedAt
    )
     VALUES (
      @workoutId, @date, @sport, @perceivedEffort, @bodyFeel, @breathingFeel,
      @rpeScore, @legsLoadScore, @painScore, @painArea, @addFiveKmScore, @recoveryScore,
      @breathingScore, @overallLoadScore, @preRunNutritionScore, @environmentScore, @satisfactionScore,
      @strengthTechniqueScore, @strengthFailureProximityScore, @strengthFocusArea,
      @openNote, @fuelingSource, @fuelingQuantity, @updatedAt
    )
     ON CONFLICT(workoutId) DO UPDATE SET
       perceivedEffort = excluded.perceivedEffort,
       bodyFeel = excluded.bodyFeel,
       breathingFeel = excluded.breathingFeel,
       rpeScore = excluded.rpeScore,
       legsLoadScore = excluded.legsLoadScore,
       painScore = excluded.painScore,
       painArea = excluded.painArea,
       addFiveKmScore = excluded.addFiveKmScore,
       recoveryScore = excluded.recoveryScore,
       breathingScore = excluded.breathingScore,
       overallLoadScore = excluded.overallLoadScore,
       preRunNutritionScore = excluded.preRunNutritionScore,
       environmentScore = excluded.environmentScore,
       satisfactionScore = excluded.satisfactionScore,
       strengthTechniqueScore = excluded.strengthTechniqueScore,
       strengthFailureProximityScore = excluded.strengthFailureProximityScore,
       strengthFocusArea = excluded.strengthFocusArea,
       openNote = excluded.openNote,
       fuelingSource = excluded.fuelingSource,
       fuelingQuantity = excluded.fuelingQuantity,
       updatedAt = excluded.updatedAt`
  ).run({
    ...input,
    painArea: input.painArea?.trim() || null,
    strengthFocusArea: input.strengthFocusArea?.trim() || null,
    openNote: input.openNote?.trim() || null,
    fuelingSource: input.fuelingSource?.trim() || null,
    fuelingQuantity: input.fuelingQuantity ?? null,
    updatedAt: new Date().toISOString()
  });
  db.prepare("DELETE FROM workout_feedback_dismissed WHERE workoutId = ?").run(input.workoutId);
}

export function getPendingWorkoutFeedback(limit = 2, days = 7) {
  return db
    .prepare(
      `SELECT w.id as workoutId, w.sport, w.startAt, w.distanceM, w.durationSec
       FROM workouts w
       LEFT JOIN workout_feedback f ON f.workoutId = w.id
       LEFT JOIN workout_feedback_dismissed d ON d.workoutId = w.id
       WHERE f.workoutId IS NULL
         AND d.workoutId IS NULL
         AND w.startAt >= datetime('now', '-' || ? || ' days')
       ORDER BY w.startAt DESC
       LIMIT ?`
    )
    .all(days, limit) as Array<{
    workoutId: string;
    sport: "run" | "bike" | "swim" | "strength";
    startAt: string;
    distanceM: number | null;
    durationSec: number;
  }>;
}

export function dismissWorkoutFeedback(workoutId: string) {
  db.prepare(
    `INSERT INTO workout_feedback_dismissed (workoutId, dismissedAt)
     VALUES (?, ?)
     ON CONFLICT(workoutId) DO UPDATE SET dismissedAt = excluded.dismissedAt`
  ).run(workoutId, new Date().toISOString());
}

export function getWorkoutFeedback(workoutId: string) {
  return db
    .prepare(
      `SELECT
        workoutId, date, sport, perceivedEffort, bodyFeel, breathingFeel,
        rpeScore, legsLoadScore, painScore, painArea, addFiveKmScore, recoveryScore,
        breathingScore, overallLoadScore, preRunNutritionScore, environmentScore, satisfactionScore,
        strengthTechniqueScore, strengthFailureProximityScore, strengthFocusArea,
        openNote, fuelingSource, fuelingQuantity, updatedAt
       FROM workout_feedback
       WHERE workoutId = ?
       LIMIT 1`
    )
    .get(workoutId) as
    | {
        workoutId: string;
        date: string;
        sport: "run" | "bike" | "swim" | "strength";
        perceivedEffort: "easy" | "moderate" | "hard" | "max";
        bodyFeel: "fresh" | "normal" | "heavy" | "pain";
        breathingFeel: "easy" | "steady" | "hard";
        rpeScore?: number | null;
        legsLoadScore?: number | null;
        painScore?: number | null;
        painArea?: string | null;
        addFiveKmScore?: number | null;
        recoveryScore?: number | null;
        breathingScore?: number | null;
        overallLoadScore?: number | null;
        preRunNutritionScore?: number | null;
        environmentScore?: number | null;
        satisfactionScore?: number | null;
        strengthTechniqueScore?: number | null;
        strengthFailureProximityScore?: number | null;
        strengthFocusArea?: string | null;
        openNote?: string | null;
        fuelingSource?: string | null;
        fuelingQuantity?: number | null;
        updatedAt: string;
      }
    | undefined;
}

export function getWorkoutFeedbackForDate(date: string) {
  return db
    .prepare(
      `SELECT
        f.workoutId,
        f.perceivedEffort,
        f.bodyFeel,
        f.breathingFeel,
        f.rpeScore,
        f.legsLoadScore,
        f.painScore,
        f.painArea,
        f.addFiveKmScore,
        f.recoveryScore,
        f.breathingScore,
        f.overallLoadScore,
        f.preRunNutritionScore,
        f.environmentScore,
        f.satisfactionScore,
        f.strengthTechniqueScore,
        f.strengthFailureProximityScore,
        f.strengthFocusArea,
        f.openNote,
        f.fuelingSource,
        f.fuelingQuantity,
        f.updatedAt
       FROM workout_feedback f
       JOIN workouts w ON w.id = f.workoutId
       WHERE substr(w.startAt, 1, 10) = ?`
    )
    .all(date) as Array<{
    workoutId: string;
    perceivedEffort: "easy" | "moderate" | "hard" | "max";
    bodyFeel: "fresh" | "normal" | "heavy" | "pain";
    breathingFeel: "easy" | "steady" | "hard";
    rpeScore?: number | null;
    legsLoadScore?: number | null;
    painScore?: number | null;
    painArea?: string | null;
    addFiveKmScore?: number | null;
    recoveryScore?: number | null;
    breathingScore?: number | null;
    overallLoadScore?: number | null;
    preRunNutritionScore?: number | null;
    environmentScore?: number | null;
    satisfactionScore?: number | null;
    strengthTechniqueScore?: number | null;
    strengthFailureProximityScore?: number | null;
    strengthFocusArea?: string | null;
    openNote?: string | null;
    fuelingSource?: string | null;
    fuelingQuantity?: number | null;
    updatedAt?: string | null;
    sport?: "run" | "bike" | "swim" | "strength";
  }>;
}

export function hasWorkoutByCanonicalKey(canonicalKey: string) {
  if (!canonicalKey) return false;
  const row = db.prepare("SELECT 1 as ok FROM workouts WHERE canonicalKey = ? LIMIT 1").get(canonicalKey) as { ok: number } | undefined;
  return Boolean(row?.ok);
}

export function listRunningShoes() {
  const rows = db
    .prepare(
      `SELECT
        s.*,
        COALESCE(SUM(CASE WHEN w.sport = 'run' THEN COALESCE(w.distanceM, 0) ELSE 0 END), 0) / 1000.0 as usedKm
       FROM running_shoes s
       LEFT JOIN workouts w ON w.shoeId = s.id
       WHERE s.active = 1
       GROUP BY s.id
       ORDER BY s.isDefault DESC, s.updatedAt DESC`
    )
    .all() as Array<RunningShoe & { usedKm: number }>;

  return rows.map((r) => ({
    ...r,
    isDefault: Boolean((r as unknown as { isDefault: number }).isDefault),
    active: Boolean((r as unknown as { active: number }).active),
    startKm: Number(r.startKm),
    targetKm: Number(r.targetKm),
    usedKm: Math.round(Number(r.usedKm) * 100) / 100,
    totalKm: Math.round((Number(r.startKm) + Number(r.usedKm)) * 100) / 100,
    remainingKm: Math.round((Number(r.targetKm) - (Number(r.startKm) + Number(r.usedKm))) * 100) / 100
  }));
}

export function listRunningShoeBrands() {
  const rows = db.prepare(`SELECT name FROM running_shoe_brands ORDER BY name COLLATE NOCASE`).all() as Array<{ name: string }>;
  return rows.map((row) => row.name);
}

export function createRunningShoeBrand(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const existing = db
    .prepare("SELECT name FROM running_shoe_brands WHERE LOWER(name) = LOWER(?) LIMIT 1")
    .get(trimmed) as { name: string } | undefined;
  if (existing) return existing.name;
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare("INSERT INTO running_shoe_brands (id, name, createdAt) VALUES (?, ?, ?)").run(id, trimmed, now);
  return trimmed;
}

export function getDefaultRunningShoe() {
  return (
    (db
      .prepare("SELECT id, name, brand FROM running_shoes WHERE isDefault = 1 AND active = 1 LIMIT 1")
      .get() as { id: string; name: string; brand: RunningShoeBrand } | undefined) ?? null
  );
}

export function createRunningShoe(input: {
  name: string;
  brand: RunningShoeBrand;
  startKm?: number;
  targetKm: number;
  isDefault?: boolean;
}) {
  createRunningShoeBrand(input.brand);
  const id = randomUUID();
  const now = new Date().toISOString();

  if (input.isDefault) {
    db.prepare("UPDATE running_shoes SET isDefault = 0, updatedAt = ? WHERE isDefault = 1").run(now);
  }

  db.prepare(
    `INSERT INTO running_shoes (id, name, brand, startKm, targetKm, isDefault, active, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
  ).run(
    id,
    input.name.trim(),
    input.brand,
    Math.max(0, input.startKm ?? 0),
    Math.max(1, input.targetKm),
    input.isDefault ? 1 : 0,
    now,
    now
  );

  return id;
}

export function setDefaultRunningShoe(shoeId: string) {
  const now = new Date().toISOString();
  db.prepare("UPDATE running_shoes SET isDefault = 0, updatedAt = ? WHERE isDefault = 1").run(now);
  db.prepare("UPDATE running_shoes SET isDefault = 1, updatedAt = ? WHERE id = ?").run(now, shoeId);
}

export function updateRunningShoe(input: {
  id: string;
  name: string;
  brand: RunningShoeBrand;
  startKm: number;
  targetKm: number;
  isDefault?: boolean;
}) {
  const now = new Date().toISOString();
  if (input.isDefault) {
    db.prepare("UPDATE running_shoes SET isDefault = 0, updatedAt = ? WHERE isDefault = 1").run(now);
  }
  db.prepare(
    `UPDATE running_shoes
     SET name = ?,
         brand = ?,
         startKm = ?,
         targetKm = ?,
         isDefault = CASE WHEN ? THEN 1 ELSE isDefault END,
         updatedAt = ?
     WHERE id = ?`
  ).run(
    input.name.trim(),
    input.brand,
    Math.max(0, input.startKm),
    Math.max(1, input.targetKm),
    input.isDefault ? 1 : 0,
    now,
    input.id
  );
}

export function dedupeWorkouts() {
  const rows = db
    .prepare(
      `SELECT id, source, sport, startAt, durationSec, distanceM, shoeId, shoeKmAtAssign, rawFilePath
       FROM workouts
       ORDER BY startAt ASC`
    )
    .all() as Array<{
    id: string;
    source: "strava" | "healthfit" | "smashrun" | "bavel";
    sport: string;
    startAt: string;
    durationSec: number;
    distanceM: number | null;
    shoeId: string | null;
    shoeKmAtAssign: number | null;
    rawFilePath: string | null;
  }>;

  const sourceRank: Record<string, number> = {
    strava: 4,
    healthfit: 3,
    smashrun: 2,
    bavel: 1
  };

  let removed = 0;
  let mergedGroups = 0;
  db.exec("BEGIN");
  try {
    for (let i = 0; i < rows.length; i += 1) {
      const base = rows[i];
      if (!base) continue;

      const cluster = [base];
      const baseTs = Date.parse(base.startAt);
      for (let j = i + 1; j < rows.length; j += 1) {
        const candidate = rows[j];
        const candidateTs = Date.parse(candidate.startAt);
        const secDiff = Math.abs(candidateTs - baseTs) / 1000;
        if (secDiff > 3 * 3600) break;
        if (candidate.sport !== base.sport) continue;
        const sameSource = candidate.source === base.source;
        if (sameSource && secDiff > 20 * 60) continue;
        const durationDiff = Math.abs(candidate.durationSec - base.durationSec);
        const durationRatio = durationDiff / Math.max(60, base.durationSec);
        if (sameSource) {
          if (durationDiff > 120 && durationRatio > 0.08) continue;
        } else if (durationDiff > 18 * 60 && durationRatio > 0.22) {
          continue;
        }
        const baseDist = base.distanceM ?? null;
        const candDist = candidate.distanceM ?? null;
        if (baseDist != null && candDist != null) {
          const distDiff = Math.abs(baseDist - candDist);
          const ratio = distDiff / Math.max(1, baseDist);
          if (sameSource) {
            if (distDiff > 400 && ratio > 0.08) continue;
          } else if (distDiff > 2500 && ratio > 0.22) {
            continue;
          }
        }
        cluster.push(candidate);
      }

      if (cluster.length < 2) continue;
      mergedGroups += 1;

      const keeper = [...cluster].sort((a, b) => {
        const aScore =
          (sourceRank[a.source] ?? 0) * 10000 +
          (a.distanceM ? 1000 : 0) +
          (a.rawFilePath?.toLowerCase().endsWith(".gpx") ? 200 : 0);
        const bScore =
          (sourceRank[b.source] ?? 0) * 10000 +
          (b.distanceM ? 1000 : 0) +
          (b.rawFilePath?.toLowerCase().endsWith(".gpx") ? 200 : 0);
        if (bScore !== aScore) return bScore - aScore;
        return Date.parse(b.startAt) - Date.parse(a.startAt);
      })[0];

      for (const dup of cluster) {
        if (dup.id === keeper.id) continue;

        if (!keeper.shoeId && dup.shoeId) {
          db.prepare("UPDATE workouts SET shoeId = ?, shoeKmAtAssign = ? WHERE id = ?").run(dup.shoeId, dup.shoeKmAtAssign, keeper.id);
          keeper.shoeId = dup.shoeId;
          keeper.shoeKmAtAssign = dup.shoeKmAtAssign;
        }

        db.prepare(
          `INSERT INTO workout_feedback (
             workoutId, date, sport, perceivedEffort, bodyFeel, breathingFeel,
             rpeScore, legsLoadScore, painScore, painArea, addFiveKmScore, recoveryScore,
             breathingScore, overallLoadScore, preRunNutritionScore, environmentScore, satisfactionScore,
             strengthTechniqueScore, strengthFailureProximityScore, strengthFocusArea,
             openNote, fuelingSource, fuelingQuantity, updatedAt
           )
           SELECT
             ?, date, sport, perceivedEffort, bodyFeel, breathingFeel,
             rpeScore, legsLoadScore, painScore, painArea, addFiveKmScore, recoveryScore,
             breathingScore, overallLoadScore, preRunNutritionScore, environmentScore, satisfactionScore,
             strengthTechniqueScore, strengthFailureProximityScore, strengthFocusArea,
             openNote, fuelingSource, fuelingQuantity, updatedAt
           FROM workout_feedback
           WHERE workoutId = ?
             AND NOT EXISTS (SELECT 1 FROM workout_feedback WHERE workoutId = ?)`
        ).run(keeper.id, dup.id, keeper.id);
        db.prepare("DELETE FROM workout_feedback WHERE workoutId = ?").run(dup.id);

        db.prepare(
          `INSERT INTO workout_feedback_dismissed (workoutId, dismissedAt)
           SELECT ?, dismissedAt
           FROM workout_feedback_dismissed
           WHERE workoutId = ?
             AND NOT EXISTS (SELECT 1 FROM workout_feedback_dismissed WHERE workoutId = ?)`
        ).run(keeper.id, dup.id, keeper.id);
        db.prepare("DELETE FROM workout_feedback_dismissed WHERE workoutId = ?").run(dup.id);

        db.prepare("DELETE FROM workouts WHERE id = ?").run(dup.id);
        removed += 1;
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return { removed, mergedGroups };
}

export function assignShoeToWorkout(workoutId: string, shoeId: string | null): number | null {
  if (!shoeId) {
    db.prepare("UPDATE workouts SET shoeId = NULL, shoeKmAtAssign = NULL WHERE id = ?").run(workoutId);
    return null;
  }

  const workout = db
    .prepare(
      `SELECT sport, COALESCE(distanceM, 0) AS distanceM
       FROM workouts
       WHERE id = ?
       LIMIT 1`
    )
    .get(workoutId) as { sport: string; distanceM: number } | undefined;
  if (!workout) return null;

  const shoe = db
    .prepare(
      `SELECT startKm
       FROM running_shoes
       WHERE id = ?
       LIMIT 1`
    )
    .get(shoeId) as { startKm: number } | undefined;
  if (!shoe) return null;

  const usageExcludingWorkout = db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN sport = 'run' THEN COALESCE(distanceM, 0) ELSE 0 END), 0) / 1000.0 AS usedKm
       FROM workouts
       WHERE shoeId = ?
         AND id <> ?`
    )
    .get(shoeId, workoutId) as { usedKm: number };

  const workoutDistanceKm = workout.sport === "run" ? Math.max(0, workout.distanceM / 1000.0) : 0;
  const shoeKmAtAssign = Number((shoe.startKm + (usageExcludingWorkout.usedKm ?? 0) + workoutDistanceKm).toFixed(3));

  db.prepare(
    `UPDATE workouts
     SET shoeId = ?,
         shoeKmAtAssign = ?
     WHERE id = ?`
  ).run(shoeId, shoeKmAtAssign, workoutId);

  return shoeKmAtAssign;
}

export function getPendingRunShoeAssignments(limit = 6) {
  return db
    .prepare(
      `SELECT id as workoutId, startAt, distanceM, durationSec
       FROM workouts
       WHERE sport = 'run'
         AND shoeId IS NULL
         AND startAt >= datetime('now', '-21 days')
       ORDER BY startAt DESC
       LIMIT ?`
    )
    .all(limit) as Array<{ workoutId: string; startAt: string; distanceM: number | null; durationSec: number }>;
}

export function getRules(): LogicRules {
  const row = db.prepare("SELECT * FROM logic_rules WHERE id = 1").get() as {
    weeklyTimeBudgetHours: number;
    runPriority: number;
    crossTrainingWeight: number;
    hardDaysPerWeek: number;
    noHardIfLowReadiness: number;
    minEasyBetweenHard: number;
    injuryFlags: string;
  };

  return {
    weeklyTimeBudgetHours: row.weeklyTimeBudgetHours,
    runPriority: row.runPriority,
    crossTrainingWeight: row.crossTrainingWeight,
    hardDaysPerWeek: row.hardDaysPerWeek,
    noHardIfLowReadiness: row.noHardIfLowReadiness,
    minEasyBetweenHard: row.minEasyBetweenHard,
    injuryFlags: JSON.parse(row.injuryFlags || "[]") as string[]
  };
}

export function upsertRules(rules: LogicRules) {
  db.prepare(
    `UPDATE logic_rules
     SET weeklyTimeBudgetHours = @weeklyTimeBudgetHours,
         runPriority = @runPriority,
         crossTrainingWeight = @crossTrainingWeight,
         hardDaysPerWeek = @hardDaysPerWeek,
         noHardIfLowReadiness = @noHardIfLowReadiness,
         minEasyBetweenHard = @minEasyBetweenHard,
         injuryFlags = @injuryFlags,
         updatedAt = @updatedAt
     WHERE id = 1`
  ).run({ ...rules, injuryFlags: JSON.stringify(rules.injuryFlags), updatedAt: new Date().toISOString() });
}

export function createIngestRun(filesQueued: number) {
  const id = randomUUID();
  db.prepare(
    "INSERT INTO ingest_runs (id, startedAt, success, filesQueued, filesIngested, errors) VALUES (?, ?, 0, ?, 0, NULL)"
  ).run(id, new Date().toISOString(), filesQueued);
  return id;
}

export function finishIngestRun(id: string, success: boolean, filesIngested: number, errors: string[] = []) {
  db.prepare(
    `UPDATE ingest_runs
     SET finishedAt = ?, success = ?, filesIngested = ?, errors = ?
     WHERE id = ?`
  ).run(new Date().toISOString(), success ? 1 : 0, filesIngested, errors.length ? JSON.stringify(errors) : null, id);
}

export function getIngestStatus() {
  const lastRun = db.prepare("SELECT * FROM ingest_runs ORDER BY startedAt DESC LIMIT 1").get() as
    | {
        startedAt: string;
        finishedAt: string | null;
        success: number;
        filesQueued: number;
        filesIngested: number;
        errors: string | null;
      }
    | undefined;

  const lastSuccess = db
    .prepare("SELECT finishedAt FROM ingest_runs WHERE success = 1 ORDER BY finishedAt DESC LIMIT 1")
    .get() as { finishedAt: string } | undefined;

  return {
    lastRunAt: lastRun?.startedAt ?? null,
    lastSuccessAt: lastSuccess?.finishedAt ?? null,
    pendingJobs: lastRun && !lastRun.finishedAt ? 1 : 0,
    failedFiles: lastRun?.errors ? (JSON.parse(lastRun.errors) as string[]) : []
  };
}

export function resetIngestData() {
  db.exec(`
    DELETE FROM workout_best_efforts;
    DELETE FROM nutrition_daily_plan;
    DELETE FROM nutrition_events;
    DELETE FROM nutrition_meal_activation;
    DELETE FROM nutrition_meal_history;
    DELETE FROM workouts;
    DELETE FROM ingest_runs;
  `);
}

export function setForecastOverride(date: string, optionId: string, optionJson: string) {
  db.prepare(
    `INSERT INTO forecast_overrides (date, optionId, optionJson, updatedAt)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       optionId = excluded.optionId,
       optionJson = excluded.optionJson,
       updatedAt = excluded.updatedAt`
  ).run(date, optionId, optionJson, new Date().toISOString());
}

export function getForecastOverridesBetween(fromDate: string, toDate: string) {
  const rows = db
    .prepare("SELECT date, optionId, optionJson FROM forecast_overrides WHERE date >= ? AND date <= ?")
    .all(fromDate, toDate) as Array<{ date: string; optionId: string; optionJson: string }>;

  return rows;
}

export function setForecastFeedback(date: string, effort: "light" | "as_planned" | "hard" | "skipped") {
  const adjustMap = {
    light: -8,
    as_planned: 0,
    hard: 10,
    skipped: -18
  } as const;
  const loadAdjust = adjustMap[effort];

  db.prepare(
    `INSERT INTO forecast_feedback (date, effort, loadAdjust, updatedAt)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       effort = excluded.effort,
       loadAdjust = excluded.loadAdjust,
       updatedAt = excluded.updatedAt`
  ).run(date, effort, loadAdjust, new Date().toISOString());
}

export function getForecastFeedbackBetween(fromDate: string, toDate: string) {
  return db
    .prepare("SELECT date, effort, loadAdjust FROM forecast_feedback WHERE date >= ? AND date <= ?")
    .all(fromDate, toDate) as Array<{ date: string; effort: "light" | "as_planned" | "hard" | "skipped"; loadAdjust: number }>;
}

function weeklyPlanTargetWeekStart(date = formatISODate()) {
  return isSaturdayISO(date) ? addDaysISO(startOfTrainingWeekISO(date), 7) : startOfTrainingWeekISO(date);
}

export function getWeeklyPlan(date = formatISODate()) {
  const row = db.prepare("SELECT profile, availability, lockedWeekStart FROM weekly_plan WHERE id = 1").get() as {
    profile: string;
    availability: string;
    lockedWeekStart: string | null;
  };

  const legacyToMode: Record<string, "free" | "balanced" | "busy" | "vacation"> = {
    build: "free",
    balanced: "balanced",
    easy: "busy",
    free: "free",
    busy: "busy",
    vacation: "vacation"
  };

  const mode = legacyToMode[row?.profile ?? "balanced"] ?? "balanced";
  const availability =
    mode === "free" ? "high" :
    mode === "busy" ? "low" :
    mode === "vacation" ? "low" :
    "normal";

  const targetWeekStart = weeklyPlanTargetWeekStart(date);
  const isLocked = row?.lockedWeekStart === targetWeekStart;

  return {
    profile: mode,
    availability,
    targetWeekStart,
    lockedWeekStart: row?.lockedWeekStart ?? null,
    isLocked,
    canEdit: !isLocked
  };
}

export function setWeeklyPlan(profile: "free" | "balanced" | "busy" | "vacation", date = formatISODate()) {
  const availability =
    profile === "free" ? "high" :
    profile === "busy" ? "low" :
    profile === "vacation" ? "low" :
    "normal";
  const targetWeekStart = weeklyPlanTargetWeekStart(date);
  db.prepare(
    `UPDATE weekly_plan
     SET profile = ?, availability = ?, lockedWeekStart = ?, updatedAt = ?
     WHERE id = 1`
  ).run(profile, availability, targetWeekStart, new Date().toISOString());
}

export function unlockWeeklyPlan(date = formatISODate()) {
  db.prepare(
    `UPDATE weekly_plan
     SET lockedWeekStart = NULL, updatedAt = ?
     WHERE id = 1`
  ).run(new Date().toISOString());
  return getWeeklyPlan(date);
}

export function listPainAreas() {
  return db.prepare("SELECT id, name FROM pain_areas ORDER BY name ASC").all() as Array<{ id: string; name: string }>;
}

export function addPainArea(name: string) {
  const clean = name.trim();
  if (!clean) return null;

  const existing = db.prepare("SELECT id, name FROM pain_areas WHERE name = ? LIMIT 1").get(clean) as { id: string; name: string } | undefined;
  if (existing) return existing;

  const id = randomUUID();
  db.prepare("INSERT INTO pain_areas (id, name, createdAt) VALUES (?, ?, ?)").run(id, clean, new Date().toISOString());
  return { id, name: clean };
}

export function getAthleteProfile(): AthleteProfile {
  const row = db
    .prepare(
      "SELECT restingHrBaseline, hrvBaseline, vo2MaxBaseline, sleepHoursBaseline, sourceSummaryJson, updatedAt FROM athlete_profile WHERE id = 1"
    )
    .get() as
    | {
        restingHrBaseline: number | null;
        hrvBaseline: number | null;
        vo2MaxBaseline: number | null;
        sleepHoursBaseline: number | null;
        sourceSummaryJson: string | null;
        updatedAt: string;
      }
    | undefined;

  if (!row) {
    return {};
  }

  return {
    restingHrBaseline: row.restingHrBaseline,
    hrvBaseline: row.hrvBaseline,
    vo2MaxBaseline: row.vo2MaxBaseline,
    sleepHoursBaseline: row.sleepHoursBaseline,
    sourceSummaryJson: row.sourceSummaryJson,
    importedAt: row.updatedAt
  };
}

export function upsertAthleteProfile(profile: AthleteProfile) {
  db.prepare(
    `UPDATE athlete_profile
     SET restingHrBaseline = @restingHrBaseline,
         hrvBaseline = @hrvBaseline,
         vo2MaxBaseline = @vo2MaxBaseline,
         sleepHoursBaseline = @sleepHoursBaseline,
         sourceSummaryJson = @sourceSummaryJson,
         updatedAt = @updatedAt
     WHERE id = 1`
  ).run({
    restingHrBaseline: profile.restingHrBaseline ?? null,
    hrvBaseline: profile.hrvBaseline ?? null,
    vo2MaxBaseline: profile.vo2MaxBaseline ?? null,
    sleepHoursBaseline: profile.sleepHoursBaseline ?? null,
    sourceSummaryJson: profile.sourceSummaryJson ?? null,
    updatedAt: new Date().toISOString()
  });
}

export function clearBestEffortsForWorkout(workoutId: string) {
  db.prepare("DELETE FROM workout_best_efforts WHERE workoutId = ?").run(workoutId);
}

export function insertBestEfforts(
  workoutId: string,
  efforts: Array<{
    distanceKey: string;
    timeSec: number;
    source: string;
    segmentStartSec: number | null;
    segmentEndSec: number | null;
  }>
) {
  const stmt = db.prepare(
    `INSERT INTO workout_best_efforts (id, workoutId, distanceKey, timeSec, source, segmentStartSec, segmentEndSec, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(workoutId, distanceKey, source, segmentStartSec, segmentEndSec) DO UPDATE SET
       timeSec = excluded.timeSec,
       createdAt = excluded.createdAt`
  );
  const now = new Date().toISOString();
  for (const effort of efforts) {
    stmt.run(
      randomUUID(),
      workoutId,
      effort.distanceKey,
      effort.timeSec,
      effort.source,
      effort.segmentStartSec,
      effort.segmentEndSec,
      now
    );
  }
}

export function getTopEfforts(distanceKey: string, limit = 5, includeSegments = false): TopEffort[] {
  return db
    .prepare(
      `SELECT
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
      WHERE e.distanceKey = ?
        AND (? = 1 OR e.source = 'whole_workout')
      ORDER BY e.timeSec ASC,
               CASE WHEN e.source = 'rolling_segment' THEN 0 ELSE 1 END ASC,
               w.startAt DESC
      LIMIT ?`
    )
    .all(distanceKey, includeSegments ? 1 : 0, limit)
    .map((row: any) => ({
      ...row,
      distanceKm:
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
                      : 30
    })) as TopEffort[];
}

export function getTopEffortsForWorkout(workoutId: string): TopEffort[] {
  return db
    .prepare(
      `SELECT
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
      WHERE e.workoutId = ?
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
        CASE WHEN e.source = 'rolling_segment' THEN 0 ELSE 1 END ASC`
    )
    .all(workoutId)
    .map((row: any) => ({
      ...row,
      distanceKm:
        row.distanceKey === "1k"
          ? 1
          : row.distanceKey === "3k"
            ? 3
            : row.distanceKey === "5k"
              ? 5
              : row.distanceKey === "10k"
                ? 10
                : row.distanceKey === "15k"
                  ? 15
                  : row.distanceKey === "half"
                    ? 21.0975
                    : row.distanceKey === "25k"
                      ? 25
                      : 30
    })) as TopEffort[];
}

function computeKcalFromMacros(proteinG: number, carbsG: number, fatG: number) {
  return Math.round(proteinG * 4 + carbsG * 4 + fatG * 9);
}

export function upsertNutritionDailyPlan(input: Omit<NutritionDailyPlan, "updatedAt">) {
  const totalKcal =
    typeof input.totalKcal === "number" && Number.isFinite(input.totalKcal)
      ? Math.round(input.totalKcal)
      : computeKcalFromMacros(input.proteinG, input.carbsG, input.fatG);

  db.prepare(
    `INSERT INTO nutrition_daily_plan
     (date, carbsG, proteinG, fatG, totalKcal, hydrationMl, preWorkoutNote, postWorkoutNote, rationaleJson, updatedAt)
     VALUES (@date, @carbsG, @proteinG, @fatG, @totalKcal, @hydrationMl, @preWorkoutNote, @postWorkoutNote, @rationaleJson, @updatedAt)
     ON CONFLICT(date) DO UPDATE SET
       carbsG = excluded.carbsG,
       proteinG = excluded.proteinG,
       fatG = excluded.fatG,
       totalKcal = excluded.totalKcal,
       hydrationMl = excluded.hydrationMl,
       preWorkoutNote = excluded.preWorkoutNote,
       postWorkoutNote = excluded.postWorkoutNote,
       rationaleJson = excluded.rationaleJson,
       updatedAt = excluded.updatedAt`
  ).run({
    ...input,
    totalKcal,
    updatedAt: new Date().toISOString()
  });
}

export function getNutritionPlan(date: string): NutritionDailyPlan | null {
  const row = db.prepare("SELECT * FROM nutrition_daily_plan WHERE date = ?").get(date) as NutritionDailyPlan | undefined;
  if (!row) return null;
  return {
    ...row,
    totalKcal:
      typeof row.totalKcal === "number" && Number.isFinite(row.totalKcal)
        ? row.totalKcal
        : computeKcalFromMacros(row.proteinG, row.carbsG, row.fatG)
  };
}

export function getNutritionPlansBetween(fromDate: string, toDate: string): NutritionDailyPlan[] {
  const rows = db
    .prepare("SELECT * FROM nutrition_daily_plan WHERE date >= ? AND date <= ? ORDER BY date ASC")
    .all(fromDate, toDate) as NutritionDailyPlan[];
  return rows.map((row) => ({
    ...row,
    totalKcal:
      typeof row.totalKcal === "number" && Number.isFinite(row.totalKcal)
        ? row.totalKcal
        : computeKcalFromMacros(row.proteinG, row.carbsG, row.fatG)
  }));
}

export function listNutritionIngredients() {
  return db
    .prepare(
      `SELECT
         id, name, category, kcalPer100, proteinPer100, carbsPer100, fatPer100,
         defaultUnit, gramsPerUnit, isBuiltIn, createdAt, updatedAt
       FROM nutrition_ingredients
       ORDER BY
         CASE category
           WHEN 'dairy' THEN 1
           WHEN 'protein' THEN 2
           WHEN 'carb' THEN 3
           WHEN 'vegetable' THEN 4
           WHEN 'fruit' THEN 5
           WHEN 'fat' THEN 6
           WHEN 'hydration' THEN 7
           ELSE 8
         END ASC,
         name COLLATE NOCASE ASC`
    )
    .all()
    .map((row: any) => ({
      ...row,
      defaultUnit: normalizeNutritionUnit(row.defaultUnit),
      isBuiltIn: Boolean(row.isBuiltIn)
    })) as NutritionIngredient[];
}

export function listNutritionFavoriteIngredientIds() {
  return db
    .prepare("SELECT ingredientId FROM nutrition_ingredient_favorites ORDER BY updatedAt DESC")
    .all()
    .map((row: any) => String(row.ingredientId));
}

export function setNutritionIngredientFavorite(ingredientId: string, favorite: boolean) {
  const found = db.prepare("SELECT id FROM nutrition_ingredients WHERE id = ? LIMIT 1").get(ingredientId) as
    | { id: string }
    | undefined;
  if (!found) return null;

  if (favorite) {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO nutrition_ingredient_favorites (ingredientId, createdAt, updatedAt)
       VALUES (?, ?, ?)
       ON CONFLICT(ingredientId) DO UPDATE SET updatedAt = excluded.updatedAt`
    ).run(ingredientId, now, now);
    return true;
  }

  db.prepare("DELETE FROM nutrition_ingredient_favorites WHERE ingredientId = ?").run(ingredientId);
  return false;
}

export function createNutritionIngredient(input: {
  name: string;
  category: NutritionIngredientCategory;
  kcalPer100: number;
  proteinPer100: number;
  carbsPer100: number;
  fatPer100: number;
  defaultUnit: NutritionUnit;
  gramsPerUnit: number;
}) {
  const name = input.name.trim();
  if (!name) return null;

  const existing = db.prepare("SELECT id FROM nutrition_ingredients WHERE LOWER(name) = LOWER(?) LIMIT 1").get(name) as
    | { id: string }
    | undefined;
  if (existing?.id) {
    return (db.prepare("SELECT * FROM nutrition_ingredients WHERE id = ?").get(existing.id) as NutritionIngredient | undefined) ?? null;
  }

  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO nutrition_ingredients
     (id, name, category, kcalPer100, proteinPer100, carbsPer100, fatPer100, defaultUnit, gramsPerUnit, isBuiltIn, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
  ).run(
    id,
    name,
    input.category,
    input.kcalPer100,
    input.proteinPer100,
    input.carbsPer100,
    input.fatPer100,
    input.defaultUnit,
    input.gramsPerUnit,
    now,
    now
  );
  return (db.prepare("SELECT * FROM nutrition_ingredients WHERE id = ?").get(id) as NutritionIngredient | undefined) ?? null;
}

export function replaceNutritionPantryItems(
  date: string,
  items: Array<{ ingredientId: string; quantity: number; unit: NutritionUnit }>
) {
  const insertStmt = db.prepare(
    `INSERT INTO nutrition_pantry_items
     (id, date, ingredientId, quantity, unit, gramsEffective, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM nutrition_pantry_items WHERE date = ?").run(date);
    for (const item of items) {
      const ingredient = db
        .prepare("SELECT name, gramsPerUnit FROM nutrition_ingredients WHERE id = ? LIMIT 1")
        .get(item.ingredientId) as { name: string; gramsPerUnit: number } | undefined;
      if (!ingredient) continue;
      const quantity = Math.max(0, Number(item.quantity));
      if (!Number.isFinite(quantity) || quantity <= 0) continue;
      const unit = normalizeNutritionUnit(item.unit);
      const gramsEffective = nutritionQuantityToGrams(quantity, unit, {
        name: ingredient.name,
        gramsPerUnit: ingredient.gramsPerUnit
      });
      const now = new Date().toISOString();
      insertStmt.run(randomUUID(), date, item.ingredientId, quantity, unit, gramsEffective, now, now);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function getNutritionPantryItems(date: string) {
  return db
    .prepare(
      `SELECT
         p.id, p.date, p.ingredientId, p.quantity, p.unit, p.gramsEffective,
         i.name as ingredientName, i.category as ingredientCategory
       FROM nutrition_pantry_items p
       JOIN nutrition_ingredients i ON i.id = p.ingredientId
       WHERE p.date = ?
       ORDER BY i.name COLLATE NOCASE ASC`
    )
    .all(date)
    .map((row: any) => ({
      ...row,
      unit: normalizeNutritionUnit(row.unit)
    })) as NutritionPantryItem[];
}

export function getNutritionPreferenceMap() {
  const rows = db
    .prepare("SELECT ingredientId, mealSlot, score FROM nutrition_preferences")
    .all() as Array<{ ingredientId: string; mealSlot: MealSlot; score: number }>;
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(`${row.ingredientId}|${row.mealSlot}`, Number(row.score) || 0);
  }
  return map;
}

export function upsertNutritionMealHistory(
  meals: Array<{
    id: string;
    date: string;
    slot: MealSlot;
    title: string;
    itemsJson: string;
    totalKcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    compromiseNote?: string | null;
    accepted?: boolean | null;
  }>
) {
  const stmt = db.prepare(
    `INSERT INTO nutrition_meal_history
     (id, date, mealSlot, title, itemsJson, totalKcal, proteinG, carbsG, fatG, compromiseNote, accepted, createdAt)
     VALUES (@id, @date, @mealSlot, @title, @itemsJson, @totalKcal, @proteinG, @carbsG, @fatG, @compromiseNote, @accepted, @createdAt)
     ON CONFLICT(id) DO UPDATE SET
       date = excluded.date,
       mealSlot = excluded.mealSlot,
       title = excluded.title,
       itemsJson = excluded.itemsJson,
       totalKcal = excluded.totalKcal,
       proteinG = excluded.proteinG,
       carbsG = excluded.carbsG,
       fatG = excluded.fatG,
       compromiseNote = excluded.compromiseNote,
       accepted = COALESCE(excluded.accepted, nutrition_meal_history.accepted),
       createdAt = excluded.createdAt`
  );
  const now = new Date().toISOString();
  for (const meal of meals) {
    stmt.run({
      id: meal.id,
      date: meal.date,
      mealSlot: meal.slot,
      title: meal.title,
      itemsJson: meal.itemsJson,
      totalKcal: meal.totalKcal,
      proteinG: meal.proteinG,
      carbsG: meal.carbsG,
      fatG: meal.fatG,
      compromiseNote: meal.compromiseNote ?? null,
      accepted: typeof meal.accepted === "boolean" ? (meal.accepted ? 1 : 0) : null,
      createdAt: now
    });
  }
}

export function getNutritionMealsByDate(date: string) {
  const rows = db
    .prepare(
      `SELECT id, date, mealSlot, title, itemsJson, totalKcal, proteinG, carbsG, fatG, compromiseNote, accepted
       FROM nutrition_meal_history
       WHERE date = ?
       ORDER BY CASE mealSlot
         WHEN 'breakfast' THEN 1
         WHEN 'pre_run' THEN 2
         WHEN 'lunch' THEN 3
         WHEN 'dinner' THEN 4
         WHEN 'snack' THEN 5
         WHEN 'drinks' THEN 6
         ELSE 7 END ASC`
    )
    .all(date) as Array<{
    id: string;
    date: string;
    mealSlot: MealSlot;
    title: string;
    itemsJson: string;
    totalKcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    compromiseNote: string | null;
    accepted: number | null;
  }>;

  return rows.map((row) => {
    const parsedItems = JSON.parse(row.itemsJson) as NutritionMeal["items"];
    return {
      id: row.id,
      date: row.date,
      slot: row.mealSlot,
      title: row.title,
      items: parsedItems,
      totalKcal: row.totalKcal,
      proteinG: row.proteinG,
      carbsG: row.carbsG,
      fatG: row.fatG,
      compromiseNote: row.compromiseNote ?? undefined,
      accepted: row.accepted === null ? null : Boolean(row.accepted)
    } satisfies NutritionMeal;
  });
}

export function getActiveNutritionMealSlots(date: string) {
  const rows = db
    .prepare("SELECT mealSlot FROM nutrition_meal_activation WHERE date = ?")
    .all(date) as Array<{ mealSlot: MealSlot }>;
  return rows.map((row) => row.mealSlot);
}

export function activateNutritionMealSlot(date: string, slot: MealSlot) {
  db.prepare(
    `INSERT INTO nutrition_meal_activation (date, mealSlot, createdAt)
     VALUES (?, ?, ?)
     ON CONFLICT(date, mealSlot) DO NOTHING`
  ).run(date, slot, new Date().toISOString());
}

export function deactivateNutritionMealSlot(date: string, slot: MealSlot) {
  db.prepare("DELETE FROM nutrition_meal_activation WHERE date = ? AND mealSlot = ?").run(date, slot);
}

export function setNutritionMealFeedback(mealId: string, accepted: boolean | null) {
  const meal = db
    .prepare("SELECT mealSlot, itemsJson FROM nutrition_meal_history WHERE id = ? LIMIT 1")
    .get(mealId) as { mealSlot: MealSlot; itemsJson: string } | undefined;
  if (!meal) return false;

  db.prepare("UPDATE nutrition_meal_history SET accepted = ? WHERE id = ?").run(accepted === null ? null : accepted ? 1 : 0, mealId);

  if (accepted !== true && accepted !== false) {
    return true;
  }

  const items = JSON.parse(meal.itemsJson) as Array<{ ingredientId: string }>;
  const now = new Date().toISOString();
  const adjustment = accepted ? 1 : -1;

  for (const item of items) {
    if (!item.ingredientId) continue;
    const existing = db
      .prepare("SELECT id, score FROM nutrition_preferences WHERE ingredientId = ? AND mealSlot = ? LIMIT 1")
      .get(item.ingredientId, meal.mealSlot) as { id: string; score: number } | undefined;
    const nextScore = Math.round(((existing?.score ?? 0) * 0.7 + adjustment * 0.3) * 100) / 100;
    if (existing?.id) {
      db.prepare("UPDATE nutrition_preferences SET score = ?, lastUsedAt = ? WHERE id = ?").run(nextScore, now, existing.id);
    } else {
      db.prepare(
        `INSERT INTO nutrition_preferences (id, ingredientId, mealSlot, score, lastUsedAt)
         VALUES (?, ?, ?, ?, ?)`
      ).run(randomUUID(), item.ingredientId, meal.mealSlot, nextScore, now);
    }
  }
  return true;
}

export function deleteNutritionMealHistory(mealId: string) {
  const result = db.prepare("DELETE FROM nutrition_meal_history WHERE id = ?").run(mealId) as { changes: number };
  return result.changes > 0;
}

export function getWorkoutFueling(workoutId: string) {
  return db
    .prepare(
      `SELECT id, workoutId, itemName, quantity, unitLabel, carbsG, kcal, caffeineMg, notes, createdAt, updatedAt
       FROM workout_fueling
       WHERE workoutId = ?
       ORDER BY createdAt ASC`
    )
    .all(workoutId) as WorkoutFuelingEntry[];
}

export function replaceWorkoutFueling(
  workoutId: string,
  items: Array<{
    itemName: string;
    quantity: number;
    unitLabel: string;
    carbsG: number;
    kcal?: number | null;
    caffeineMg?: number | null;
    notes?: string | null;
  }>
) {
  const now = new Date().toISOString();
  db.prepare("DELETE FROM workout_fueling WHERE workoutId = ?").run(workoutId);
  const stmt = db.prepare(
    `INSERT INTO workout_fueling
     (id, workoutId, itemName, quantity, unitLabel, carbsG, kcal, caffeineMg, notes, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  for (const item of items) {
    stmt.run(
      randomUUID(),
      workoutId,
      item.itemName,
      item.quantity,
      item.unitLabel,
      item.carbsG,
      item.kcal ?? null,
      item.caffeineMg ?? null,
      item.notes ?? null,
      now,
      now
    );
  }

  return getWorkoutFueling(workoutId);
}

export function upsertNutritionEvent(date: string, workoutLoad: number, runMinutes: number, runKm: number) {
  db.prepare(
    `INSERT INTO nutrition_events (date, workoutLoad, runMinutes, runKm, generatedAt)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       workoutLoad = excluded.workoutLoad,
       runMinutes = excluded.runMinutes,
       runKm = excluded.runKm,
       generatedAt = excluded.generatedAt`
  ).run(date, workoutLoad, runMinutes, runKm, new Date().toISOString());
}
