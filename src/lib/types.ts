export type Sport = "run" | "bike" | "swim" | "strength";

export type Workout = {
  id: string;
  source: "strava" | "healthfit" | "bavel" | "smashrun";
  userId?: string | null;
  sport: Sport;
  startAt: string;
  durationSec: number;
  distanceM?: number | null;
  avgHr?: number | null;
  maxHr?: number | null;
  elevationM?: number | null;
  powerAvg?: number | null;
  paceAvg?: number | null;
  tssLike: number;
  trimp: number;
  canonicalKey?: string | null;
  rawFileHash: string;
  rawFilePath?: string | null;
  shoeId?: string | null;
  shoeKmAtAssign?: number | null;
  shoeName?: string | null;
};

export type WorkoutFuelingEntry = {
  id: string;
  workoutId: string;
  itemName: string;
  quantity: number;
  unitLabel: string;
  carbsG: number;
  kcal: number | null;
  caffeineMg: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RunningShoeBrand = string;

export type RunningShoe = {
  id: string;
  name: string;
  brand: RunningShoeBrand;
  startKm: number;
  targetKm: number;
  isDefault: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DailyRecovery = {
  date: string;
  rpe: number;
  sleepHours?: number | null;
  sleepQuality?: number | null;
  hrv?: number | null;
  restingHr?: number | null;
  mood?: number | null;
  sorenessGlobal?: number | null;
  sorenessByArea?: string | null;
  notes?: string | null;
};

export type LogicRules = {
  weeklyTimeBudgetHours: number;
  runPriority: number;
  crossTrainingWeight: number;
  hardDaysPerWeek: number;
  noHardIfLowReadiness: number;
  minEasyBetweenHard: number;
  injuryFlags: string[];
};

export type ScoreSummary = {
  fitnessScore: number;
  fatigueScore: number;
  readinessScore: number;
  atl7: number;
  ctl42: number;
  tsb: number;
  stateTag: "overtraining_risk" | "on_the_spot" | "peaking" | "losing_momentum";
  stateLabel: string;
  stateHint: string;
};

export type Recommendation = {
  workoutType: string;
  durationMin: number;
  intensityZone: string;
  intensityExplanation: string;
  alternatives: string[];
  explanationFactors: string[];
  confidence: number;
  longExplanation: string;
  rationaleDetails: string[];
  primarySession: {
    sport: "run" | "bike" | "swim";
    sessionName: string;
    durationMin: number;
    target: string;
    structure: string;
    why: string;
  };
  alternativeSessions: Array<{
    sport: "run" | "bike" | "swim";
    sessionName: string;
    durationMin: number;
    target: string;
    structure: string;
    why: string;
  }>;
  dayStatus?: "target_done" | "can_add_short" | "more_possible";
  dayStatusText?: string;
};

export type AthleteProfile = {
  restingHrBaseline?: number | null;
  hrvBaseline?: number | null;
  vo2MaxBaseline?: number | null;
  sleepHoursBaseline?: number | null;
  importedAt?: string | null;
  sourceSummaryJson?: string | null;
};

export type PBDistanceKey = "1k" | "3k" | "5k" | "10k" | "15k" | "half" | "25k" | "30k";
export type EffortSource = "whole_workout" | "rolling_segment";

export type TopEffort = {
  id: string;
  distanceKey: PBDistanceKey;
  distanceKm: number;
  timeSec: number;
  paceMinPerKm: number;
  workoutId: string;
  workoutStartAt: string;
  source: EffortSource;
  segmentStartSec: number | null;
  segmentEndSec: number | null;
};

export type NutritionDailyPlan = {
  date: string;
  carbsG: number;
  proteinG: number;
  fatG: number;
  totalKcal?: number;
  hydrationMl: number;
  preWorkoutNote: string;
  postWorkoutNote: string;
  rationaleJson: string;
  updatedAt: string;
};

export type MealSlot = "breakfast" | "pre_run" | "lunch" | "dinner" | "snack" | "drinks";
export type NutritionUnit = "g" | "ml" | "unit" | "tbsp" | "tsp";
export type NutritionIngredientCategory =
  | "protein"
  | "carb"
  | "fat"
  | "sweet"
  | "vegetable"
  | "fruit"
  | "dairy"
  | "hydration"
  | "mixed";

export type NutritionIngredient = {
  id: string;
  name: string;
  category: NutritionIngredientCategory;
  kcalPer100: number;
  proteinPer100: number;
  carbsPer100: number;
  fatPer100: number;
  defaultUnit: NutritionUnit;
  gramsPerUnit: number;
  isBuiltIn: boolean;
  createdAt: string;
  updatedAt: string;
};

export type NutritionPantryItem = {
  id: string;
  date: string;
  ingredientId: string;
  quantity: number;
  unit: NutritionUnit;
  gramsEffective: number;
  ingredientName: string;
  ingredientCategory: NutritionIngredientCategory;
};

export type NutritionMealItem = {
  ingredientId: string;
  name: string;
  grams: number;
  quantity: number;
  unit: NutritionUnit;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export type NutritionMeal = {
  id: string;
  date: string;
  slot: MealSlot;
  title: string;
  items: NutritionMealItem[];
  totalKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  compromiseNote?: string;
  accepted?: boolean | null;
};
