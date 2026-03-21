import { dbExec, dbQueryOne, getDbProvider } from "@/lib/db-driver";

let migratePromise: Promise<void> | null = null;

async function hasColumn(table: string, column: string) {
  const provider = getDbProvider();
  if (provider === "postgres") {
    const row = await dbQueryOne<{ exists: boolean }>(
      `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
      ) AS "exists"
      `,
      [table, column]
    );
    return Boolean(row?.exists);
  }

  const rows = await dbQueryOne<{ cols: string }>(
    `
    SELECT json_group_array(name) AS cols
    FROM pragma_table_info($1)
    `,
    [table]
  );
  const cols = typeof rows?.cols === "string" ? (JSON.parse(rows.cols) as string[]) : [];
  return cols.includes(column);
}

async function addColumnIfMissing(table: string, column: string, definitionSql: string) {
  if (await hasColumn(table, column)) return;
  const provider = getDbProvider();
  if (provider === "postgres") {
    await dbExec(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${definitionSql};`);
    return;
  }
  try {
    await dbExec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definitionSql};`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/duplicate column name/i.test(message)) return;
    throw error;
  }
}

export async function migrateDb() {
  if (!migratePromise) {
    migratePromise = (async () => {
      // Base schema: kept intentionally close to the existing SQLite schema so it can run on both engines.
      await dbExec(`
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
          minEasyIfFatigueHigh REAL NOT NULL DEFAULT 0,
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

        CREATE TABLE IF NOT EXISTS strava_tokens (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          athleteId TEXT,
          accessToken TEXT NOT NULL,
          refreshToken TEXT NOT NULL,
          expiresAt INTEGER NOT NULL,
          scope TEXT,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS strava_webhook (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          subscriptionId TEXT,
          callbackUrl TEXT,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS strava_activity_streams (
          activityId BIGINT PRIMARY KEY,
          streamsJson TEXT NOT NULL,
          fetchedAt TEXT NOT NULL
        );
      `);

      // Indexes that are helpful on both engines.
      await dbExec(`CREATE INDEX IF NOT EXISTS workouts_startAt_idx ON workouts(startAt);`);
      await dbExec(`CREATE INDEX IF NOT EXISTS workouts_sport_startAt_idx ON workouts(sport, startAt);`);
      await dbExec(`CREATE INDEX IF NOT EXISTS workouts_canonical_key_idx ON workouts(canonicalKey);`);
      await dbExec(`CREATE INDEX IF NOT EXISTS nutrition_pantry_date_idx ON nutrition_pantry_items(date);`);
      await dbExec(`CREATE INDEX IF NOT EXISTS nutrition_meal_date_idx ON nutrition_meal_history(date);`);
      await dbExec(`CREATE INDEX IF NOT EXISTS workout_feedback_date_idx ON workout_feedback(date);`);

      // Ensure newer columns exist (forward-compatible with existing local DBs).
      await addColumnIfMissing("workouts", "shoeKmAtAssign", "REAL");
      await addColumnIfMissing("workouts", "canonicalKey", "TEXT");
      await addColumnIfMissing("workouts", "rawFilePath", "TEXT");
      await addColumnIfMissing("workouts", "userId", "TEXT");
      await addColumnIfMissing("workouts", "shoeId", "TEXT");
      await addColumnIfMissing("nutrition_daily_plan", "totalKcal", "REAL DEFAULT 0");
      await addColumnIfMissing("nutrition_meal_history", "compromiseNote", "TEXT");
      await addColumnIfMissing("weekly_plan", "lockedWeekStart", "TEXT");
      await addColumnIfMissing("workout_feedback", "rpeScore", "INTEGER");
      await addColumnIfMissing("workout_feedback", "legsLoadScore", "INTEGER");
      await addColumnIfMissing("workout_feedback", "painScore", "INTEGER");
      await addColumnIfMissing("workout_feedback", "painArea", "TEXT");
      await addColumnIfMissing("workout_feedback", "addFiveKmScore", "INTEGER");
      await addColumnIfMissing("workout_feedback", "recoveryScore", "INTEGER");
      await addColumnIfMissing("workout_feedback", "breathingScore", "INTEGER");
      await addColumnIfMissing("workout_feedback", "overallLoadScore", "INTEGER");
      await addColumnIfMissing("workout_feedback", "preRunNutritionScore", "INTEGER");
      await addColumnIfMissing("workout_feedback", "environmentScore", "INTEGER");
      await addColumnIfMissing("workout_feedback", "satisfactionScore", "INTEGER");
      await addColumnIfMissing("workout_feedback", "strengthTechniqueScore", "INTEGER");
      await addColumnIfMissing("workout_feedback", "strengthFailureProximityScore", "INTEGER");
      await addColumnIfMissing("workout_feedback", "strengthFocusArea", "TEXT");
      await addColumnIfMissing("workout_feedback", "fuelingSource", "TEXT");
      await addColumnIfMissing("workout_feedback", "fuelingQuantity", "REAL");
    })();
  }
  await migratePromise;
}
