import type { NutritionDailyPlan, TopEffort, Workout } from "@/lib/types";

export type StorageAdapter = {
  listWorkouts: (limit?: number) => Workout[];
  getWorkoutById: (id: string) => Workout | null;
  clearBestEffortsForWorkout: (workoutId: string) => void;
  insertBestEfforts: (
    workoutId: string,
    efforts: Array<{
      distanceKey: string;
      timeSec: number;
      source: string;
      segmentStartSec: number | null;
      segmentEndSec: number | null;
    }>
  ) => void;
  getTopEfforts: (distanceKey: string, limit?: number) => TopEffort[];
  upsertNutritionDailyPlan: (input: Omit<NutritionDailyPlan, "updatedAt">) => void;
};
