import {
  clearBestEffortsForWorkout,
  getTopEfforts,
  getWorkoutById,
  getWorkouts,
  upsertNutritionDailyPlan,
  insertBestEfforts
} from "@/lib/db";
import type { StorageAdapter } from "@/lib/storage/adapter";

export const sqliteStorageAdapter: StorageAdapter = {
  listWorkouts: (limit) => getWorkouts(limit ?? 100000),
  getWorkoutById,
  clearBestEffortsForWorkout,
  insertBestEfforts,
  getTopEfforts,
  upsertNutritionDailyPlan
};
