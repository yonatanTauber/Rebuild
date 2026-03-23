"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ScoreCard, Section } from "@/components/cards";
import { type DayJournalBundle } from "@/components/day-journal-grid";
import RunFeedbackForm, { defaultRunFeedbackValues, type RunFeedbackValues } from "@/components/run-feedback-form";
import StrengthFeedbackForm, {
  defaultStrengthFeedbackValues,
  type StrengthFeedbackValues
} from "@/components/strength-feedback-form";
import { WorkoutBanner, buildWorkoutBannerMetrics } from "@/components/workout-banner";
import UiSelect from "@/components/ui-select";
import { formatDisplayDate, formatISODate, addDaysISO } from "@/lib/date";
import { workoutDetailPath } from "@/lib/url";
import { nutritionQuantityToGrams, nutritionUnitLabel, nutritionUnitOptions } from "@/lib/nutrition-units";
import type { CoachAgentReport } from "@/lib/coach-agent";
import type { MealSlot, NutritionUnit } from "@/lib/types";

type TodayData = {
  readinessScore: number;
  fatigueScore: number;
  fitnessScore: number;
  stateTag?: "overtraining_risk" | "on_the_spot" | "peaking" | "losing_momentum";
  stateLabel?: string;
  stateHint?: string;
  recommendation: string;
  explanation: string;
  alerts: string[];
  todayWorkouts?: Array<{
    id: string;
    sport: "run" | "bike" | "swim" | "strength";
    startAt: string;
    durationSec: number;
    distanceM: number | null;
    distanceDisplayKm?: number | null;
    distanceRawKm?: number | null;
    distanceOfficialKm?: number | null;
    durationForPaceSec?: number | null;
    movingDurationSec?: number | null;
    pauseDurationSec?: number | null;
    paceDisplayMinPerKm?: number | null;
    avgHr?: number | null;
    tssLike?: number | null;
    runScore?: number | null;
    runScoreLabel?: string | null;
  }>;
  coachAgent?: CoachAgentReport | null;
};

type Recommendation = {
  workoutType: string;
  durationMin: number;
  intensityZone: string;
  explanationFactors: string[];
  confidence: number;
  longExplanation: string;
  rationaleDetails: string[];
  dayStatus?: "target_done" | "can_add_short" | "more_possible";
  dayStatusText?: string;
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
};

type ShoeOption = {
  id: string;
  name: string;
  brand: string;
  isDefault: boolean;
  totalKm?: number;
  targetKm?: number;
};

type ForecastOption = {
  id: string;
  sport: "run" | "bike" | "swim";
  workoutType: string;
  durationMin: number;
  intensityZone: string;
  target: string;
  structure: string;
  why: string;
  notes: string;
  plannedLoad: number;
};

type ForecastDay = {
  date: string;
  dayName: string;
  recommendation: string;
  selectedOptionId: string;
  options: ForecastOption[];
};
type DailyMode = "easy" | "normal" | "hard";


type Choice = { id: string; label: string };
type CheckinOptions = {
  options: {
    exertion: Choice[];
    sleep: Choice[];
    hrv: Choice[];
    restingHr: Choice[];
    mood: Choice[];
    sorenessLevel: Choice[];
  };
  painAreas: Array<{ id: string; name: string }>;
};

type MorningForm = {
  date: string;
  exertion: string;
  sleep: string;
  hrv: string;
  restingHr: string;
  mood: string;
  sorenessLevel: string;
  painAreas: string[];
};

type CheckinDailyStatus = {
  date: string;
  exists?: boolean;
  recovery?: unknown;
  progress?: Partial<Omit<MorningForm, "date">> & { lastStep?: number | null };
};

type PendingWorkoutFeedback = {
  workoutId: string;
  sport: "run" | "bike" | "swim" | "strength";
  startAt: string;
  distanceM: number | null;
  durationSec: number;
};

type NutritionFavoriteOption = {
  id: string;
  name: string;
  description: string;
  preferredSlot?: MealSlot | null;
  preview?: {
    baseQuantity: number;
    baseUnit: NutritionUnit;
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  } | null;
};

type NutritionIngredientLite = {
  id: string;
  name: string;
  defaultUnit: NutritionUnit;
  kcalPer100: number;
  proteinPer100: number;
  carbsPer100: number;
  fatPer100: number;
  gramsPerUnit: number;
};

type QuickFoodOption = {
  value: string;
  label: string;
  kind: "favorite" | "ingredient";
  ingredientId?: string;
  preview?: {
    baseQuantity: number;
    baseUnit: NutritionUnit;
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  } | null;
};

type NewIngredientDraft = {
  name: string;
  category: "protein" | "carb" | "fat" | "sweet" | "vegetable" | "fruit" | "dairy" | "hydration" | "mixed";
  kcalPer100: number;
  proteinPer100: number;
  carbsPer100: number;
  fatPer100: number;
  defaultUnit: "g" | "ml" | "unit";
  gramsPerUnit: number;
};

type MorningMetricField = keyof CheckinOptions["options"];
type MorningMetricVisual = {
  field: MorningMetricField;
  label: string;
  value: number;
  icon: string;
  color: string;
  choiceLabel: string;
  score5: number;
  actualLabel?: string;
};

type MorningTrendPoint = {
  date: string;
  sleep: number | null;
  soreness: number | null;
  restingHr: number | null;
  hrv: number | null;
};

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

const morningQuestions: Array<{
  key: "sleep" | "mood" | "sorenessLevel" | "restingHr" | "hrv" | "exertion";
  title: string;
}> = [
  { key: "sleep", title: "איך הייתה השינה הלילה?" },
  { key: "mood", title: "מה מצב האנרגיה בבוקר?" },
  { key: "sorenessLevel", title: "מה רמת הכאב/שריריות הבוקר?" },
  { key: "restingHr", title: "דופק מנוחה לעומת הרגיל?" },
  { key: "hrv", title: "איך HRV יחסית לבסיס?" },
  { key: "exertion", title: "איך הגוף מרגיש הבוקר באופן כללי?" }
];

function nextMorningStepFromForm(form: MorningForm) {
  const missingIndex = morningQuestions.findIndex((question) => !String(form[question.key] ?? "").trim());
  return missingIndex === -1 ? morningQuestions.length : missingIndex;
}

function toChoiceIdFromRecovery(field: MorningMetricField, value: number | null | undefined) {
  if (value == null) return null;
  if (field === "exertion") {
    if (value <= 2.5) return "very_easy";
    if (value <= 4.5) return "easy";
    if (value <= 6.5) return "moderate";
    if (value <= 8.5) return "hard";
    return "max";
  }
  if (field === "sleep") {
    if (value < 6) return "poor";
    if (value < 7) return "ok";
    if (value < 8) return "good";
    return "great";
  }
  if (field === "hrv") {
    if (value < 40) return "low";
    if (value > 55) return "high";
    return "normal";
  }
  if (field === "restingHr") {
    if (value < 54) return "low";
    if (value > 62) return "high";
    return "normal";
  }
  if (field === "mood") {
    if (value <= 1.5) return "low";
    if (value <= 3.5) return "ok";
    if (value <= 4.5) return "good";
    return "great";
  }
  if (value <= 1.5) return "none";
  if (value <= 3.5) return "light";
  if (value <= 6.5) return "medium";
  return "high";
}

function sleepChoiceFromRecovery(recovery: DayJournalBundle["recovery"]) {
  const quality = recovery?.sleepQuality;
  if (quality != null) {
    if (quality <= 1.5) return "poor";
    if (quality <= 3.5) return "ok";
    if (quality <= 4.5) return "good";
    return "great";
  }
  return toChoiceIdFromRecovery("sleep", recovery?.sleepHours) ?? "good";
}

function normalizeMorningMetric(field: MorningMetricField, id: string) {
  const map: Record<string, number> = {
    very_easy: 90,
    easy: 74,
    moderate: 58,
    hard: 34,
    max: 18,
    poor: 24,
    ok: 54,
    good: 76,
    great: 92,
    low: field === "hrv" ? 24 : field === "restingHr" ? 84 : 30,
    normal: 66,
    high: field === "hrv" ? 88 : field === "restingHr" ? 34 : 18,
    none: 92,
    light: 72,
    medium: 46
  };
  return map[id] ?? 50;
}

function morningMetricIcon(field: MorningMetricField) {
  if (field === "sleep") return "☽";
  if (field === "mood") return "◔";
  if (field === "sorenessLevel") return "◎";
  if (field === "restingHr") return "♥";
  if (field === "hrv") return "∿";
  if (field === "exertion") return "↗";
  return "•";
}

function morningMetricColor(value: number) {
  const clamped = Math.max(0, Math.min(100, value));
  const hue = Math.round((clamped / 100) * 120);
  return `hsl(${hue} 62% 44%)`;
}

function morningScore5(value: number) {
  const clamped = Math.max(0, Math.min(100, value));
  return Math.max(1, Math.min(5, Math.round(clamped / 20)));
}

function morningMetricInterpretation(field: MorningMetricField, score5: number) {
  const level = score5 >= 4 ? "טוב" : score5 >= 3 ? "בינוני" : "נמוך";
  if (field === "sleep") return `${level} · איכות שינה והתאוששות לילה`;
  if (field === "mood") return `${level} · מצב אנרגיה ומיקוד`;
  if (field === "sorenessLevel") return `${level} · עומס שרירי בפועל`;
  if (field === "restingHr") return `${level} · דופק מנוחה ביחס לבסיס`;
  if (field === "hrv") return `${level} · סטטוס מערכת עצבית`;
  if (field === "exertion") return `${level} · תחושת גוף כללית`;
  return level;
}

function quickValueToIngredientId(value: string) {
  if (!value.startsWith("ingredient:")) return null;
  const ingredientId = value.slice("ingredient:".length).trim();
  return ingredientId || null;
}

function mealSlotByHour(): MealSlot {
  const hour = new Date().getHours();
  if (hour < 12) return "breakfast";
  if (hour < 17) return "lunch";
  return "dinner";
}

function mealSlotLabel(slot: MealSlot) {
  if (slot === "breakfast") return "ארוחת בוקר";
  if (slot === "pre_run") return "לפני אימון";
  if (slot === "lunch") return "ארוחת צהריים";
  if (slot === "dinner") return "ארוחת ערב";
  if (slot === "drinks") return "שתייה";
  return "נשנוש";
}

const mealSlotOptions: Array<{ value: MealSlot; label: string }> = [
  { value: "breakfast", label: "ארוחת בוקר" },
  { value: "lunch", label: "ארוחת צהריים" },
  { value: "dinner", label: "ארוחת ערב" },
  { value: "snack", label: "נשנוש" },
  { value: "pre_run", label: "לפני אימון" },
  { value: "drinks", label: "שתייה" }
];

function looksLikeDrinkName(name: string) {
  const normalized = ` ${name.trim().toLowerCase()} `;
  // Explicit food exclusions — these contain drink-like words but are solid food
  if (normalized.includes("מרק") || normalized.includes("חביתה") || normalized.includes("ביצה")) return false;
  // Wrap in spaces to simulate word boundaries (Hebrew has no \b for Unicode)
  return /\sמים\s|\sקפה\s|\sתה\s|\sאספרסו\s|\sמשקה\s|\sdrink\s|\scoffee\s|\stea\s|\swater\s/.test(normalized)
    || /^(מים|קפה|תה|אספרסו|משקה|drink|coffee|tea|water)\s/.test(normalized.trimStart());
}

function formatDuration(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatPace(paceMinPerKm: number | null | undefined) {
  if (paceMinPerKm == null || !Number.isFinite(paceMinPerKm)) return "-";
  const paceSec = Math.round(paceMinPerKm * 60);
  const min = Math.floor(paceSec / 60);
  const sec = paceSec % 60;
  return `${min}:${String(sec).padStart(2, "0")} דק׳/ק״מ`;
}

function formatDistanceKm(km: number | null | undefined) {
  if (km == null || !Number.isFinite(km)) return "-";
  const rounded = Math.round(km * 100) / 100;
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(2);
}

function getDisplayDistanceKm(workout: NonNullable<TodayData["todayWorkouts"]>[number]) {
  if (workout.distanceDisplayKm != null && Number.isFinite(workout.distanceDisplayKm)) {
    return workout.distanceDisplayKm;
  }
  if (workout.distanceM != null && Number.isFinite(workout.distanceM)) {
    return workout.distanceM / 1000;
  }
  return null;
}

type WorkoutFeedbackSnapshot = {
  workoutId: string;
  rpeScore?: number | null;
  legsLoadScore?: number | null;
  painScore?: number | null;
  addFiveKmScore?: number | null;
  recoveryScore?: number | null;
  breathingScore?: number | null;
  overallLoadScore?: number | null;
  preRunNutritionScore?: number | null;
  environmentScore?: number | null;
  satisfactionScore?: number | null;
};

function isIsoDate(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function percentToTone(value: number) {
  if (value >= 75) return "good";
  if (value >= 45) return "mid";
  return "low";
}

function faceByScore(score: number) {
  if (score >= 85) return "😄";
  if (score >= 70) return "🙂";
  if (score >= 55) return "😐";
  return "😵";
}

function labelByScore(score: number) {
  if (score >= 85) return "יום חזק";
  if (score >= 70) return "יום טוב";
  if (score >= 55) return "יום בינוני";
  return "יום כבד";
}

function statusToneByScore(
  score: number | null | undefined,
  direction: "higher_is_better" | "lower_is_better" = "higher_is_better"
): "red" | "yellow" | "black" {
  if (score == null || !Number.isFinite(score)) return "yellow";
  const normalized = Math.max(0, Math.min(100, score));
  const effective = direction === "lower_is_better" ? 100 - normalized : normalized;
  if (effective >= 66) return "black";
  if (effective >= 40) return "yellow";
  return "red";
}

function toneForFitness(score: number | null | undefined): "red" | "yellow" | "orange" {
  if (score == null || !Number.isFinite(score)) return "yellow";
  const normalized = Math.max(0, Math.min(100, score));
  if (normalized >= 66) return "orange";
  if (normalized >= 40) return "yellow";
  return "red";
}

function sportLabel(sport: "run" | "bike" | "swim" | "strength") {
  if (sport === "run") return "ריצה";
  if (sport === "bike") return "אופניים";
  if (sport === "strength") return "כוח";
  return "שחייה";
}

const intensityOrder: DailyMode[] = ["easy", "normal", "hard"];
const intensityLabels: Record<DailyMode, string> = { easy: "קל", normal: "בינוני", hard: "קשה" };
const sportPriority: ForecastOption["sport"][] = ["run", "bike", "swim"];
const MORNING_REMINDER_START_KEY = "rebuild-morning-reminder-start";
const MORNING_CHECKIN_CACHE_KEY_PREFIX = "rebuild-morning-checkin-cache";

const nutritionCategoryOptions: Array<{ value: NewIngredientDraft["category"]; label: string }> = [
  { value: "protein", label: "חלבון" },
  { value: "carb", label: "פחמימה" },
  { value: "fat", label: "שומן" },
  { value: "vegetable", label: "ירקות" },
  { value: "fruit", label: "פירות" },
  { value: "dairy", label: "מוצרי חלב" },
  { value: "hydration", label: "שתייה" },
  { value: "sweet", label: "מתוקים" },
  { value: "mixed", label: "כללי" }
];

type MorningCheckinCache = {
  form: MorningForm;
  completed: boolean;
  savedAt: string;
};

function getMorningCheckinCacheKey(date: string) {
  return `${MORNING_CHECKIN_CACHE_KEY_PREFIX}:${date}`;
}

function normalizeMorningCacheForm(raw: unknown, date: string): MorningForm | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Partial<MorningForm>;
  const form: MorningForm = {
    date,
    exertion: typeof source.exertion === "string" ? source.exertion : "",
    sleep: typeof source.sleep === "string" ? source.sleep : "",
    hrv: typeof source.hrv === "string" ? source.hrv : "",
    restingHr: typeof source.restingHr === "string" ? source.restingHr : "",
    mood: typeof source.mood === "string" ? source.mood : "",
    sorenessLevel: typeof source.sorenessLevel === "string" ? source.sorenessLevel : "",
    painAreas: Array.isArray(source.painAreas)
      ? source.painAreas.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : []
  };
  return form;
}

function readMorningCheckinCache(date: string): MorningCheckinCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(getMorningCheckinCacheKey(date));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { form?: unknown; completed?: unknown; savedAt?: unknown };
    const form = normalizeMorningCacheForm(parsed.form, date);
    if (!form) return null;
    return {
      form,
      completed: Boolean(parsed.completed),
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : new Date().toISOString()
    };
  } catch {
    return null;
  }
}

function writeMorningCheckinCache(form: MorningForm, completed: boolean) {
  if (typeof window === "undefined") return;
  try {
    const payload: MorningCheckinCache = {
      form: { ...form, date: form.date },
      completed,
      savedAt: new Date().toISOString()
    };
    window.localStorage.setItem(getMorningCheckinCacheKey(form.date), JSON.stringify(payload));
  } catch {
    // Ignore localStorage quota/privacy mode failures
  }
}

function categorizeOptionsByIntensity(options: ForecastOption[]) {
  const buckets: Record<DailyMode, ForecastOption[]> = { easy: [], normal: [], hard: [] };
  if (!options.length) return buckets;

  const sorted = [...options].sort((a, b) => {
    if (a.plannedLoad !== b.plannedLoad) return a.plannedLoad - b.plannedLoad;
    return a.durationMin - b.durationMin;
  });

  const base = Math.floor(sorted.length / 3);
  const remainder = sorted.length % 3;
  let cursor = 0;

  intensityOrder.forEach((mode, idx) => {
    const count = base + (idx < remainder ? 1 : 0);
    buckets[mode] = sorted.slice(cursor, cursor + count);
    cursor += count;
  });

  intensityOrder.forEach((mode) => {
    if (!buckets[mode].length) {
      const fallbackIndex = Math.max(0, Math.min(sorted.length - 1, cursor - 1));
      buckets[mode] = [sorted[fallbackIndex]];
    }
  });

  return buckets;
}

function findWorkoutForCombination(
  options: ForecastOption[],
  sport: ForecastOption["sport"],
  modeBuckets: Record<DailyMode, ForecastOption[]>,
  mode: DailyMode
) {
  const sportOptions = options
    .filter((opt) => opt.sport === sport)
    .sort((a, b) => (a.plannedLoad === b.plannedLoad ? a.durationMin - b.durationMin : a.plannedLoad - b.plannedLoad));
  if (!sportOptions.length) return null;
  const preferredIds = new Set(modeBuckets[mode].map((opt) => opt.id));
  const matched = sportOptions.find((opt) => preferredIds.has(opt.id));
  if (matched) return matched;
  if (sportOptions.length >= 2) {
    if (mode === "easy") return sportOptions[0];
    if (mode === "hard") return sportOptions[sportOptions.length - 1];
    return sportOptions[Math.floor((sportOptions.length - 1) / 2)];
  }
  return buildModeVariant(sportOptions[0], mode);
}

function buildModeVariant(base: ForecastOption, mode: DailyMode): ForecastOption {
  const scale = mode === "easy" ? 0.8 : mode === "hard" ? 1.2 : 1;
  const loadScale = mode === "easy" ? 0.74 : mode === "hard" ? 1.3 : 1;
  const zone = mode === "easy" ? "Z1-Z2" : mode === "hard" ? "Z3-Z4" : "Z2-Z3";
  const modeLabel = intensityLabels[mode];
  const roundedDuration = Math.max(30, Math.round((base.durationMin * scale) / 5) * 5);

  return {
    ...base,
    id: `${base.id}-${mode}`,
    workoutType: `${base.workoutType} · ${modeLabel}`,
    durationMin: roundedDuration,
    intensityZone: zone,
    target: `${modeLabel}: ${base.target}`,
    structure: `${modeLabel}: ${base.structure}`,
    why: `${modeLabel}: ${base.why}`,
    notes: `${base.notes} · התאמה יומית`,
    plannedLoad: Math.max(10, Math.round(base.plannedLoad * loadScale))
  };
}

function recommendationToOption(rec: Recommendation): ForecastOption {
  return {
    id: `rec-${rec.primarySession.sessionName}-${rec.primarySession.durationMin}`,
    sport: rec.primarySession.sport,
    workoutType: rec.primarySession.sessionName,
    durationMin: rec.primarySession.durationMin,
    intensityZone: rec.intensityZone ?? rec.primarySession.target ?? "",
    target: rec.primarySession.target,
    structure: rec.primarySession.structure,
    why: rec.primarySession.why,
    notes: rec.longExplanation,
    plannedLoad: rec.durationMin <= 0 || rec.primarySession.durationMin <= 0 ? 0 : Math.max(1, Math.round(rec.confidence * 50))
  };
}

function getDailyModeOptions(options: ForecastOption[]) {
  if (options.length === 0) return null;
  const sorted = [...options].sort((a, b) => a.plannedLoad - b.plannedLoad);
  return {
    easy: sorted[0],
    normal: sorted[Math.floor(sorted.length / 2)],
    hard: sorted[sorted.length - 1]
  } satisfies Record<DailyMode, ForecastOption>;
}

function detectRecommendedMode(options: ForecastOption[], selectedOptionId?: string) {
  const dailyOptions = getDailyModeOptions(options);
  if (!dailyOptions) return "normal" as DailyMode;
  const selected = options.find((opt) => opt.id === selectedOptionId);
  if (!selected) return "normal" as DailyMode;
  if (selected.id === dailyOptions.easy.id) return "easy" as DailyMode;
  if (selected.id === dailyOptions.hard.id) return "hard" as DailyMode;
  return "normal" as DailyMode;
}

function buildWorkoutVariants(base: ForecastOption, mode: DailyMode): ForecastOption[] {
  const duration = Math.max(mode === "easy" ? 30 : 35, Math.round(base.durationMin / 5) * 5);
  const mainBlock = Math.max(12, duration - 15);

  if (base.sport === "run") {
    if (mode === "hard") {
      return [
        {
          ...base,
          id: `${base.id}-run-threshold`,
          workoutType: "אינטרוולי סף בריצה",
          durationMin: Math.max(45, duration),
          intensityZone: "Z3-Z4",
          target: "קטעי עבודה חזקים אבל נשלטים, בלי ספרינט",
          structure: "15 דק' חימום + 4 האצות 20 שנ' + 5x4 דק' בקצב סף / 2 דק' קל + 10 דק' שחרור",
          why: "אימון איכות קלאסי ליום עם חלון טוב לעבודה משמעותית בריצה.",
          notes: "לפתוח שמרני, לשמור שהחזרה האחרונה תהיה כמעט כמו הראשונה.",
          plannedLoad: Math.max(base.plannedLoad, 56)
        },
        {
          ...base,
          id: `${base.id}-run-tempo`,
          workoutType: "טמפו מדורג בריצה",
          durationMin: Math.max(45, duration),
          intensityZone: "Z3",
          target: "קצב טמפו יציב, נשימה מאומצת אבל בשליטה",
          structure: "15 דק' חימום + 2x10 דק' טמפו / 3 דק' קל + 8 דק' מעט מהיר יותר + 10 דק' שחרור",
          why: "מפתח סף ויכולת להחזיק קצב לאורך זמן בלי חדות קיצונית.",
          notes: "אם הקצב מתפרק, לקצר את הבלוק האחרון ל-6 דק'.",
          plannedLoad: Math.max(base.plannedLoad - 2, 54)
        },
        {
          ...base,
          id: `${base.id}-run-hills`,
          workoutType: "חזרות גבעה קצרות",
          durationMin: Math.max(45, duration),
          intensityZone: "Z3-Z4",
          target: "עליות חזקות עם ירידה מלאה להתאוששות",
          structure: "15 דק' חימום + 10x45 שנ' עליה חזקה / חזרה בהליכה-ג'וג + 12 דק' שחרור",
          why: "מחזק כוח ריצה וטכניקה בלי רדיפה אגרסיבית אחרי קצב שטוח.",
          notes: "המאמץ בעליה חזק, אבל לא עד כשל. לשמור יציבה וצעדים קצרים.",
          plannedLoad: Math.max(base.plannedLoad - 4, 52)
        }
      ];
    }

    if (mode === "easy") {
      return [
        {
          ...base,
          id: `${base.id}-run-recovery`,
          workoutType: "ריצה קלה רציפה",
          durationMin: duration,
          intensityZone: "Z1-Z2",
          target: "נשימה נוחה ושיחה מלאה לאורך כל האימון",
          structure: `8 דק' פתיחה רגועה + ${mainBlock} דק' קל מאוד + 5 דק' שחרור`,
          why: "בחירה טובה לשמירת רציפות בלי להעמיס על השרירים והמערכת.",
          notes: "אם הרגליים לא זורמות, להפוך 5-10 דק' מהאמצע להליכה מהירה.",
          plannedLoad: Math.min(base.plannedLoad, 32)
        },
        {
          ...base,
          id: `${base.id}-run-strides`,
          workoutType: "ריצה קלה עם האצות קצרות",
          durationMin: Math.max(30, duration),
          intensityZone: "Z1-Z2",
          target: "רוב הזמן קל, ההאצות רק לפתיחת צעד",
          structure: "10 דק' קל + 15-20 דק' קל יציב + 6x20 שנ' האצה / 60-75 שנ' הליכה-ג'וג + 5 דק' שחרור",
          why: "שומר קלילות, אבל נותן מעט חדות עצבית בלי להפוך לאימון איכות.",
          notes: "ההאצות מהירות אך קצרות. לא להיכנס לחומצה.",
          plannedLoad: Math.min(base.plannedLoad + 2, 35)
        },
        {
          ...base,
          id: `${base.id}-run-progression-lite`,
          workoutType: "ריצה קלה מדורגת",
          durationMin: Math.max(30, duration),
          intensityZone: "Z1-Z2",
          target: "פתיחה קלה מאוד, סיום מעט אסוף אך עדיין אירובי",
          structure: "10 דק' קל מאוד + 10 דק' קל + 10-15 דק' אירובי נוח + 5 דק' שחרור",
          why: "מתאים כשרוצים אימון קל אבל לא מונוטוני לחלוטין.",
          notes: "הסיום עדיין צריך להרגיש בשליטה מלאה.",
          plannedLoad: Math.min(base.plannedLoad + 1, 34)
        }
      ];
    }

    return [
      {
        ...base,
        id: `${base.id}-run-aerobic`,
        workoutType: "ריצה אירובית יציבה",
        durationMin: Math.max(35, duration),
        intensityZone: "Z2",
        target: "קצב אירובי יציב ונשלט",
        structure: `10 דק' קל + ${Math.max(20, duration - 15)} דק' Z2 יציב + 5 דק' שחרור`,
        why: "אימון יומי יעיל שמקדם בסיס אירובי בלי לפרק את הגוף.",
        notes: "לשמור קצב אחיד יחסית, לא לפתוח מהר מדי.",
        plannedLoad: Math.max(base.plannedLoad, 40)
      },
      {
        ...base,
        id: `${base.id}-run-aerobic-strides`,
        workoutType: "אירובי + 6 האצות",
        durationMin: Math.max(35, duration),
        intensityZone: "Z2",
        target: "אירובי יציב עם מעט חדות בסיום",
        structure: "12 דק' קל + 20-25 דק' Z2 יציב + 6x20 שנ' האצה / 60 שנ' קל + 5 דק' שחרור",
        why: "יום בינוני טוב לשילוב אירובי עם טאץ' מהיר קצר.",
        notes: "אם יש כבדות, לדלג על ההאצות ולהישאר ברציף קל.",
        plannedLoad: Math.max(base.plannedLoad + 2, 42)
      },
      {
        ...base,
        id: `${base.id}-run-steady`,
        workoutType: "ריצה רציפה עם בלוק קצב יציב",
        durationMin: Math.max(40, duration),
        intensityZone: "Z2-Z3",
        target: "אמצע אימון מעט אסוף אך עדיין נשלט",
        structure: "12 דק' קל + 15 דק' Z2 יציב + 10 דק' מעט אסוף יותר + 5 דק' שחרור",
        why: "מגוון את הריצה היומית בלי להפוך אותה לאימון איכות מובהק.",
        notes: "הבלוק האמצעי צריך להרגיש 'עבודה', אבל לא מרדף.",
        plannedLoad: Math.max(base.plannedLoad + 4, 44)
      }
    ];
  }

  if (base.sport === "swim") {
    if (mode === "hard") {
      return [
        {
          ...base,
          id: `${base.id}-swim-threshold`,
          workoutType: "חתירה בקצב סף",
          durationMin: Math.max(40, duration),
          intensityZone: "Z3-Z4",
          target: "חתירה רציפה חזקה עם שמירה על טכניקה",
          structure: "300 קל + 6x50 build + 12x100 חתירה בקצב סף / 15 שנ' + 200 שחרור",
          why: "אימון איכות במים בלי עומס מכני של ריצה.",
          notes: "אם הטכניקה נופלת, להגדיל מעט את המנוחה ולא להאיץ יותר.",
          plannedLoad: Math.max(base.plannedLoad, 44)
        },
        {
          ...base,
          id: `${base.id}-swim-200s`,
          workoutType: "סט 200ים בינוני-עצים",
          durationMin: Math.max(40, duration),
          intensityZone: "Z3",
          target: "שליטה על קצב לאורך חזרות ארוכות יותר",
          structure: "300 קל + 6x200 חתירה בקצב בינוני-עצים / 20 שנ' + 100 שחרור",
          why: "מפתח סבולת ספציפית ויכולת להחזיק טכניקה תחת מאמץ.",
          notes: "מומלץ לשמור כל 200 דומה לקודם.",
          plannedLoad: Math.max(base.plannedLoad - 1, 42)
        },
        {
          ...base,
          id: `${base.id}-swim-mixed`,
          workoutType: "שחייה משתנה: חתירה + משיכות",
          durationMin: Math.max(40, duration),
          intensityZone: "Z3",
          target: "קצב עבודה בינוני-גבוה עם שליטה בנשימה",
          structure: "200 קל + 4x50 תרגיל + 8x100 חתירה / 15 שנ' + 4x50 חזק יותר / 20 שנ' + 100 שחרור",
          why: "נותן איכות וגיוון בלי תחושה של סט חדגוני.",
          notes: "רוב העבודה בחתירה. אפשר חזה קל רק בשחרור.",
          plannedLoad: Math.max(base.plannedLoad - 2, 40)
        }
      ];
    }

    if (mode === "easy") {
      return [
        {
          ...base,
          id: `${base.id}-swim-tech`,
          workoutType: "שחייה טכנית קלה",
          durationMin: Math.max(30, duration),
          intensityZone: "Z1-Z2",
          target: "חתירה רגועה, שליטה בתנועה ובנשימה",
          structure: "200 קל + 6x50 תרגיל חתירה / 20 שנ' + 4x100 חתירה קלה / 15 שנ' + 100 שחרור",
          why: "אימון מים עדין שמתאים ליום התאוששות או עומס בינוני.",
          notes: "אפשר לשלב חזה קל אם זה עוזר להרגיע דופק ולסדר נשימה.",
          plannedLoad: Math.min(base.plannedLoad, 28)
        },
        {
          ...base,
          id: `${base.id}-swim-mixed-easy`,
          workoutType: "שחייה קלה מעורבת",
          durationMin: Math.max(30, duration),
          intensityZone: "Z1-Z2",
          target: "זרימה במים בלי מאמץ חד",
          structure: "150 חתירה קל + 4x50 חזה/גב קל + 6x75 חתירה קלה / 15 שנ' + 100 שחרור",
          why: "שובר מונוטוניות ושומר תנועה עדינה לכל הגוף.",
          notes: "הדגש על תחושה נוחה, לא על מהירות סט.",
          plannedLoad: Math.min(base.plannedLoad, 27)
        },
        {
          ...base,
          id: `${base.id}-swim-pull`,
          workoutType: "שחייה קלה עם pull buoy",
          durationMin: Math.max(30, duration),
          intensityZone: "Z1-Z2",
          target: "חתירה רגועה, דגש על אורך תנועה",
          structure: "200 קל + 4x50 תרגיל + 4x100 pull buoy קל / 15 שנ' + 4x50 חתירה רגילה + 100 שחרור",
          why: "מאפשר להמשיך לעבוד קל בלי להעמיס רגליים.",
          notes: "אם אין pull buoy פשוט לבצע חתירה קלה רגילה.",
          plannedLoad: Math.min(base.plannedLoad + 1, 29)
        }
      ];
    }

    return [
      {
        ...base,
        id: `${base.id}-swim-steady`,
        workoutType: "שחייה אירובית יציבה",
        durationMin: Math.max(35, duration),
        intensityZone: "Z2",
        target: "חתירה רציפה ונקייה בקצב בינוני",
        structure: "300 קל + 8x100 חתירה ב-Z2 / 15 שנ' + 200 שחרור",
        why: "אימון מים יציב וטוב ליום בינוני.",
        notes: "לשמור שכל סט דומה יחסית לאחרים.",
        plannedLoad: Math.max(base.plannedLoad, 34)
      },
      {
        ...base,
        id: `${base.id}-swim-pyramid`,
        workoutType: "פירמידת חתירה",
        durationMin: Math.max(35, duration),
        intensityZone: "Z2-Z3",
        target: "שליטה בקצב על מרחקים משתנים",
        structure: "200 קל + 100/200/300/200/100 חתירה בקצב יציב / 15-20 שנ' + 100 שחרור",
        why: "גיוון טוב למי שרוצה עבודה רציפה אבל לא חדגונית.",
        notes: "ה-300 צריך להיות נשלט, לא מהיר מדי.",
        plannedLoad: Math.max(base.plannedLoad + 2, 35)
      },
      {
        ...base,
        id: `${base.id}-swim-moderate`,
        workoutType: "שחייה בינונית עם 50ים מהירים",
        durationMin: Math.max(35, duration),
        intensityZone: "Z2-Z3",
        target: "חתירה אירובית עם כמה נגיעות מהירות קצרות",
        structure: "250 קל + 6x100 Z2 / 15 שנ' + 6x50 מעט מהיר יותר / 20 שנ' + 100 שחרור",
        why: "מוסיף עניין ומהירות בלי להיכנס לעומס איכות מלא.",
        notes: "לשמור טכניקה גם ב-50ים המהירים.",
        plannedLoad: Math.max(base.plannedLoad + 3, 36)
      }
    ];
  }

  if (mode === "hard") {
    return [
      {
        ...base,
        id: `${base.id}-bike-threshold`,
        workoutType: "אופניים סף 5x5",
        durationMin: Math.max(45, duration),
        intensityZone: "Z3-Z4",
        target: "מאמץ סף יציב, קדנס 85-95",
        structure: "15 דק' חימום + 5x5 דק' חזק / 3 דק' קל + 10 דק' שחרור",
        why: "איכות טובה באופניים כשהריצה לא הבחירה הראשונה.",
        notes: "הבלוקים צריכים להיות חזקים אך אחידים. לא לפתוח חזק מדי.",
        plannedLoad: Math.max(base.plannedLoad, 50)
      },
      {
        ...base,
        id: `${base.id}-bike-sweetspot`,
        workoutType: "Sweet Spot 3x10",
        durationMin: Math.max(50, duration),
        intensityZone: "Z3",
        target: "לחץ רציף בינוני-גבוה אבל נשלט",
        structure: "15 דק' קל + 3x10 דק' sweet spot / 4 דק' קל + 10 דק' שחרור",
        why: "יעיל לבניית כוח אירובי בלי חדות קיצונית.",
        notes: "מתאים במיוחד אם רוצים איכות יציבה ולא חזרתית קצרה.",
        plannedLoad: Math.max(base.plannedLoad - 2, 48)
      },
      {
        ...base,
        id: `${base.id}-bike-overunder`,
        workoutType: "אופניים אובר-אנדר",
        durationMin: Math.max(45, duration),
        intensityZone: "Z3-Z4",
        target: "מעברים בין עבודה נוחה לקשוחה",
        structure: "15 דק' חימום + 4x6 דק' (2 דק' Z3 + 1 דק' Z4 פעמיים) / 3 דק' קל + 10 דק' שחרור",
        why: "אימון מגוון יותר למי שלא רוצה טמפו מונוטוני.",
        notes: "לשמור ישיבה יציבה ולא להכביד בהילוך יותר מדי.",
        plannedLoad: Math.max(base.plannedLoad - 1, 47)
      }
    ];
  }

  if (mode === "easy") {
    return [
      {
        ...base,
        id: `${base.id}-bike-recovery`,
        workoutType: "ספין קל לשחרור",
        durationMin: Math.max(30, duration),
        intensityZone: "Z1-Z2",
        target: "קדנס 90+, התנגדות נמוכה, דופק רגוע",
        structure: "10 דק' קל + 15-20 דק' רציף קל + 5 דק' שחרור",
        why: "משחרר רגליים היטב בלי להוסיף עומס משמעותי.",
        notes: "אם יש כבדות, להשאיר התנגדות נמוכה מאוד.",
        plannedLoad: Math.min(base.plannedLoad, 30)
      },
      {
        ...base,
        id: `${base.id}-bike-cadence`,
        workoutType: "אופניים קלים עם קדנס גבוה",
        durationMin: Math.max(30, duration),
        intensityZone: "Z1-Z2",
        target: "זרימה ברגליים, לא כוח",
        structure: "10 דק' קל + 6x2 דק' קדנס 100-105 / 2 דק' קל + 8 דק' שחרור",
        why: "נותן גיוון ועדיין נשאר קל מאוד מבחינת עומס.",
        notes: "אם הדופק מטפס יותר מדי, להוריד קדנס.",
        plannedLoad: Math.min(base.plannedLoad + 1, 31)
      },
      {
        ...base,
        id: `${base.id}-bike-endurance-lite`,
        workoutType: "רכיבת התאוששות רציפה",
        durationMin: Math.max(30, duration),
        intensityZone: "Z1-Z2",
        target: "רכיבה רגועה ורציפה ללא מאבק",
        structure: "8 דק' קל + 20-25 דק' רכיבה קלה יציבה + 5 דק' שחרור",
        why: "מתאים ליום קל שבו רוצים לזוז בלי לבזבז יותר מדי אנרגיה.",
        notes: "אפשר לבצע גם על טריינר או אופני כושר.",
        plannedLoad: Math.min(base.plannedLoad, 29)
      }
    ];
  }

  return [
    {
      ...base,
      id: `${base.id}-bike-endurance`,
      workoutType: "רכיבת Z2 יציבה",
      durationMin: Math.max(40, duration),
      intensityZone: "Z2",
      target: "קצב יציב, קדנס נוח, עבודה אירובית רציפה",
      structure: "12 דק' קל + 25-35 דק' Z2 יציב + 8 דק' שחרור",
      why: "אימון בסיס יעיל ליום בינוני בלי עומס חד.",
      notes: "מומלץ לשמור הילוך נוח ולא להידחף לכוח גבוה.",
      plannedLoad: Math.max(base.plannedLoad, 38)
    },
    {
      ...base,
      id: `${base.id}-bike-tempo-lite`,
      workoutType: "רכיבת טמפו מתון",
      durationMin: Math.max(40, duration),
      intensityZone: "Z2-Z3",
      target: "אמצע אימון מעט אסוף יותר, עדיין נשלט",
      structure: "12 דק' קל + 2x10 דק' טמפו מתון / 4 דק' קל + 8 דק' שחרור",
      why: "נותן קצת יותר עבודה ועדיין נשאר מתאים ליום בינוני.",
      notes: "אם יש עייפות ברגליים, לחזור לגרסת Z2 הרציפה.",
      plannedLoad: Math.max(base.plannedLoad + 2, 40)
    },
    {
      ...base,
      id: `${base.id}-bike-blocks`,
      workoutType: "רכיבת אנדורנס עם בלוקים",
      durationMin: Math.max(45, duration),
      intensityZone: "Z2",
      target: "שלושה בלוקים אירוביים נקיים",
      structure: "10 דק' קל + 3x8 דק' Z2 יציב / 3 דק' קל + 8 דק' שחרור",
      why: "מפרק את האימון למקטעים ומקל על שמירה על פוקוס.",
      notes: "לשמור שהבלוק השלישי לא יעלה מעבר ל-Z2 גבוה.",
      plannedLoad: Math.max(base.plannedLoad + 1, 39)
    }
  ];
}

function MorningTrendCard({
  points,
  activeDate,
  onEdit
}: {
  points: MorningTrendPoint[];
  activeDate: string;
  onEdit: () => void;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number; w: number } | null>(null);

  const series = useMemo(
    () => [
      { key: "sleep" as const, label: "שינה", color: "var(--morning-sleep)" },
      { key: "soreness" as const, label: "כאב שרירים", color: "var(--morning-soreness)" },
      { key: "restingHr" as const, label: "דופק במנוחה", color: "var(--morning-restinghr)" },
      { key: "hrv" as const, label: "HRV", color: "var(--morning-hrv)" }
    ],
    []
  );

  const hasAny = useMemo(
    () => points.some((p) => series.some((s) => (p[s.key] ?? null) != null)),
    [points, series]
  );

  const activeIndex = useMemo(() => points.findIndex((p) => p.date === activeDate), [points, activeDate]);
  const displayPoints = points.length ? points : [];

  const dims = { width: 620, height: 280, left: 54, right: 18, top: 22, bottom: 44 };
  const plotW = dims.width - dims.left - dims.right;
  const plotH = dims.height - dims.top - dims.bottom;
  const n = Math.max(1, displayPoints.length);
  const stepX = n > 1 ? plotW / (n - 1) : plotW;

  const isRTL = useMemo(() => {
    if (typeof window === "undefined") return true;
    return window.getComputedStyle(document.documentElement).direction === "rtl";
  }, []);

  const xForIndex = (idx: number) =>
    isRTL ? dims.left + (n - 1 - idx) * stepX : dims.left + idx * stepX;
  const yForValue = (value: number) => dims.top + (5 - value) * (plotH / 5);

  const dayLabel = (iso: string) => {
    const d = new Date(`${iso}T12:00:00`);
    const raw = new Intl.DateTimeFormat("he-IL", { weekday: "long" }).format(d);
    return raw.replace(/^יום\\s+/, "");
  };

  function buildPathForSeries(key: (typeof series)[number]["key"]) {
    let current: string[] = [];
    const segments: string[] = [];

    displayPoints.forEach((p, idx) => {
      const v = p[key];
      if (v == null || !Number.isFinite(v)) {
        if (current.length > 1) segments.push(current.join(" "));
        current = [];
        return;
      }
      current.push(`${xForIndex(idx)},${yForValue(v)}`);
    });
    if (current.length > 1) segments.push(current.join(" "));
    return segments;
  }

  function onPointerMove(event: any) {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const plotX = (px - dims.left) / (plotW || 1);
    const ratio = Math.max(0, Math.min(1, plotX));
    const idxFloat = (isRTL ? 1 - ratio : ratio) * Math.max(1, n - 1);
    const clamped = Math.max(0, Math.min(n - 1, Math.round(idxFloat)));
    setHoverIndex(clamped);
    setHoverPos({ x: px, y: py, w: rect.width });
  }

  function clearHover() {
    setHoverIndex(null);
    setHoverPos(null);
  }

  const hoverPoint = hoverIndex != null ? displayPoints[hoverIndex] : null;

  function clampTooltipTop(py: number) {
    // Keep the tooltip within the card; prefer above the cursor.
    return clampNumber(py - 64, 12, 200);
  }

  function clampTooltipInlineStart(px: number, containerW: number, rtl: boolean) {
    // Use logical inline-start so RTL and LTR behave the same.
    const tooltipW = 240;
    const margin = 12;
    const logical = rtl ? containerW - px : px;
    const desired = logical + 12;
    const clamped = clampNumber(desired, margin, Math.max(margin, containerW - tooltipW - margin));
    return clamped;
  }

  return (
    <section className="morning-trend-card" aria-label="דוח בוקר">
      <div className="morning-trend-head">
        <div className="morning-trend-title">
          <span className="morning-trend-icon" aria-hidden>
            ↗
          </span>
          <strong>מגמת ביצועים</strong>
          <small>7 ימים אחרונים</small>
        </div>
        <button type="button" className="choice-btn icon-compact subtle" onClick={onEdit} title="עדכון בוקר">
          <span aria-hidden>☀</span>
          <small>בוקר</small>
        </button>
      </div>

      {hasAny ? (
        <div className="morning-trend-chart-wrap">
          <svg
            className="morning-trend-chart"
            viewBox={`0 0 ${dims.width} ${dims.height}`}
            role="img"
            aria-label="גרף מגמה של מדדי בוקר"
            onPointerMove={onPointerMove}
            onPointerLeave={clearHover}
          >
            {[1, 2, 3, 4, 5].map((tick) => {
              const y = yForValue(tick);
              return (
                <g key={`tick-${tick}`}>
                  <line x1={dims.left} x2={dims.width - dims.right} y1={y} y2={y} className="morning-trend-grid" />
                  <text x={dims.left - 14} y={y + 4} textAnchor="end" className="morning-trend-axis">
                    {tick}
                  </text>
                </g>
              );
            })}

            {displayPoints.length > 1 ? (
              displayPoints.map((p, idx) => {
                const x = xForIndex(idx);
                const label = dayLabel(p.date);
                return (
                  <g key={`x-${p.date}`}>
                    <text x={x} y={dims.height - 18} textAnchor="middle" className="morning-trend-xlabel">
                      {label}
                    </text>
                  </g>
                );
              })
            ) : null}

            {series.map((s) => (
              <g key={`series-${s.key}`}>
                {buildPathForSeries(s.key).map((poly, idx) => (
                  <polyline key={`poly-${s.key}-${idx}`} points={poly} className="morning-trend-line" style={{ stroke: s.color }} />
                ))}
              </g>
            ))}

            {series.map((s) => (
              <g key={`dots-${s.key}`}>
                {displayPoints.map((p, idx) => {
                  const v = p[s.key];
                  if (v == null || !Number.isFinite(v)) return null;
                  const x = xForIndex(idx);
                  const y = yForValue(v);
                  const isActive = idx === activeIndex;
                  const isHover = idx === hoverIndex;
                  return (
                    <circle
                      key={`dot-${s.key}-${p.date}`}
                      cx={x}
                      cy={y}
                      r={isHover ? 7 : isActive ? 6 : 5}
                      className="morning-trend-dot"
                      style={{ fill: s.color }}
                    />
                  );
                })}
              </g>
            ))}

            {hoverIndex != null ? (
              <line
                x1={xForIndex(hoverIndex)}
                x2={xForIndex(hoverIndex)}
                y1={dims.top}
                y2={dims.height - dims.bottom}
                className="morning-trend-hoverline"
              />
            ) : null}
          </svg>

          {hoverPoint && hoverPos ? (
            <div
              className="morning-trend-tooltip"
              style={{
                insetInlineStart: clampTooltipInlineStart(hoverPos.x, hoverPos.w, isRTL),
                top: clampTooltipTop(hoverPos.y)
              }}
            >
              <div className="morning-trend-tooltip-title">{dayLabel(hoverPoint.date)}</div>
              <div className="morning-trend-tooltip-list">
                {series.map((s) => {
                  const v = hoverPoint[s.key];
                  if (v == null) return null;
                  return (
                    <div key={`tip-${s.key}`} className="morning-trend-tooltip-row">
                      <span className="morning-trend-swatch" style={{ background: s.color }} />
                      <span>{s.label}:</span>
                      <b>{Math.round(v)}</b>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="morning-trend-empty">
          <strong>אין עדיין נתוני בוקר ב-7 ימים האחרונים</strong>
          <button type="button" className="choice-btn" onClick={onEdit}>
            הזן עדכון בוקר
          </button>
        </div>
      )}

      <div className="morning-trend-legend" aria-label="מקרא">
        {series.map((s) => (
          <span key={`legend-${s.key}`} className="morning-trend-legend-item">
            <i aria-hidden style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </section>
  );
}

export default function TodayPage() {
  const router = useRouter();
  const autoMorningPromptedDateRef = useRef<string | null>(null);
  const morningRestoreAttemptedRef = useRef<Set<string>>(new Set());
  const [activeDate, setActiveDate] = useState(formatISODate());
  const [historicalEditMode, setHistoricalEditMode] = useState(false);
  const [today, setToday] = useState<TodayData | null>(null);
  const [journal, setJournal] = useState<DayJournalBundle | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [coachAgent, setCoachAgent] = useState<CoachAgentReport | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [forecastToday, setForecastToday] = useState<ForecastDay | null>(null);
  const [toast, setToast] = useState("");
  const [selectedSport, setSelectedSport] = useState<ForecastOption["sport"]>("run");
  const [expandedSport, setExpandedSport] = useState<ForecastOption["sport"] | null>(null);

  const [checkinOptions, setCheckinOptions] = useState<CheckinOptions | null>(null);
  const [morningDone, setMorningDone] = useState<boolean>(false);
  const [showMorningModal, setShowMorningModal] = useState(false);
  const [morningStep, setMorningStep] = useState(0);
  const [morningForm, setMorningForm] = useState<MorningForm>({
    date: activeDate,
    exertion: "",
    sleep: "",
    hrv: "",
    restingHr: "",
    mood: "",
    sorenessLevel: "",
    painAreas: []
  });

  const [pendingFeedback, setPendingFeedback] = useState<PendingWorkoutFeedback[]>([]);
  const [shoes, setShoes] = useState<ShoeOption[]>([]);
  const [selectedWorkoutShoeId, setSelectedWorkoutShoeId] = useState("");
  const [showWorkoutModal, setShowWorkoutModal] = useState(false);
  const [workoutForm, setWorkoutForm] = useState({
    perceivedEffort: "moderate" as "easy" | "moderate" | "hard" | "max",
    bodyFeel: "normal" as "fresh" | "normal" | "heavy" | "pain",
    breathingFeel: "steady" as "easy" | "steady" | "hard"
  });
  const [runWorkoutForm, setRunWorkoutForm] = useState<RunFeedbackValues>(defaultRunFeedbackValues());
  const [strengthWorkoutForm, setStrengthWorkoutForm] = useState<StrengthFeedbackValues>(defaultStrengthFeedbackValues());
  const [morningReminderStartDate, setMorningReminderStartDate] = useState<string | null>(null);
  const [missingMorningDates, setMissingMorningDates] = useState<string[]>([]);
  const [morningSideExpanded, setMorningSideExpanded] = useState(false);
  const [nutritionFavorites, setNutritionFavorites] = useState<NutritionFavoriteOption[]>([]);
  const [nutritionIngredients, setNutritionIngredients] = useState<NutritionIngredientLite[]>([]);
  const [todayFoodQuery, setTodayFoodQuery] = useState("");
  const [todayFoodModalOpen, setTodayFoodModalOpen] = useState(false);
  const [todayFoodSelected, setTodayFoodSelected] = useState<QuickFoodOption | null>(null);
  const [todayFoodSlot, setTodayFoodSlot] = useState<MealSlot>("breakfast");
  const [todayFoodQuantity, setTodayFoodQuantity] = useState(1);
  const [todayFoodUnit, setTodayFoodUnit] = useState<NutritionUnit>("unit");
  const [addingTodayFood, setAddingTodayFood] = useState(false);
  const [addingWaterIntake, setAddingWaterIntake] = useState(false);

  const [newIngredientModalOpen, setNewIngredientModalOpen] = useState(false);
  const [newIngredientDraft, setNewIngredientDraft] = useState<NewIngredientDraft | null>(null);
  const [newIngredientSuggesting, setNewIngredientSuggesting] = useState(false);
  const [newIngredientSaving, setNewIngredientSaving] = useState(false);
  const [scoreTrend, setScoreTrend] = useState<Array<{ date: string; readiness: number; fatigue: number; fitness: number }>>([]);
  const [morningTrend, setMorningTrend] = useState<MorningTrendPoint[]>([]);
  const [mobileWorkoutIndex, setMobileWorkoutIndex] = useState(0);
  const [showMobileMoreWorkouts, setShowMobileMoreWorkouts] = useState(false);
  const mobileWorkoutCarouselRef = useRef<HTMLDivElement | null>(null);

  const activePendingWorkout = pendingFeedback[0] ?? null;
  const isRunFeedback = activePendingWorkout?.sport === "run";
  const isStrengthFeedback = activePendingWorkout?.sport === "strength";

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(""), 2000);
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const requestedDate = new URLSearchParams(window.location.search).get("date");
    if (isIsoDate(requestedDate)) {
      setActiveDate(requestedDate);
    }
  }, []);

  useEffect(() => {
    const todayIso = formatISODate();
    try {
      const existing = window.localStorage.getItem(MORNING_REMINDER_START_KEY);
      if (existing && /^\d{4}-\d{2}-\d{2}$/.test(existing)) {
        setMorningReminderStartDate(existing);
        return;
      }
      window.localStorage.setItem(MORNING_REMINDER_START_KEY, todayIso);
    } catch {
      // ignore localStorage issues and fallback to today's date
    }
    setMorningReminderStartDate(todayIso);
  }, []);

  const intensityBuckets = useMemo(
    () => categorizeOptionsByIntensity(forecastToday?.options ?? []),
    [forecastToday?.options]
  );

  const sportsAvailable = useMemo(() => {
    const set = new Set<ForecastOption["sport"]>((forecastToday?.options ?? []).map((opt) => opt.sport));
    if (!set.size) return sportPriority;
    return sportPriority.filter((sport) => set.has(sport));
  }, [forecastToday?.options]);

  useEffect(() => {
    if (!sportsAvailable.length) return;
    setSelectedSport((prev) => (sportsAvailable.includes(prev) ? prev : sportsAvailable[0]));
  }, [sportsAvailable]);

  useEffect(() => {
    setSelectionOverride(null);
    setExpandedSport(null);
  }, [forecastToday?.date]);

  useEffect(() => {
    if (!forecastToday?.options?.length) return;
    const selected = forecastToday.options.find((opt) => opt.id === forecastToday.selectedOptionId);
    if (!selected) return;
    setSelectedSport(selected.sport);
  }, [forecastToday?.date, forecastToday?.selectedOptionId, forecastToday?.options]);

  const [selectionOverride, setSelectionOverride] = useState<ForecastOption | null>(null);
  const [variantIndex, setVariantIndex] = useState(0);
  const currentDate = formatISODate();
  const isHistoricalDay = activeDate < currentDate;
  const isForcedRestDay = (today?.fatigueScore ?? 0) > 65;
  const recommendedMode = useMemo(
    () => detectRecommendedMode(forecastToday?.options ?? [], forecastToday?.selectedOptionId),
    [forecastToday?.options, forecastToday?.selectedOptionId]
  );

  const selectedWorkoutBase = useMemo(() => {
    if (isForcedRestDay) return null;
    if (selectionOverride) return selectionOverride;
    if (!forecastToday?.options?.length) return null;
    return findWorkoutForCombination(forecastToday.options, selectedSport, intensityBuckets, recommendedMode);
  }, [forecastToday?.options, selectedSport, intensityBuckets, recommendedMode, selectionOverride]);

  const workoutVariants = useMemo(
    () => (selectedWorkoutBase ? buildWorkoutVariants(selectedWorkoutBase, recommendedMode) : []),
    [recommendedMode, selectedWorkoutBase]
  );

  useEffect(() => {
    setVariantIndex(0);
  }, [selectedWorkoutBase?.id, recommendedMode]);

  const fallbackRecOption = rec ? recommendationToOption(rec) : null;
  const shouldLockRecommendationToDayStatus =
    !isHistoricalDay && (rec?.dayStatus === "target_done" || rec?.dayStatus === "can_add_short");
  const displayWorkout = isForcedRestDay
    ? fallbackRecOption
    : shouldLockRecommendationToDayStatus
      ? fallbackRecOption
      : workoutVariants[variantIndex] ?? selectedWorkoutBase ?? fallbackRecOption;
  const orderedTodayWorkouts = useMemo(() => {
    const workouts = [...(today?.todayWorkouts ?? [])];
    if (!workouts.length) return [];
    const primary = [...workouts].sort((a, b) => {
      const runPriority = Number(b.sport === "run") - Number(a.sport === "run");
      if (runPriority !== 0) return runPriority;
      const loadPriority = (b.tssLike ?? 0) - (a.tssLike ?? 0);
      if (loadPriority !== 0) return loadPriority;
      return new Date(b.startAt).getTime() - new Date(a.startAt).getTime();
    })[0];
    const rest = workouts
      .filter((workout) => workout.id !== primary.id)
      .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());
    return [primary, ...rest];
  }, [today?.todayWorkouts]);
  const primaryWorkout = orderedTodayWorkouts[0] ?? null;

  const workoutSummaryPartsFor = (workout: NonNullable<TodayData["todayWorkouts"]>[number]) => {
    const runScore =
      workout.sport === "run" && typeof workout.runScore === "number" ? workout.runScore : null;
    const parts = [
      ...(runScore != null ? [`${faceByScore(runScore)} ציון ריצה: ${runScore}`] : []),
      ...(() => {
        const moving = workout.movingDurationSec;
        const total = workout.durationSec;
        if (workout.sport === "run" && moving != null && moving > 0 && Math.abs(total - moving) >= 60) {
          return [`משך ריצה: ${formatDuration(moving)}`, `משך כלל אימון: ${formatDuration(total)}`];
        }
        return [`משך כלל אימון: ${formatDuration(total)}`];
      })(),
      ...(getDisplayDistanceKm(workout) != null ? [`${formatDistanceKm(getDisplayDistanceKm(workout))} ק״מ`] : []),
      ...(workout.paceDisplayMinPerKm != null ? [formatPace(workout.paceDisplayMinPerKm)] : [])
    ];
    return parts;
  };

  const workoutsDisplayData = useMemo(
    () =>
      orderedTodayWorkouts.map((workout) => ({
        workout,
        runScore:
          workout.sport === "run" && typeof workout.runScore === "number" ? workout.runScore : null,
        metrics: buildWorkoutBannerMetrics({
          sport: workout.sport,
          durationSec: workout.durationSec,
          distanceKm: getDisplayDistanceKm(workout),
          paceMinPerKm: workout.paceDisplayMinPerKm ?? null,
          avgHr: workout.avgHr ?? null,
          load: workout.tssLike ?? null
        }),
        summaryParts: workoutSummaryPartsFor(workout)
      })),
    [orderedTodayWorkouts]
  );
  const mobileCarouselWorkouts = workoutsDisplayData.slice(0, 2);
  const hiddenMobileWorkouts = workoutsDisplayData.slice(2);

  const feedbackByWorkoutId = useMemo(
    () =>
      new Map(
        (journal?.workoutFeedback ?? []).map((item) => [item.workoutId, item as unknown as WorkoutFeedbackSnapshot])
      ),
    [journal?.workoutFeedback]
  );
  const firstWorkoutFeedback = primaryWorkout ? feedbackByWorkoutId.get(primaryWorkout.id) ?? null : null;
  const selectedWorkoutShoe = shoes.find((shoe) => shoe.id === selectedWorkoutShoeId) ?? null;
  const selectedShoeProgress =
    selectedWorkoutShoe?.targetKm && selectedWorkoutShoe.targetKm > 0
      ? Math.max(0, Math.min(100, ((selectedWorkoutShoe.totalKm ?? 0) / selectedWorkoutShoe.targetKm) * 100))
      : 0;
  const feedbackBalance = useMemo(() => {
    if (!firstWorkoutFeedback) return null;
    const loadRaw = [
      firstWorkoutFeedback.rpeScore,
      firstWorkoutFeedback.legsLoadScore,
      firstWorkoutFeedback.painScore,
      firstWorkoutFeedback.breathingScore,
      firstWorkoutFeedback.overallLoadScore
    ].filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const qualityRaw = [
      firstWorkoutFeedback.recoveryScore,
      firstWorkoutFeedback.satisfactionScore,
      firstWorkoutFeedback.addFiveKmScore,
      firstWorkoutFeedback.preRunNutritionScore,
      firstWorkoutFeedback.environmentScore
    ].filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    if (!loadRaw.length && !qualityRaw.length) return null;
    const loadPct = loadRaw.length
      ? Math.round((loadRaw.reduce((sum, value) => sum + value, 0) / loadRaw.length / 5) * 100)
      : null;
    const qualityPct = qualityRaw.length
      ? Math.round(
          (qualityRaw.reduce((sum, value) => sum + (6 - value), 0) / qualityRaw.length / 5) * 100
        )
      : null;
    return { loadPct, qualityPct };
  }, [firstWorkoutFeedback]);

  const hasWorkoutOnDay = Boolean(primaryWorkout);
  const showRecommendationPanel = !isHistoricalDay;
  const showRestHistoricalCard = isHistoricalDay && !hasWorkoutOnDay;
  const showMorningSideCard = showRecommendationPanel && !hasWorkoutOnDay && !showRestHistoricalCard;
  const topGridClassName = hasWorkoutOnDay || showMorningSideCard ? "today-top-grid split" : "today-top-grid";

  useEffect(() => {
    setMobileWorkoutIndex(0);
    setShowMobileMoreWorkouts(false);
    if (mobileWorkoutCarouselRef.current) {
      mobileWorkoutCarouselRef.current.scrollTo({ left: 0, behavior: "auto" });
    }
  }, [activeDate, workoutsDisplayData.length]);

  const handleWorkoutCarouselScroll = () => {
    const node = mobileWorkoutCarouselRef.current;
    if (!node) return;
    const width = node.clientWidth;
    if (width <= 0) return;
    const nextIndex = Math.round(node.scrollLeft / width);
    setMobileWorkoutIndex(Math.max(0, Math.min(nextIndex, mobileCarouselWorkouts.length - 1)));
  };
  const todayFoodOptions = useMemo(() => {
    const favoriteOptions: QuickFoodOption[] = nutritionFavorites.map((favorite) => ({
      value: favorite.id,
      label: `★ ${favorite.name}`,
      kind: "favorite",
      preview: favorite.preview ?? null
    }));
    const favoriteIngredientIds = new Set(
      nutritionFavorites
        .map((item) => quickValueToIngredientId(item.id))
        .filter((value): value is string => Boolean(value))
    );
    const ingredientOptions: QuickFoodOption[] = [...nutritionIngredients]
      .sort((a, b) => a.name.localeCompare(b.name, "he"))
      .filter((ingredient) => !favoriteIngredientIds.has(ingredient.id))
      .map((ingredient) => ({
        value: `ingredient:${ingredient.id}`,
        label: ingredient.name,
        kind: "ingredient",
        ingredientId: ingredient.id,
        preview: null
      }));
    return [...favoriteOptions, ...ingredientOptions];
  }, [nutritionFavorites, nutritionIngredients]);
  const todayFoodOptionMap = useMemo(
    () => new Map(todayFoodOptions.map((option) => [option.value, option])),
    [todayFoodOptions]
  );
  const todayFoodUnitOptions = useMemo(
    () => nutritionUnitOptions.map((option) => ({ value: option.value, label: option.label })),
    []
  );
  const todayFoodSlotSelectOptions = useMemo(
    () => mealSlotOptions.map((option) => ({ value: option.value, label: option.label })),
    []
  );
  const selectedTodayIngredient = useMemo(() => {
    const ingredientId = todayFoodSelected ? quickValueToIngredientId(todayFoodSelected.value) : null;
    if (!ingredientId) return null;
    return nutritionIngredients.find((item) => item.id === ingredientId) ?? null;
  }, [todayFoodSelected, nutritionIngredients]);
  const todayFoodIsDrink = useMemo(() => {
    if (!todayFoodSelected) return false;
    if (selectedTodayIngredient && looksLikeDrinkName(selectedTodayIngredient.name)) return true;
    return looksLikeDrinkName(todayFoodSelected.label);
  }, [todayFoodSelected, selectedTodayIngredient]);
  const todayFoodEffectiveSlot: MealSlot = todayFoodIsDrink ? "drinks" : todayFoodSlot;
  const todayFoodMacroPreview = useMemo(() => {
    if (!todayFoodSelected) return null;
    if (selectedTodayIngredient) {
      const grams = nutritionQuantityToGrams(todayFoodQuantity, todayFoodUnit, selectedTodayIngredient);
      const factor = grams / 100;
      return {
        kcal: Math.round(selectedTodayIngredient.kcalPer100 * factor),
        proteinG: Math.round(selectedTodayIngredient.proteinPer100 * factor * 10) / 10,
        carbsG: Math.round(selectedTodayIngredient.carbsPer100 * factor * 10) / 10,
        fatG: Math.round(selectedTodayIngredient.fatPer100 * factor * 10) / 10
      };
    }
    const preview = todayFoodSelected.preview;
    if (!preview || preview.baseQuantity <= 0) return null;
    const factor = todayFoodQuantity / preview.baseQuantity;
    return {
      kcal: Math.round(preview.kcal * factor),
      proteinG: Math.round(preview.proteinG * factor * 10) / 10,
      carbsG: Math.round(preview.carbsG * factor * 10) / 10,
      fatG: Math.round(preview.fatG * factor * 10) / 10
    };
  }, [todayFoodSelected, selectedTodayIngredient, todayFoodQuantity, todayFoodUnit]);
  const topNutritionTargets = useMemo(() => {
    // Use journal data if available, otherwise use defaults for display
    const proteinTarget = journal ? Math.max(1, journal.nutrition.target.proteinG) : 180;
    const carbsTarget = journal ? Math.max(1, journal.nutrition.target.carbsG || 300) : 250;
    const fatTarget = journal ? Math.max(1, journal.nutrition.target.fatG) : 70;

    const rows = [
      {
        key: "protein",
        label: "חלבון",
        actual: journal ? journal.nutrition.totals.proteinG : 0,
        target: proteinTarget,
        actualLabel: `${Math.round(journal ? journal.nutrition.totals.proteinG : 0)}G`,
        targetLabel: `${Math.round(proteinTarget)}G`
      },
      {
        key: "carbs",
        label: "פחמימות",
        actual: journal ? (journal.nutrition.totals.carbsG || 0) : 0,
        target: carbsTarget,
        actualLabel: `${Math.round(journal ? (journal.nutrition.totals.carbsG || 0) : 0)}G`,
        targetLabel: `${Math.round(carbsTarget)}G`
      },
      {
        key: "fat",
        label: "שומנים",
        actual: journal ? journal.nutrition.totals.fatG : 0,
        target: fatTarget,
        actualLabel: `${Math.round(journal ? journal.nutrition.totals.fatG : 0)}G`,
        targetLabel: `${Math.round(fatTarget)}G`
      }
    ];

    return rows.map((row) => {
      const pct = clampPercent((row.actual / row.target) * 100);
      return {
        key: row.key,
        label: row.label,
        actualLabel: row.actualLabel,
        targetLabel: row.targetLabel,
        pct,
        tone: percentToTone(pct)
      };
    });
  }, [journal]);
  const waterIngredientId = useMemo(() => {
    const exact = nutritionIngredients.find((ingredient) => ingredient.name.trim() === "מים");
    if (exact) return exact.id;
    const fallback = nutritionIngredients.find((ingredient) => ingredient.name.includes("מים"));
    return fallback?.id ?? null;
  }, [nutritionIngredients]);
  const drinksSummary = useMemo(() => {
    if (!journal) {
      return { totalMl: 0, entries: [] as Array<{ name: string; quantityLabel: string }> };
    }
    const drinkMeals = (journal.nutrition.meals ?? []).filter((meal) => meal.slot === "drinks");
    const entries = drinkMeals.flatMap((meal) =>
      meal.items.map((item) => ({
        name: item.name,
        quantityLabel: `${item.quantity} ${nutritionUnitLabel(item.unit)}`
      }))
    );
    const totalMl = Math.round(
      drinkMeals.reduce(
        (total, meal) =>
          total +
          meal.items.reduce((mealTotal, item) => {
            if (item.unit === "ml") return mealTotal + (Number(item.quantity) || 0);
            if (looksLikeDrinkName(item.name)) return mealTotal + (Number(item.grams) || 0);
            return mealTotal;
          }, 0),
        0
      )
    );
    return { totalMl, entries };
  }, [journal]);
  const morningSideMetrics = useMemo<MorningMetricVisual[]>(() => {
    if (!morningDone || !journal?.recovery) return [];
    const fields: Array<{ field: MorningMetricField; label: string }> = [
      { field: "sleep", label: "שינה" },
      { field: "mood", label: "מצב רוח" },
      { field: "sorenessLevel", label: "כאב שרירים" },
      { field: "restingHr", label: "דופק מנוחה" },
      { field: "hrv", label: "HRV" },
      { field: "exertion", label: "גוף כללי" }
    ];
    const recovery = journal.recovery;
    return fields.map((item) => {
      const choiceId =
        item.field === "sleep"
          ? sleepChoiceFromRecovery(recovery)
          : item.field === "exertion"
            ? toChoiceIdFromRecovery(item.field, recovery?.rpe)
            : item.field === "hrv"
              ? toChoiceIdFromRecovery(item.field, recovery?.hrv)
              : item.field === "restingHr"
                ? toChoiceIdFromRecovery(item.field, recovery?.restingHr)
                : item.field === "mood"
                  ? toChoiceIdFromRecovery(item.field, recovery?.mood)
                  : toChoiceIdFromRecovery(item.field, recovery?.sorenessGlobal);
      const choiceLabel =
        checkinOptions?.options[item.field]?.find((choice) => choice.id === choiceId)?.label ??
        (choiceId ? String(choiceId) : "לא הוזן");
      const value = normalizeMorningMetric(item.field, choiceId ?? "normal");
      const actualLabel =
        item.field === "restingHr" && recovery?.restingHr != null
          ? `${Math.round(recovery.restingHr)} bpm`
          : item.field === "hrv" && recovery?.hrv != null
            ? `${Math.round(recovery.hrv)} ms`
            : undefined;
      return {
        field: item.field,
        label: item.label,
        value,
        icon: morningMetricIcon(item.field),
        color: morningMetricColor(value),
        choiceLabel,
        score5: morningScore5(value),
        actualLabel
      };
    });
  }, [morningDone, journal?.recovery, checkinOptions]);
  const morningSideAverage5 = useMemo(() => {
    if (!morningSideMetrics.length) return null;
    const avg = Math.round(morningSideMetrics.reduce((sum, item) => sum + item.value, 0) / morningSideMetrics.length);
    return morningScore5(avg);
  }, [morningSideMetrics]);
  const morningSideLineData = useMemo(() => {
    if (!morningSideMetrics.length) return null;
    const width = 640;
    const height = 206;
    const padX = 42;
    const top = 26;
    const bottom = 184;
    const step = morningSideMetrics.length > 1 ? (width - padX * 2) / (morningSideMetrics.length - 1) : 0;
    const points = morningSideMetrics.map((metric, index) => {
      const x = padX + index * step;
      const y = bottom - ((Math.max(1, metric.score5) - 1) / 4) * (bottom - top);
      return { ...metric, x, y };
    });
    return {
      width,
      height,
      top,
      bottom,
      points,
      polyline: points.map((point) => `${point.x},${point.y}`).join(" ")
    };
  }, [morningSideMetrics]);

  useEffect(() => {
    setMorningSideExpanded(false);
  }, [activeDate, showMorningSideCard]);

  useEffect(() => {
    setTodayFoodModalOpen(false);
    setTodayFoodSelected(null);
    setTodayFoodQuery("");
    setNewIngredientModalOpen(false);
    setNewIngredientDraft(null);
  }, [activeDate]);

  async function suggestNewIngredient(text: string) {
    const trimmed = text.trim();
    if (trimmed.length < 2) return null as any;
    setNewIngredientSuggesting(true);
    try {
      const res = await fetch("/api/nutrition/ingredient/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed })
      });
      if (!res.ok) return null as any;
      const json = (await res.json()) as { ok: boolean; suggestion: null | Partial<NewIngredientDraft> & { name?: string; category?: NewIngredientDraft["category"] } };
      if (!json.ok || !json.suggestion) return null as any;
      return json.suggestion;
    } catch {
      return null as any;
    } finally {
      setNewIngredientSuggesting(false);
    }
  }

  async function openNewIngredientModal(query: string) {
    const name = query.trim();
    if (name.length < 2) return;
    setTodayFoodQuery("");
    setNewIngredientModalOpen(true);
    setNewIngredientDraft({
      name,
      category: "mixed",
      kcalPer100: 0,
      proteinPer100: 0,
      carbsPer100: 0,
      fatPer100: 0,
      defaultUnit: "g",
      gramsPerUnit: 100
    });

    const suggestion = await suggestNewIngredient(name);
    if (!suggestion) return;
    setNewIngredientDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        name: String(suggestion.name ?? prev.name),
        category: (suggestion.category as any) ?? prev.category,
        kcalPer100: Number(suggestion.kcalPer100 ?? prev.kcalPer100),
        proteinPer100: Number(suggestion.proteinPer100 ?? prev.proteinPer100),
        carbsPer100: Number(suggestion.carbsPer100 ?? prev.carbsPer100),
        fatPer100: Number(suggestion.fatPer100 ?? prev.fatPer100),
        defaultUnit: (suggestion.defaultUnit as any) ?? prev.defaultUnit,
        gramsPerUnit: Number(suggestion.gramsPerUnit ?? prev.gramsPerUnit)
      };
    });
  }

  async function saveNewIngredient() {
    if (!newIngredientDraft || newIngredientSaving) return;
    const draft = newIngredientDraft;
    if (!draft.name.trim()) {
      showToast("חסר שם מזון.");
      return;
    }
    if (![draft.proteinPer100, draft.carbsPer100, draft.fatPer100].every((v) => Number.isFinite(v))) {
      showToast("נתוני מאקרו לא תקינים.");
      return;
    }
    if (!Number.isFinite(draft.gramsPerUnit) || draft.gramsPerUnit <= 0) {
      showToast("גרם ליחידה לא תקין.");
      return;
    }

    setNewIngredientSaving(true);
    try {
      const res = await fetch("/api/nutrition/ingredient", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name.trim(),
          category: draft.category,
          kcalPer100: draft.kcalPer100 > 0 ? draft.kcalPer100 : undefined,
          proteinPer100: draft.proteinPer100,
          carbsPer100: draft.carbsPer100,
          fatPer100: draft.fatPer100,
          defaultUnit: draft.defaultUnit,
          gramsPerUnit: draft.gramsPerUnit
        })
      });
      if (!res.ok) {
        showToast("שמירת מזון נכשלה.");
        return;
      }
      const json = (await res.json()) as { ok?: boolean; ingredient?: { id?: string; name?: string; defaultunit?: string; defaultUnit?: string } };
      const ingredientId = String((json.ingredient as any)?.id ?? "").trim();
      if (!ingredientId) {
        showToast("שמירת מזון נכשלה.");
        return;
      }

      showToast("נוסף לקטלוג.");
      setNewIngredientModalOpen(false);
      setNewIngredientDraft(null);
      await loadDashboard(activeDate);

      // After refresh, open quick-add for the new ingredient (so you can add it to a meal).
      const value = `ingredient:${ingredientId}`;
      setTimeout(() => {
        openTodayFoodModal(value);
      }, 50);
    } finally {
      setNewIngredientSaving(false);
    }
  }

  function openTodayFoodModal(nextValue: string) {
    setTodayFoodQuery(nextValue);
    const selected = todayFoodOptionMap.get(nextValue) ?? null;
    if (!selected) return;
    const ingredientId = quickValueToIngredientId(selected.value);
    const ingredient = ingredientId ? nutritionIngredients.find((item) => item.id === ingredientId) ?? null : null;
    const isDrinkSelection =
      Boolean(ingredient && looksLikeDrinkName(ingredient.name)) ||
      Boolean(selected && looksLikeDrinkName(selected.label));
    const defaultSlot = isDrinkSelection ? "drinks" : mealSlotByHour();
    const defaultUnit = ingredient?.defaultUnit ?? selected.preview?.baseUnit ?? "unit";
    // For g/ml units use ingredient's gramsPerUnit as default qty (e.g. 250ml water, 80g oats)
    const fallbackQuantity = defaultUnit === "unit" || defaultUnit === "tbsp" || defaultUnit === "tsp"
      ? 1
      : (ingredient?.gramsPerUnit ?? 100);
    const defaultQuantity = selected.preview?.baseQuantity ?? fallbackQuantity;
    setTodayFoodSelected(selected);
    setTodayFoodSlot(defaultSlot);
    setTodayFoodUnit(defaultUnit);
    setTodayFoodQuantity(defaultQuantity);
    setTodayFoodModalOpen(true);
  }

  async function addTodayFood() {
    if (!todayFoodSelected || addingTodayFood) return;
    setAddingTodayFood(true);
    try {
      const ingredientId = quickValueToIngredientId(todayFoodSelected.value);
      const payload = {
        date: activeDate,
        favoriteId: todayFoodSelected.value,
        slot: todayFoodEffectiveSlot,
        quantity: ingredientId ? todayFoodQuantity : undefined,
        unit: ingredientId ? todayFoodUnit : undefined
      };
      const res = await fetch("/api/nutrition/favorites/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        showToast("הוספת מזון נכשלה.");
        return;
      }
      showToast(`נוסף ל-${mealSlotLabel(todayFoodEffectiveSlot)}`);
      setTodayFoodModalOpen(false);
      setTodayFoodSelected(null);
      setTodayFoodQuery("");
      await loadDashboard(activeDate);
    } finally {
      setAddingTodayFood(false);
    }
  }

  async function quickAddWater() {
    if (!waterIngredientId) {
      showToast("לא נמצא פריט מים בקטלוג.");
      return;
    }
    if (addingWaterIntake) return;
    setAddingWaterIntake(true);
    try {
      const res = await fetch("/api/nutrition/favorites/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: activeDate,
          favoriteId: `ingredient:${waterIngredientId}`,
          slot: "drinks",
          quantity: 200,
          unit: "ml"
        })
      });
      if (!res.ok) {
        showToast("הוספת מים נכשלה.");
        return;
      }
      showToast("נוסף מים (200 מ״ל).");
      await loadDashboard(activeDate);
    } catch {
      showToast("הוספת מים נכשלה.");
    } finally {
      setAddingWaterIntake(false);
    }
  }

  function openEmptyNewIngredientModal() {
    setNewIngredientModalOpen(true);
    setNewIngredientDraft({
      name: "",
      category: "mixed",
      kcalPer100: 0,
      proteinPer100: 0,
      carbsPer100: 0,
      fatPer100: 0,
      defaultUnit: "g",
      gramsPerUnit: 100
    });
  }

  async function addTodayDrinkCup() {
    if (!waterIngredientId || addingTodayFood) {
      if (!waterIngredientId) {
        showToast("לא נמצא 'מים' בקטלוג.");
      }
      return;
    }
    setAddingTodayFood(true);
    try {
      const res = await fetch("/api/nutrition/favorites/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: activeDate,
          favoriteId: `ingredient:${waterIngredientId}`,
          slot: "drinks",
          quantity: 250,
          unit: "ml"
        })
      });
      if (!res.ok) {
        showToast("הוספת כוס שתייה נכשלה.");
        return;
      }
      showToast("נוספה כוס שתייה לאזור השתייה");
      await loadDashboard(activeDate);
    } finally {
      setAddingTodayFood(false);
    }
  }

  async function loadMissingMorningUpdates(startDate = morningReminderStartDate) {
    const todayIso = formatISODate();
    if (!startDate) {
      setMissingMorningDates([]);
      return;
    }
    const recentDates = [addDaysISO(todayIso, -1), addDaysISO(todayIso, -2)].filter((date) => date >= startDate);
    if (!recentDates.length) {
      setMissingMorningDates([]);
      return;
    }

    const checks = await Promise.all(
      recentDates.map(async (date) => {
        try {
          const res = await fetch(`/api/checkin/daily?date=${date}`);
          if (!res.ok) return null;
          const payload = (await res.json()) as { exists?: boolean };
          return payload.exists ? null : date;
        } catch {
          return null;
        }
      })
    );
    setMissingMorningDates(checks.filter((date): date is string => Boolean(date)));
  }

  useEffect(() => {
    setMorningForm((prev) => ({ ...prev, date: activeDate }));
    setHistoricalEditMode(false);
    void loadDashboard(activeDate);
  }, [activeDate]);

  useEffect(() => {
    if (!morningReminderStartDate) return;
    void loadMissingMorningUpdates(morningReminderStartDate);
  }, [morningReminderStartDate]);

  useEffect(() => {
    const todayIso = formatISODate();
    if (activeDate !== todayIso) return;
    if (!checkinOptions) return;
    if (morningDone) return;
    if (showMorningModal) return;
    if (autoMorningPromptedDateRef.current === activeDate) return;

    autoMorningPromptedDateRef.current = activeDate;
    setMorningStep(nextMorningStepFromForm(morningForm));
    setShowMorningModal(true);
  }, [activeDate, checkinOptions, morningDone, showMorningModal, morningForm]);

  async function safeJson<T>(url: string, fallback: T, label: string) {
    try {
      const res = await fetch(url);
      const text = await res.text();
      if (!res.ok) return { ok: false as const, data: fallback, error: `${label}: ${res.status}` };
      try {
        return { ok: true as const, data: JSON.parse(text) as T };
      } catch {
        return { ok: false as const, data: fallback, error: `${label}: JSON` };
      }
    } catch {
      return { ok: false as const, data: fallback, error: `${label}: network` };
    }
  }

  async function loadDashboard(date = activeDate) {
    setLoadError(null);

    const emptyJournalFallback: DayJournalBundle = {
      date,
      recovery: null,
      nutrition: {
        plan: { hydrationMl: 2450, preWorkoutNote: "", postWorkoutNote: "" },
        meals: [],
        totals: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
        target: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
        deltaToTarget: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
        status: { kcal: "on_target", protein: "on_target", kcalLabel: "-", proteinLabel: "-" }
      },
      workouts: [],
      workoutFeedback: [],
      dayStatus: { label: "-", hasWorkout: false }
    };

    const [journalRes, journalFeedRes, optsRes, pendingRes, fRes, shoesRes, checkinDailyRes, favoritesRes, pantryRes] =
      await Promise.all([
        safeJson(`/api/journal/day?date=${date}`, emptyJournalFallback, "journal"),
        safeJson(`/api/journal/feed?anchorDate=${date}&days=7`, { items: [] as any[] } as any, "journal-feed"),
        safeJson("/api/checkin/options", { options: null, painAreas: [] } as unknown as CheckinOptions, "options"),
        safeJson("/api/checkin/workout-feedback/pending", { pending: [] as PendingWorkoutFeedback[] }, "pending"),
        safeJson(`/api/dashboard/forecast?days=7&date=${date}`, { days: [] as ForecastDay[] }, "forecast"),
        safeJson("/api/shoes", { shoes: [] as ShoeOption[] }, "shoes"),
        safeJson(`/api/checkin/daily?date=${date}`, {} as CheckinDailyStatus, "checkin"),
        safeJson("/api/nutrition/favorites", { favorites: [] as NutritionFavoriteOption[] }, "favorites"),
        safeJson(`/api/nutrition/pantry?date=${date}`, { ingredients: [] as NutritionIngredientLite[] }, "pantry")
      ]);

    const errors = [
      journalRes.ok ? null : journalRes.error,
      journalFeedRes.ok ? null : journalFeedRes.error,
      optsRes.ok ? null : optsRes.error,
      pendingRes.ok ? null : pendingRes.error,
      fRes.ok ? null : fRes.error,
      shoesRes.ok ? null : shoesRes.error,
      checkinDailyRes.ok ? null : checkinDailyRes.error,
      favoritesRes.ok ? null : favoritesRes.error,
      pantryRes.ok ? null : pantryRes.error
    ].filter((x): x is string => Boolean(x));

    if (errors.length) setLoadError(errors.join(" · "));

    const bundle = (journalRes.data ?? emptyJournalFallback) as DayJournalBundle & {
    scores?: {
      readinessScore: number;
      fatigueScore: number;
      fitnessScore: number;
      stateTag?: "overtraining_risk" | "on_the_spot" | "peaking" | "losing_momentum";
      stateLabel?: string;
      stateHint?: string;
    };
      recommendation?: Recommendation;
      coachAgent?: CoachAgentReport | null;
    };
    setJournal(bundle);
    const feedItems = ((journalFeedRes.data as any)?.items ?? []) as Array<{
      date?: string;
      scores?: { readinessScore?: number; fatigueScore?: number; fitnessScore?: number };
      recovery?: {
        sleepHours?: number | null;
        sorenessGlobal?: number | null;
        restingHr?: number | null;
        hrv?: number | null;
      } | null;
    }>;
    setScoreTrend(
      feedItems
        .filter((item) => typeof item.date === "string")
        .map((item) => ({
          date: String(item.date),
          readiness: Number(item.scores?.readinessScore ?? 0),
          fatigue: Number(item.scores?.fatigueScore ?? 0),
          fitness: Number(item.scores?.fitnessScore ?? 0)
        }))
        .reverse()
    );

    const clamp5 = (value: number) => Math.max(1, Math.min(5, value));
    const sleepScore5 = (hours?: number | null) => (hours == null ? null : clamp5((hours / 8) * 5));
    const sorenessScore5 = (value?: number | null) => (value == null ? null : clamp5(((6 - value) / 5) * 5));
    const restingHrScore5 = (value?: number | null) => {
      if (value == null) return null;
      const score100 = Math.max(10, Math.min(100, 100 - (value - 48) * 2.4));
      return clamp5(score100 / 20);
    };
    const hrvScore5 = (value?: number | null) =>
      value == null ? null : clamp5(Math.max(10, Math.min(100, (value / 80) * 100)) / 20);

    setMorningTrend(
      feedItems
        .filter((item) => typeof item.date === "string")
        .map((item) => ({
          date: String(item.date),
          sleep: sleepScore5(item.recovery?.sleepHours),
          soreness: sorenessScore5(item.recovery?.sorenessGlobal),
          restingHr: restingHrScore5(item.recovery?.restingHr),
          hrv: hrvScore5(item.recovery?.hrv)
        }))
        .reverse()
    );
    setToday({
      readinessScore: bundle.scores?.readinessScore ?? 0,
      fatigueScore: bundle.scores?.fatigueScore ?? 0,
      fitnessScore: bundle.scores?.fitnessScore ?? 0,
      stateTag: bundle.scores?.stateTag,
      stateLabel: bundle.scores?.stateLabel,
      stateHint: bundle.scores?.stateHint,
      recommendation: bundle.recommendation?.workoutType ?? "",
      explanation: (bundle.recommendation as { explanationFactors?: string[] } | null | undefined)?.explanationFactors?.join("; ") ?? "",
      alerts: [],
      todayWorkouts: bundle.workouts?.map((workout) => ({
        id: workout.id,
        sport: workout.sport,
        startAt: workout.startAt,
        durationSec: workout.durationSec,
        distanceM: workout.distanceM,
        distanceDisplayKm: workout.distanceDisplayKm ?? null,
        distanceRawKm: workout.distanceRawKm ?? null,
        distanceOfficialKm: workout.distanceOfficialKm ?? null,
        durationForPaceSec: workout.durationForPaceSec ?? null,
        movingDurationSec: workout.movingDurationSec ?? null,
        pauseDurationSec: workout.pauseDurationSec ?? null,
        paceDisplayMinPerKm: workout.paceDisplayMinPerKm ?? null,
        avgHr: workout.avgHr ?? null,
        tssLike: workout.tssLike ?? null,
        runScore: (workout as { runScore?: number | null }).runScore ?? null,
        runScoreLabel: (workout as { runScoreLabel?: string | null }).runScoreLabel ?? null
      }))
    });
    setRec(bundle.recommendation ?? null);
    setCoachAgent(bundle.coachAgent ?? null);
    setCheckinOptions(optsRes.data as CheckinOptions);
    const checkinDaily = (checkinDailyRes.data as CheckinDailyStatus) ?? {};
    const hasMorning = Boolean(checkinDaily.exists || bundle.recovery);
    setMorningDone(hasMorning);
    if (!hasMorning) {
      const cached = readMorningCheckinCache(date);
      if (cached?.completed && !morningRestoreAttemptedRef.current.has(date)) {
        morningRestoreAttemptedRef.current.add(date);
        const restoreRes = await fetch("/api/checkin/daily", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...cached.form,
            date,
            sleepHoursActual: null,
            hrvActual: null,
            restingHrActual: null
          })
        });
        if (restoreRes.ok) {
          await loadDashboard(date);
          return;
        }
      }

      const progress = checkinDaily.progress;
      if (progress) {
        const hydrated: MorningForm = {
          date,
          exertion: typeof progress.exertion === "string" ? progress.exertion : "",
          sleep: typeof progress.sleep === "string" ? progress.sleep : "",
          hrv: typeof progress.hrv === "string" ? progress.hrv : "",
          restingHr: typeof progress.restingHr === "string" ? progress.restingHr : "",
          mood: typeof progress.mood === "string" ? progress.mood : "",
          sorenessLevel: typeof progress.sorenessLevel === "string" ? progress.sorenessLevel : "",
          painAreas: Array.isArray(progress.painAreas) ? progress.painAreas.filter(Boolean) : []
        };
        setMorningForm(hydrated);
        setMorningStep(nextMorningStepFromForm(hydrated));
        writeMorningCheckinCache(hydrated, false);
      } else if (cached?.form) {
        const hydrated = { ...cached.form, date };
        setMorningForm(hydrated);
        setMorningStep(nextMorningStepFromForm(hydrated));
      } else {
        const fresh: MorningForm = {
          date,
          exertion: "",
          sleep: "",
          hrv: "",
          restingHr: "",
          mood: "",
          sorenessLevel: "",
          painAreas: []
        };
        setMorningForm(fresh);
        setMorningStep(0);
      }
    }
    setPendingFeedback(((pendingRes.data as { pending?: PendingWorkoutFeedback[] }).pending ?? []) as PendingWorkoutFeedback[]);
    setShoes(((shoesRes.data as { shoes?: ShoeOption[] }).shoes ?? []) as ShoeOption[]);
    setNutritionFavorites(
      ((favoritesRes.data as { favorites?: NutritionFavoriteOption[] }).favorites ?? []) as NutritionFavoriteOption[]
    );
    setNutritionIngredients(
      ((pantryRes.data as { ingredients?: NutritionIngredientLite[] }).ingredients ?? []) as NutritionIngredientLite[]
    );
    const days = ((fRes.data as { days?: ForecastDay[] }).days ?? []) as ForecastDay[];
    setForecastToday(days[0] ?? null);
    if (morningReminderStartDate) {
      void loadMissingMorningUpdates(morningReminderStartDate);
    }
  }

  useEffect(() => {
    if (!activePendingWorkout) {
      setSelectedWorkoutShoeId("");
      return;
    }
    if (activePendingWorkout.sport !== "run") {
      setSelectedWorkoutShoeId("");
      return;
    }
    const defaultShoeId = shoes.find((shoe) => shoe.isDefault)?.id ?? shoes[0]?.id ?? "";
    setSelectedWorkoutShoeId(defaultShoeId);
  }, [activePendingWorkout?.workoutId, activePendingWorkout?.sport, shoes]);

  useEffect(() => {
    setWorkoutForm({ perceivedEffort: "moderate", bodyFeel: "normal", breathingFeel: "steady" });
    setRunWorkoutForm(defaultRunFeedbackValues());
    setStrengthWorkoutForm(defaultStrengthFeedbackValues());
  }, [activePendingWorkout?.workoutId]);

  async function triggerSync() {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await fetch("/api/ingest/rescan", { method: "POST" });
      const payload = (await res.json()) as { filesQueued: number; filesSkipped: number };
      showToast(`נסרקו ${payload.filesQueued} קבצים, דולגו ${payload.filesSkipped}.`);
      await loadDashboard();

      const pendingRes = await fetch("/api/checkin/workout-feedback/pending").then((r) => r.json());
      const pending = ((pendingRes as { pending?: PendingWorkoutFeedback[] }).pending ?? []) as PendingWorkoutFeedback[];
      setPendingFeedback(pending);
      if (pending.length > 0) {
        setWorkoutForm({ perceivedEffort: "moderate", bodyFeel: "normal", breathingFeel: "steady" });
        setRunWorkoutForm(defaultRunFeedbackValues());
        setStrengthWorkoutForm(defaultStrengthFeedbackValues());
        setShowWorkoutModal(true);
      }
    } catch {
      showToast("הסנכרון נכשל.");
    } finally {
      setSyncing(false);
    }
  }

  async function persistMorningProgress(form: MorningForm, step = morningStep) {
    writeMorningCheckinCache(form, false);
    await fetch("/api/checkin/daily", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: form.date,
        savePartial: true,
        ...(form.exertion ? { exertion: form.exertion } : {}),
        ...(form.sleep ? { sleep: form.sleep } : {}),
        ...(form.hrv ? { hrv: form.hrv } : {}),
        ...(form.restingHr ? { restingHr: form.restingHr } : {}),
        ...(form.mood ? { mood: form.mood } : {}),
        ...(form.sorenessLevel ? { sorenessLevel: form.sorenessLevel } : {}),
        painAreas: form.painAreas,
        lastStep: step
      })
    });
  }

  function selectMorningChoice(
    key: "sleep" | "mood" | "sorenessLevel" | "restingHr" | "hrv" | "exertion",
    value: string
  ) {
    const nextForm: MorningForm = { ...morningForm, [key]: value };
    const currentIndex = morningQuestions.findIndex((question) => question.key === key);
    const nextStep = Math.min(morningQuestions.length, currentIndex + 1);
    setMorningForm(nextForm);
    setMorningStep(nextStep);
    void persistMorningProgress(nextForm, nextStep);
  }

  function togglePainArea(areaName: string) {
    const nextForm: MorningForm = {
      ...morningForm,
      painAreas: morningForm.painAreas.includes(areaName)
        ? morningForm.painAreas.filter((x) => x !== areaName)
        : [...morningForm.painAreas, areaName]
    };
    setMorningForm(nextForm);
    void persistMorningProgress(nextForm, morningStep);
  }

  function openMorningUpdate() {
    if (morningDone) {
      const shouldEdit = window.confirm("עדכון בוקר כבר הוזן. לפתוח לעריכה?");
      if (!shouldEdit) {
        showToast("עדכון בוקר כבר הוזן.");
        return;
      }
    }
    setMorningStep(nextMorningStepFromForm(morningForm));
    setShowMorningModal(true);
  }

  async function submitMorningCheckin() {
    const firstMissing = nextMorningStepFromForm(morningForm);
    if (firstMissing < morningQuestions.length) {
      setMorningStep(firstMissing);
      showToast("יש להשלים את כל שאלות הבוקר לפני שמירה.");
      return;
    }

    const res = await fetch("/api/checkin/daily", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...morningForm,
        date: activeDate,
        sleepHoursActual: null,
        hrvActual: null,
        restingHrActual: null
      })
    });

    if (!res.ok) {
      showToast("שמירת צ׳ק-אין נכשלה.");
      return;
    }

    setMorningDone(true);
    writeMorningCheckinCache({ ...morningForm, date: activeDate }, true);
    showToast("צ׳ק-אין בוקר נשמר.");
    setShowMorningModal(false);
    await loadDashboard(activeDate);
  }

  const morningQuestion = morningQuestions[morningStep];
  const morningChoices = useMemo(() => {
    if (!checkinOptions || !morningQuestion) return [];
    return checkinOptions.options[morningQuestion.key];
  }, [checkinOptions, morningQuestion]);
  const selectedMorningChoice = morningQuestion ? (morningForm[morningQuestion.key] as string) : "";

  async function submitWorkoutFeedback() {
    if (!activePendingWorkout) return;
    if (activePendingWorkout.sport === "run" && shoes.length > 0 && !selectedWorkoutShoeId) {
      showToast("בחר נעל לריצה או הוסף נעל ברירת מחדל.");
      return;
    }
    if (activePendingWorkout.sport === "run" && selectedWorkoutShoeId) {
      await fetch("/api/shoes/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workoutId: activePendingWorkout.workoutId,
          shoeId: selectedWorkoutShoeId
        })
      });
    }

    const body =
      activePendingWorkout.sport === "run"
        ? {
            workoutId: activePendingWorkout.workoutId,
            date: activePendingWorkout.startAt.slice(0, 10),
            sport: activePendingWorkout.sport,
            ...runWorkoutForm,
            painArea: runWorkoutForm.painScore >= 2 ? runWorkoutForm.painArea : ""
          }
        : activePendingWorkout.sport === "strength"
          ? {
              workoutId: activePendingWorkout.workoutId,
              date: activePendingWorkout.startAt.slice(0, 10),
              sport: activePendingWorkout.sport,
              ...strengthWorkoutForm,
              strengthPainArea:
                strengthWorkoutForm.strengthPainScore >= 2 ? strengthWorkoutForm.strengthPainArea : ""
            }
        : {
            workoutId: activePendingWorkout.workoutId,
            date: activePendingWorkout.startAt.slice(0, 10),
            sport: activePendingWorkout.sport,
            ...workoutForm
          };

    const res = await fetch("/api/checkin/workout-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      showToast("שמירת משוב נכשלה.");
      return;
    }

    const remaining = pendingFeedback.slice(1);
    setPendingFeedback(remaining);
    setSelectedWorkoutShoeId("");
    setWorkoutForm({ perceivedEffort: "moderate", bodyFeel: "normal", breathingFeel: "steady" });
    setRunWorkoutForm(defaultRunFeedbackValues());
    setStrengthWorkoutForm(defaultStrengthFeedbackValues());
    if (remaining.length === 0) {
      setShowWorkoutModal(false);
      showToast("המשוב נשמר.");
    }
    await loadDashboard(activeDate);
  }

  async function dismissCurrentWorkoutFeedback() {
    if (!activePendingWorkout) return;
    const res = await fetch("/api/checkin/workout-feedback/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workoutId: activePendingWorkout.workoutId })
    });
    if (!res.ok) {
      showToast("ביטול משוב נכשל.");
      return;
    }
    const remaining = pendingFeedback.slice(1);
    setPendingFeedback(remaining);
    setSelectedWorkoutShoeId("");
    if (remaining.length === 0) {
      setShowWorkoutModal(false);
    }
    showToast("המשוב בוטל למסך היומי.");
  }

  async function dismissAllWorkoutFeedback() {
    if (pendingFeedback.length === 0) return;
    await Promise.all(
      pendingFeedback.map((item) =>
        fetch("/api/checkin/workout-feedback/dismiss", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workoutId: item.workoutId })
        })
      )
    );
    setPendingFeedback([]);
    setShowWorkoutModal(false);
    setSelectedWorkoutShoeId("");
    showToast("כל בקשות המשוב בוטלו במסך היומי.");
  }

  async function applyDailyOption(option: ForecastOption) {
    const res = await fetch("/api/dashboard/forecast/choice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: activeDate,
        optionId: option.id,
        option
      })
    });

    if (!res.ok) {
      showToast("שמירת שינוי יומי נכשלה.");
      return;
    }
    setForecastToday((prev) => {
      if (!prev) return prev;
      const existing = prev.options.some((item) => item.id === option.id);
      return {
        ...prev,
        selectedOptionId: option.id,
        options: existing ? prev.options : [option, ...prev.options]
      };
    });
    showToast("ההמלצה היומית עודכנה.");
  }

  function handleSportSelect(sport: ForecastOption["sport"]) {
    const sameSport = selectedSport === sport;
    setSelectedSport(sport);
    setExpandedSport((prev) => (sameSport && prev === sport ? null : sport));
    setSelectionOverride(null);
    setVariantIndex(0);
    if (!forecastToday?.options?.length) return;
    const option = findWorkoutForCombination(forecastToday.options, sport, intensityBuckets, recommendedMode);
    if (!option) return;
    setSelectionOverride(option);
    void applyDailyOption(option);
  }

  function refreshWorkoutVariant() {
    if (!workoutVariants.length) return;
    const nextIndex = (variantIndex + 1) % workoutVariants.length;
    const nextVariant = workoutVariants[nextIndex];
    setVariantIndex(nextIndex);
    void applyDailyOption(nextVariant);
  }


  return (
    <div className="today-page today-page-flow">
      <section className="panel today-panel-row">
        <div className="journal-topbar">
          {/* Row 1: nav + quick actions */}
          <div className="journal-topbar-row1">
            <div className="journal-mobile-inline-nav" aria-label="ניווט יום במובייל">
              <button
                className="choice-btn journal-nav-btn mobile-nav-next"
                onClick={() => setActiveDate((prev) => addDaysISO(prev, 1))}
                title="יום הבא"
              >
                <span className="material-symbols-outlined" aria-hidden>
                  chevron_left
                </span>
              </button>
              <button className="choice-btn icon-compact mobile-nav-sync" onClick={triggerSync} disabled={syncing} title="רענון אימונים">
                <span aria-hidden>↻</span>
              </button>
              <button
                className={
                  morningDone
                    ? "choice-btn icon-compact morning-done mobile-nav-morning"
                    : "choice-btn icon-compact morning-missing mobile-nav-morning"
                }
                onClick={openMorningUpdate}
                title="עדכון בוקר"
              >
                <span aria-hidden>{morningDone ? "✓" : "☀"}</span>
              </button>
              <strong className="journal-date-title journal-date-title-inline">{formatDisplayDate(activeDate)}</strong>
              <button className="choice-btn journal-today-btn mobile-nav-today" onClick={() => setActiveDate(formatISODate())}>
                היום
              </button>
              <button
                className="choice-btn journal-nav-btn mobile-nav-prev"
                onClick={() => setActiveDate((prev) => addDaysISO(prev, -1))}
                title="יום קודם"
              >
                <span className="material-symbols-outlined" aria-hidden>
                  chevron_right
                </span>
              </button>
            </div>
            <div className="journal-nav">
              <button className="choice-btn journal-nav-btn" onClick={() => setActiveDate((prev) => addDaysISO(prev, -1))} title="יום קודם">
                <span className="material-symbols-outlined" aria-hidden>
                  chevron_right
                </span>
              </button>
              <strong className="journal-date-title">{formatDisplayDate(activeDate)}</strong>
              <button className="choice-btn journal-nav-btn" onClick={() => setActiveDate((prev) => addDaysISO(prev, 1))} title="יום הבא">
                <span className="material-symbols-outlined" aria-hidden>
                  chevron_left
                </span>
              </button>
            </div>
            <div className="journal-quick-actions">
              <button className="choice-btn journal-today-btn" onClick={() => setActiveDate(formatISODate())}>
                היום
              </button>
              {isHistoricalDay ? (
                <button
                  className={historicalEditMode ? "choice-btn icon-compact selected" : "choice-btn icon-compact"}
                  onClick={() => setHistoricalEditMode((prev) => !prev)}
                >
                  {historicalEditMode ? "סגור" : "עריכה"}
                </button>
              ) : null}
              <button className="choice-btn icon-compact" onClick={triggerSync} disabled={syncing} title="רענון אימונים">
                <span aria-hidden>↻</span>
              </button>
              <button
                className={morningDone ? "choice-btn icon-compact morning-done" : "choice-btn icon-compact morning-missing"}
                onClick={openMorningUpdate}
                title="עדכון בוקר"
              >
                <span aria-hidden>{morningDone ? "✓" : "☀"}</span>
              </button>
            </div>
          </div>
          {/* Row 2: status */}
          <div className="journal-status-strip">
            <span className="journal-status-pill">{journal?.dayStatus.label ?? "-"}</span>
            <span className={`journal-target-pill ${journal?.nutrition.status.kcal ?? "on_target"}`}>
              קלוריות: {journal?.nutrition.status.kcalLabel ?? "-"}
            </span>
            <span className={`journal-target-pill ${journal?.nutrition.status.protein ?? "on_target"}`}>
              חלבון: {journal?.nutrition.status.proteinLabel ?? "-"}
            </span>
          </div>
          {loadError ? (
            <div className="journal-load-error" role="status" aria-live="polite">
              יש בעיה בטעינת נתונים מהשרת (אונליין). מומלץ לבדוק חיבור Strava בהגדרות.
            </div>
          ) : null}
          {today?.stateLabel ? (
            <div className={`training-state-banner ${today.stateTag ?? "on_the_spot"}`}>
              <strong>{today.stateLabel}</strong>
              {today.stateHint ? <span>{today.stateHint}</span> : null}
            </div>
          ) : null}
          {missingMorningDates.length > 0 ? (
            <div className="journal-missing-morning-alert">
              <span>חסר עדכון בוקר עבור:</span>
              {missingMorningDates.map((date) => (
                <button
                  key={date}
                  type="button"
                  className="journal-missing-date-btn"
                  onClick={() => setActiveDate(date)}
                >
                  {formatDisplayDate(date)}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {/* Water & Food Input Sections at Top */}
      <section className="top-input-section">
        {/* Water Section */}
        <div className="water-input-card">
          <div className="water-input-header">
            <h3>מים</h3>
            <button
              className="water-input-add-btn"
              onClick={quickAddWater}
              disabled={addingWaterIntake}
              title="הוסף 200 מ״ל מים"
            >
              +200 מ״ל
            </button>
          </div>
          <div className="water-input-display">
            <div className="water-input-amount">
              {Math.round((drinksSummary.totalMl / (journal?.nutrition.plan.hydrationMl ?? 2000)) * 100)}%
            </div>
            <div className="water-input-progress">
              <div className="water-input-bar-track">
                <div
                  className="water-input-bar-fill"
                  style={{
                    width: `${Math.min(((drinksSummary.totalMl ?? 0) / (journal?.nutrition.plan.hydrationMl ?? 2000)) * 100, 100)}%`,
                    background: "linear-gradient(90deg, #72dcff 0%, #72dcff 100%)"
                  }}
                />
              </div>
              <span className="water-input-label">
                {drinksSummary.totalMl} / {journal?.nutrition.plan.hydrationMl ?? 2000} מ״ל
              </span>
            </div>
          </div>
        </div>

        {/* Food Section */}
        <div className="food-input-card">
          <div className="food-input-header">
            <h3>אוכל</h3>
          </div>
          <UiSelect
            value=""
            options={todayFoodOptions}
            onChange={(nextValue) => openTodayFoodModal(nextValue)}
            placeholder="חפש או הוסף מזון..."
            searchable
            creatable
            onCreate={openNewIngredientModal}
            maxVisibleOptions={16}
          />
          <div className="food-input-meta">
            <button type="button" className="choice-btn" onClick={openEmptyNewIngredientModal} title="הוסף מזון חדש">
              + חדש
            </button>
            <Link href="/nutrition" className="inline-cta-link subtle-link">
              דף תזונה
            </Link>
          </div>
        </div>
      </section>

      <div className="today-row-scores-workout">
        <div className="today-scores-col">
          {/* Kinetic Lab Bento Grid */}
          <div className="kinetic-bento-grid">
            {/* Hero: Readiness */}
            <div className="kinetic-hero-card">
              <div className="kinetic-hero-text">
                <span className="kinetic-label">מוכנות</span>
                <div className="kinetic-hero-number" style={{color:"#c3ffcd"}}>
                  <span className="kinetic-unit">/100</span>
                  {today?.readinessScore ?? "-"}
                </div>
                <span className="kinetic-sublabel">
                  {(today?.readinessScore ?? 0) >= 70 ? "מצב אופטימלי" : (today?.readinessScore ?? 0) >= 50 ? "מצב בינוני" : "דרוש מנוחה"}
                </span>
              </div>
              <div className="kinetic-ring-wrap">
                <svg width="96" height="96" viewBox="0 0 96 96" style={{transform:"rotate(-90deg)"}}>
                  <circle cx="48" cy="48" r="40" fill="transparent" stroke="#262626" strokeWidth="8"/>
                  <circle
                    cx="48"
                    cy="48"
                    r="40"
                    fill="transparent"
                    stroke="#c3ffcd"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray="251.2"
                    strokeDashoffset={251.2 - (251.2 * Math.min(today?.readinessScore ?? 0, 100) / 100)}
                  />
                  <g style={{transform: "rotate(90deg)", transformOrigin: "48px 48px"}}>
                    <text x="48" y="55" textAnchor="middle" fontSize="24" fill="#c3ffcd" className="material-symbols-outlined" style={{fontVariationSettings: "'FILL' 1"}}>
                      auto_awesome
                    </text>
                  </g>
                </svg>
              </div>
              <div className="kinetic-glow" style={{background:"rgba(195,255,205,0.05)"}}/>
            </div>
            {/* Fatigue */}
            <div className="kinetic-small-card">
              <span className="kinetic-label">עייפות</span>
              <div className="kinetic-small-number" style={{color:"#fd8b00"}}>
                <span className="kinetic-unit-sm" style={{color:"rgba(253,139,0,0.6)"}}>%</span>
                {today?.fatigueScore ?? "-"}
              </div>
              <div className="kinetic-bar-track">
                <div className="kinetic-bar-fill" style={{width:`${Math.min(today?.fatigueScore ?? 0,100)}%`, background:"#fd8b00"}}/>
              </div>
            </div>
            {/* Fitness */}
            <div className="kinetic-small-card">
              <span className="kinetic-label">כושר</span>
              <div className="kinetic-small-number" style={{color:"#72dcff"}}>
                <span className="kinetic-unit-sm" style={{color:"rgba(114,220,255,0.6)"}}>VO2</span>
                {today?.fitnessScore ?? "-"}
              </div>
              <div className="kinetic-bar-track">
                <div className="kinetic-bar-fill" style={{width:`${Math.min(today?.fitnessScore ?? 0,100)}%`, background:"#72dcff"}}/>
              </div>
            </div>
          </div>

        </div>

        <div className="today-activity-side" aria-label="האימון והמלצה">
          {hasWorkoutOnDay && primaryWorkout ? (
            <>
              <div className="today-workouts-desktop-list" aria-label="אימוני היום בדסקטופ">
                {workoutsDisplayData.map((entry, index) => (
                  <article
                    key={entry.workout.id}
                    className={`actual-workout-banner clickable ${index === 0 ? "primary" : "compact-secondary"}`}
                    role="button"
                    tabIndex={0}
                    aria-label="פתח פרטי אימון"
                    onClick={() => router.push(workoutDetailPath(entry.workout.id))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        router.push(workoutDetailPath(entry.workout.id));
                      }
                    }}
                  >
                    <button
                      type="button"
                      className="workout-edit-mini"
                      title="ערוך אימון"
                      aria-label="ערוך אימון"
                      onClick={(event) => {
                        event.stopPropagation();
                        router.push(workoutDetailPath(entry.workout.id));
                      }}
                    >
                      ✎
                    </button>
                    <WorkoutBanner sport={entry.workout.sport} metrics={entry.metrics} runScore={entry.runScore} />
                    <div className="workout-banner-head">
                      <p>
                        האימון שבוצע ביום הזה: {sportLabel(entry.workout.sport)}
                        {index > 0 ? ` · אימון ${index + 1}` : ""}
                      </p>
                    </div>
                    <div className="workout-summary-line">
                      {entry.summaryParts.map((part, idx) => (
                        <span key={`${entry.workout.id}-${part}-${idx}`} className="workout-summary-pill">
                          {part}
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>

              <div className="today-workouts-mobile-carousel-shell" aria-label="אימוני היום במובייל">
                <div
                  className="today-workouts-mobile-carousel"
                  ref={mobileWorkoutCarouselRef}
                  onScroll={handleWorkoutCarouselScroll}
                >
                  {mobileCarouselWorkouts.map((entry, index) => (
                    <article
                      key={`mobile-${entry.workout.id}`}
                      className={`actual-workout-banner clickable mobile ${index === 0 ? "primary" : "compact-secondary"}`}
                      role="button"
                      tabIndex={0}
                      aria-label="פתח פרטי אימון"
                      onClick={() => router.push(workoutDetailPath(entry.workout.id))}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          router.push(workoutDetailPath(entry.workout.id));
                        }
                      }}
                    >
                      <button
                        type="button"
                        className="workout-edit-mini"
                        title="ערוך אימון"
                        aria-label="ערוך אימון"
                        onClick={(event) => {
                          event.stopPropagation();
                          router.push(workoutDetailPath(entry.workout.id));
                        }}
                      >
                        ✎
                      </button>
                      <WorkoutBanner sport={entry.workout.sport} metrics={entry.metrics} runScore={entry.runScore} />
                      <div className="workout-banner-head">
                        <p>
                          האימון שבוצע ביום הזה: {sportLabel(entry.workout.sport)}
                          {index > 0 ? ` · אימון ${index + 1}` : ""}
                        </p>
                      </div>
                      <div className="workout-summary-line">
                        {entry.summaryParts.map((part, idx) => (
                          <span key={`mobile-${entry.workout.id}-${part}-${idx}`} className="workout-summary-pill">
                            {part}
                          </span>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
                <div className="today-workouts-mobile-meta">
                  <div className="today-workouts-mobile-dots" aria-label="מיקום בקרוסלה">
                    {mobileCarouselWorkouts.map((entry, index) => (
                      <i key={`dot-${entry.workout.id}`} className={index === mobileWorkoutIndex ? "active" : ""} />
                    ))}
                  </div>
                  {hiddenMobileWorkouts.length > 0 ? (
                    <button
                      type="button"
                      className="choice-btn small"
                      onClick={() => setShowMobileMoreWorkouts((prev) => !prev)}
                    >
                      {showMobileMoreWorkouts ? "סגור" : `+ עוד ${hiddenMobileWorkouts.length}`}
                    </button>
                  ) : null}
                </div>
                {showMobileMoreWorkouts && hiddenMobileWorkouts.length > 0 ? (
                  <div className="today-workouts-mobile-more-list">
                    {hiddenMobileWorkouts.map((entry, index) => (
                      <Link key={entry.workout.id} href={workoutDetailPath(entry.workout.id)} className="today-workout-mini-link">
                        <strong>{sportLabel(entry.workout.sport)} · אימון {index + 3}</strong>
                        <span>
                          {formatDuration(entry.workout.durationSec)} ·{" "}
                          {getDisplayDistanceKm(entry.workout) != null
                            ? `${formatDistanceKm(getDisplayDistanceKm(entry.workout))} ק״מ`
                            : "ללא מרחק"}
                        </span>
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>

              {!isHistoricalDay && rec?.dayStatus === "can_add_short" && showRecommendationPanel && displayWorkout ? (
                <div className="today-next-session-line" aria-label="המלצה להמשך היום">
                  <span className="today-next-session-label">המשך מומלץ:</span>
                  <span className="today-next-session-value">
                    {displayWorkout.workoutType} · {displayWorkout.durationMin} דק׳ · {displayWorkout.intensityZone ?? "-"}
                  </span>
                  {workoutVariants.length > 1 && !shouldLockRecommendationToDayStatus ? (
                    <button type="button" className="choice-btn icon-compact" onClick={refreshWorkoutVariant} title="רענון">
                      ↻
                    </button>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : showRestHistoricalCard ? (
            <article className="actual-workout-banner rest-day-banner" aria-label="יום מנוחה">
              <div className="workout-banner-head">
                <p>האימון שבוצע ביום הזה</p>
              </div>
              <div className="rest-day-content">
                <span className="rest-day-icon" aria-hidden>
                  🏖️
                </span>
                <strong>יום מנוחה</strong>
              </div>
              <span className="note">לא נרשם אימון ביום הזה.</span>
            </article>
          ) : showRecommendationPanel ? (
            <div className="combo-panel">
              {!shouldLockRecommendationToDayStatus && (
                <div className="combo-row sport-row" role="tablist" aria-label="בחירת ענף">
                  {sportsAvailable.map((sport) => (
                    <button
                      key={sport}
                      type="button"
                      className={`combo-button ${selectedSport === sport ? "selected" : ""}`}
                      onClick={() => handleSportSelect(sport)}
                      aria-expanded={expandedSport === sport}
                    >
                      {sportLabel(sport)}
                    </button>
                  ))}
                </div>
              )}
              <article className="selected-workout-card">
                <div className="selected-workout-card__head">
                  <p className="combo-meta-line">
                    {shouldLockRecommendationToDayStatus
                      ? "המלצה מעודכנת אחרי האימון שבוצע"
                      : `קושי יומי מומלץ: ${intensityLabels[recommendedMode]} · ${sportLabel(selectedSport)}`}
                  </p>
                  <h3>{displayWorkout?.workoutType ?? "ממתין להמלצה אקטיבית"}</h3>
                  <p className="combo-summary">
                    {displayWorkout ? `${displayWorkout.durationMin} דק׳ · ${displayWorkout.intensityZone ?? "-"}` : "המערכת טוענת המלצה"}
                  </p>
                </div>
                {displayWorkout && workoutVariants.length > 1 && !shouldLockRecommendationToDayStatus && (
                  <div className="selected-workout-card__actions">
                    <button type="button" className="choice-btn compact" onClick={refreshWorkoutVariant}>
                      רענון
                    </button>
                    <span className="variant-counter">
                      אפשרות {Math.min(variantIndex + 1, workoutVariants.length)} מתוך {workoutVariants.length}
                    </span>
                  </div>
                )}
                <div className="selected-workout-card__meta">
                  <span>{displayWorkout ? `יעד: ${displayWorkout.target ?? "-"}` : "יעד: -"}</span>
                  <span>{displayWorkout ? `עומס: ${displayWorkout.plannedLoad ?? "-"}` : "-"}</span>
                  {rec && <span className="confidence-pill">ביטחון {Math.round(rec.confidence * 100)}%</span>}
                </div>
                {rec?.dayStatus === "target_done" ? (
                  <p className="note">היעד היומי הושלם. אפשרות מומלצת כרגע: מנוחה או שחרור קצר.</p>
                ) : null}
                {rec?.dayStatus === "can_add_short" ? (
                  <p className="note">האימון הושלם חלקית. אפשר אימון קצר נוסף או מנוחה.</p>
                ) : null}
                {displayWorkout && expandedSport === selectedSport ? (
                  <div className="expand-block workout-details is-open">
                    <ul className="kv compact-kv">
                      <li>ענף: {sportLabel(displayWorkout.sport)}</li>
                      <li>משך: {displayWorkout.durationMin} דק׳</li>
                      <li>עצימות: {displayWorkout.intensityZone ?? "-"}</li>
                      <li>מטרה: {displayWorkout.target ?? "-"}</li>
                      <li>מבנה מלא: {displayWorkout.structure ?? "לא זמין"}</li>
                      <li>למה זה מתאים היום: {displayWorkout.why ?? "-"}</li>
                      <li>דגשים לביצוע: {displayWorkout.notes ?? "-"}</li>
                    </ul>
                  </div>
                ) : null}
              </article>
            </div>
          ) : null}

          {!isHistoricalDay && rec?.dayStatusText ? (
            <div className={`day-status-pill ${rec.dayStatus ?? "more_possible"}`}>{rec.dayStatusText}</div>
          ) : null}
        </div>
      </div>

      <section className="today-surface today-surface-b">
        <div className="today-nutrition-morning-grid">
          <div>
            <MorningTrendCard points={morningTrend} activeDate={activeDate} onEdit={openMorningUpdate} />
          </div>
          <div className="today-food-quick" aria-label="תזונה">
            <div className="today-food-top-row">
              <UiSelect
                value=""
                options={todayFoodOptions}
                onChange={(nextValue) => openTodayFoodModal(nextValue)}
                placeholder="הוספה מהירה: חפש מזון…"
                searchable
                creatable
                onCreate={openNewIngredientModal}
                maxVisibleOptions={16}
              />
            </div>
          </div>

        </div>
      </section>

      {/* Energy battery */}
      <div className="today-row-checkin-energy">
        {journal?.energyBattery ? (
          <section className="energy-battery-card energy-battery-focus">
            <div className="energy-battery-head">
              <strong>Energy Battery</strong>
              <span>{journal.energyBattery.current}/100{journal.energyBattery.isEstimated ? " · הערכה" : ""}</span>
            </div>
            <div className="energy-battery-single">
              <div className={`mini-track ${percentToTone(journal.energyBattery.current)}`}>
                <i style={{ width: `${clampPercent(journal.energyBattery.current)}%` }} />
              </div>
              <div className="energy-battery-points">
                <span>בוקר: {journal.energyBattery.start}</span>
                <span>עכשיו: {journal.energyBattery.current}</span>
                <span>סוף יום: {journal.energyBattery.end}</span>
              </div>
            </div>
            <div className="energy-battery-meta">
              <span>מגמה: {journal.energyBattery.start} → {journal.energyBattery.current} → {journal.energyBattery.end}</span>
              {journal.dailyScore ? <span>ציון יומי: {journal.dailyScore.value} · {journal.dailyScore.label}</span> : null}
            </div>
          </section>
        ) : (
          <section className="energy-battery-card energy-battery-focus">
            <div className="energy-battery-head"><strong>Energy Battery</strong></div>
            <p style={{opacity:0.5, fontSize:"0.85rem"}}>אין נתוני סוללה להיום</p>
          </section>
        )}
      </div>

      <section className="today-surface today-surface-macro">
        <div className="macro-card">
          <div className="macro-card-header">
            <strong className="macro-card-title">תזונה</strong>
            <span className="macro-card-kcal">{journal ? Math.max(0, Math.round((journal.nutrition.target.kcal ?? 2000) - (journal.nutrition.totals.kcal ?? 0))) : 2000} קלוריות נותרו</span>
          </div>
          {topNutritionTargets.map((row) => (
            <div key={row.key} className="macro-row">
              <span className="macro-row-label">{row.label}</span>
              <span className="macro-row-values">{row.actualLabel} / {row.targetLabel}</span>
              <div className="macro-row-track" data-key={row.key}>
                <div className="macro-row-fill" style={{ width: `${row.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="today-surface today-surface-c">
      <Section title="מאמן בקצרה" subtitle="תקציר יומי ממוקד">
        <div className="coach-compact">
          <p className="coach-compact-text">
            {coachAgent?.dailyNarrative ?? "Rebuild Coach יוסיף כאן תקציר יומי כשהנתונים יתעדכנו."}
          </p>
          <div className="coach-compact-grid">
            <div>
              <strong>גורם מרכזי</strong>
              <p>{coachAgent?.reasoning?.[0] ?? "הסוכן בודק עומס, בוקר ומשוב."}</p>
            </div>
            <div>
              <strong>התאמה להמשך</strong>
              <p>{coachAgent?.adjustments?.[0] ?? "אין התאמה מיוחדת כרגע."}</p>
            </div>
          </div>
          {today?.alerts?.[0] ? <p className="note">התראה: {today.alerts[0]}</p> : null}
          <div className="row">
            <Link href="/insights" className="inline-cta-link subtle-link">
              מעבר לתובנות
            </Link>
          </div>
        </div>
      </Section>
      </section>

      {newIngredientModalOpen && newIngredientDraft ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h3>הוספת מזון חדש לקטלוג</h3>
            <p className="note">ננסה להציע מאקרו אוטומטית. אם לא בטוח, אפשר לערוך ידנית.</p>

            <div className="journal-form-grid">
              <label className="field">
                שם
                <input
                  value={newIngredientDraft.name}
                  onChange={(event) => setNewIngredientDraft((prev) => (prev ? { ...prev, name: event.target.value } : prev))}
                  placeholder="שם המזון"
                />
              </label>
              <label className="field">
                קטגוריה
                <UiSelect
                  value={newIngredientDraft.category}
                  onChange={(nextValue) =>
                    setNewIngredientDraft((prev) => (prev ? { ...prev, category: nextValue as any } : prev))
                  }
                  options={nutritionCategoryOptions}
                />
              </label>
            </div>

            <div className="journal-form-grid">
              <label className="field">
                קק״ל ל-100
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={newIngredientDraft.kcalPer100}
                  onChange={(event) =>
                    setNewIngredientDraft((prev) =>
                      prev ? { ...prev, kcalPer100: Math.max(0, Number(event.target.value) || 0) } : prev
                    )
                  }
                />
              </label>
              <label className="field">
                חלבון ל-100 (ג׳)
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={newIngredientDraft.proteinPer100}
                  onChange={(event) =>
                    setNewIngredientDraft((prev) =>
                      prev ? { ...prev, proteinPer100: Math.max(0, Number(event.target.value) || 0) } : prev
                    )
                  }
                />
              </label>
              <label className="field">
                פחמימה ל-100 (ג׳)
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={newIngredientDraft.carbsPer100}
                  onChange={(event) =>
                    setNewIngredientDraft((prev) =>
                      prev ? { ...prev, carbsPer100: Math.max(0, Number(event.target.value) || 0) } : prev
                    )
                  }
                />
              </label>
              <label className="field">
                שומן ל-100 (ג׳)
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={newIngredientDraft.fatPer100}
                  onChange={(event) =>
                    setNewIngredientDraft((prev) =>
                      prev ? { ...prev, fatPer100: Math.max(0, Number(event.target.value) || 0) } : prev
                    )
                  }
                />
              </label>
            </div>

            <div className="journal-form-grid">
              <label className="field">
                יחידת ברירת מחדל
                <UiSelect
                  value={newIngredientDraft.defaultUnit}
                  onChange={(nextValue) =>
                    setNewIngredientDraft((prev) => (prev ? { ...prev, defaultUnit: nextValue as any } : prev))
                  }
                  options={[
                    { value: "g", label: "גרם" },
                    { value: "ml", label: "מ״ל" },
                    { value: "unit", label: "יח׳" }
                  ]}
                />
              </label>
              <label className="field">
                גרם ליחידה
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={newIngredientDraft.gramsPerUnit}
                  onChange={(event) =>
                    setNewIngredientDraft((prev) =>
                      prev ? { ...prev, gramsPerUnit: Math.max(0.1, Number(event.target.value) || 0.1) } : prev
                    )
                  }
                />
              </label>
            </div>

            <div className="row modal-actions">
              <button
                type="button"
                className="choice-btn"
                onClick={async () => {
                  const name = newIngredientDraft.name.trim();
                  if (name.length < 2) {
                    showToast("צריך לפחות 2 תווים לשם המזון.");
                    return;
                  }
                  const suggestion = await suggestNewIngredient(name);
                  if (!suggestion) {
                    showToast("לא נמצאה הצעה אוטומטית. אפשר להזין ידנית.");
                    return;
                  }
                  setNewIngredientDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          name: String((suggestion as any).name ?? prev.name),
                          category: ((suggestion as any).category ?? prev.category) as any,
                          kcalPer100: Number((suggestion as any).kcalPer100 ?? prev.kcalPer100),
                          proteinPer100: Number((suggestion as any).proteinPer100 ?? prev.proteinPer100),
                          carbsPer100: Number((suggestion as any).carbsPer100 ?? prev.carbsPer100),
                          fatPer100: Number((suggestion as any).fatPer100 ?? prev.fatPer100),
                          defaultUnit: ((suggestion as any).defaultUnit ?? prev.defaultUnit) as any,
                          gramsPerUnit: Number((suggestion as any).gramsPerUnit ?? prev.gramsPerUnit)
                        }
                      : prev
                  );
                  showToast("עודכן לפי הצעה אוטומטית.");
                }}
                disabled={newIngredientSuggesting}
                title="חיפוש מאקרו אוטומטי"
              >
                {newIngredientSuggesting ? "מחפש..." : "חיפוש אוטומטי"}
              </button>
              <button
                type="button"
                className="choice-btn"
                onClick={() => {
                  setNewIngredientModalOpen(false);
                  setNewIngredientDraft(null);
                }}
              >
                סגור
              </button>
              <button type="button" onClick={saveNewIngredient} disabled={newIngredientSaving}>
                {newIngredientSaving ? "שומר..." : "הוסף לקטלוג"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {todayFoodModalOpen && todayFoodSelected ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h3>הוספת מזון מהירה</h3>
            <p className="note">{todayFoodSelected.label}</p>

            <div className="journal-form-grid">
              <label className="field">
                יעד הוספה
                {todayFoodIsDrink ? (
                  <div className="today-food-unit-chip">שתייה</div>
                ) : (
                  <UiSelect
                    value={todayFoodSlot}
                    onChange={(nextValue) => setTodayFoodSlot(nextValue as MealSlot)}
                    options={todayFoodSlotSelectOptions}
                  />
                )}
              </label>
              <label className="field">
                יחידה
                {todayFoodSelected.kind === "ingredient" ? (
                  <UiSelect
                    value={todayFoodUnit}
                    onChange={(nextValue) => {
                      const u = nextValue as NutritionUnit;
                      setTodayFoodUnit(u);
                      // Reset quantity to a sensible default for the new unit
                      setTodayFoodQuantity(u === "g" || u === "ml" ? 100 : 1);
                    }}
                    options={todayFoodUnitOptions}
                  />
                ) : (
                  <div className="today-food-unit-chip">{nutritionUnitLabel(todayFoodUnit)}</div>
                )}
              </label>
              <label className="field" style={{ gridColumn: "1 / -1" }}>
                כמות
                <div className="qty-stepper">
                  <button
                    type="button"
                    className="qty-stepper-btn"
                    onClick={() => {
                      const step = todayFoodUnit === "g" || todayFoodUnit === "ml" ? 25 : 0.5;
                      setTodayFoodQuantity((prev) => Math.max(step, Math.round((prev - step) * 10) / 10));
                    }}
                    aria-label="הורד כמות"
                  >−</button>
                  <input
                    type="number"
                    className="qty-stepper-input"
                    min={todayFoodUnit === "g" || todayFoodUnit === "ml" ? 25 : 0.5}
                    step={todayFoodUnit === "g" || todayFoodUnit === "ml" ? 25 : 0.5}
                    value={todayFoodQuantity}
                    onChange={(event) => {
                      const min = todayFoodUnit === "g" || todayFoodUnit === "ml" ? 25 : 0.5;
                      setTodayFoodQuantity(Math.max(min, Number(event.target.value) || min));
                    }}
                  />
                  <button
                    type="button"
                    className="qty-stepper-btn"
                    onClick={() => {
                      const step = todayFoodUnit === "g" || todayFoodUnit === "ml" ? 25 : 0.5;
                      setTodayFoodQuantity((prev) => Math.round((prev + step) * 10) / 10);
                    }}
                    aria-label="הוסף כמות"
                  >+</button>
                </div>
              </label>
            </div>

            <div className="today-food-modal-summary">
              <p className="note">
                יתווסף ל-{mealSlotLabel(todayFoodEffectiveSlot)} · {todayFoodQuantity} {nutritionUnitLabel(todayFoodUnit)}
              </p>
              {todayFoodMacroPreview ? (
                <p className="today-food-macro">
                  {todayFoodMacroPreview.kcal} קק״ל · חלבון {todayFoodMacroPreview.proteinG}ג׳ · שומן {todayFoodMacroPreview.fatG}ג׳
                </p>
              ) : null}
            </div>

            <div className="row modal-actions">
              <button
                className="choice-btn"
                onClick={() => {
                  setTodayFoodModalOpen(false);
                  setTodayFoodSelected(null);
                  setTodayFoodQuery("");
                }}
              >
                ביטול
              </button>
              <button onClick={addTodayFood} disabled={addingTodayFood}>
                {addingTodayFood ? "מוסיף..." : "הוסף מזון"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showMorningModal && checkinOptions && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h3>צ׳ק-אין בוקר · {formatDisplayDate(activeDate)}</h3>
            <p className="note">פעם ביום, לפני אימון. מתמקד בתחושה בבוקר.</p>
            <p className="modal-step">{morningStep + 1} / {morningQuestions.length + 1}</p>

            {morningStep < morningQuestions.length ? (
              <>
                <p className="modal-question">{morningQuestion.title}</p>
                <div className="choice-row">
                  {morningChoices.map((choice) => (
                    <button
                      key={choice.id}
                      type="button"
                      className={selectedMorningChoice === choice.id ? "choice-btn selected" : "choice-btn"}
                      onClick={() => selectMorningChoice(morningQuestion.key, choice.id)}
                    >
                      {choice.label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="modal-question">יש אזור כאב נקודתי הבוקר?</p>
                <div className="choice-row">
                  {checkinOptions.painAreas.map((area) => (
                    <button
                      key={area.id}
                      type="button"
                      className={morningForm.painAreas.includes(area.name) ? "choice-btn selected" : "choice-btn"}
                      onClick={() => togglePainArea(area.name)}
                    >
                      {area.name}
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="row modal-actions">
              <button
                className="choice-btn"
                onClick={() => {
                  void persistMorningProgress(morningForm, morningStep);
                  setShowMorningModal(false);
                }}
              >
                סגור
              </button>
              {morningStep > 0 && (
                <button
                  className="choice-btn"
                  onClick={() => {
                    const nextStep = Math.max(0, morningStep - 1);
                    setMorningStep(nextStep);
                    void persistMorningProgress(morningForm, nextStep);
                  }}
                >
                  חזרה
                </button>
              )}
              {morningStep < morningQuestions.length ? (
                <span className="note">בחירה בתשובה מעבירה אוטומטית לשאלה הבאה.</span>
              ) : (
                <button onClick={submitMorningCheckin}>שמור צ׳ק-אין בוקר</button>
              )}
            </div>
          </div>
        </div>
      )}

      {showWorkoutModal && activePendingWorkout && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h3>משוב אחרי אימון</h3>
            <p className="note">
              {sportLabel(activePendingWorkout.sport)} · {activePendingWorkout.distanceM ? `${(activePendingWorkout.distanceM / 1000).toFixed(1)} ק"מ` : "-"} ·{" "}
              {formatDuration(activePendingWorkout.durationSec)}
            </p>
            {isRunFeedback ? (
              <>
                <p className="modal-question">עם איזו נעל רצת?</p>
                {shoes.length > 0 ? (
                  <div className="field">
                    בחירת נעל
                    <UiSelect
                      value={selectedWorkoutShoeId}
                      onChange={(nextValue) => setSelectedWorkoutShoeId(nextValue)}
                      options={shoes.map((shoe) => ({
                        value: shoe.id,
                        label: `${shoe.name} · ${shoe.brand}${shoe.isDefault ? " (ברירת מחדל)" : ""}`
                      }))}
                    />
                    {selectedWorkoutShoe && selectedWorkoutShoe.targetKm ? (
                      <div className="shoe-usage-mini">
                        <span
                          className="shoe-usage-pie"
                          style={{
                            background: `conic-gradient(#3a9f6d 0 ${selectedShoeProgress}%, #d9e4df ${selectedShoeProgress}% 100%)`
                          }}
                          aria-hidden
                        />
                        <small>
                          {Number(selectedWorkoutShoe.totalKm ?? 0).toFixed(1)} / {Number(selectedWorkoutShoe.targetKm).toFixed(0)} ק״מ
                        </small>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="note">לא הוגדרה נעל במערכת. אפשר להמשיך בלי שיוך או להוסיף נעל בהגדרות.</p>
                )}
                <RunFeedbackForm
                  value={runWorkoutForm}
                  onChange={setRunWorkoutForm}
                  painAreas={(checkinOptions?.painAreas ?? []).map((area) => area.name)}
                  compact
                />
              </>
            ) : isStrengthFeedback ? (
              <StrengthFeedbackForm
                value={strengthWorkoutForm}
                onChange={setStrengthWorkoutForm}
                painAreas={(checkinOptions?.painAreas ?? []).map((area) => area.name)}
                compact
              />
            ) : (
              <>
                <p className="modal-question">איך הייתה תחושת המאמץ באימון?</p>
                <div className="choice-row">
                  {[
                    { id: "easy", label: "קל" },
                    { id: "moderate", label: "בינוני" },
                    { id: "hard", label: "קשה" },
                    { id: "max", label: "מקסימלי" }
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className={workoutForm.perceivedEffort === opt.id ? "choice-btn selected" : "choice-btn"}
                      onClick={() => setWorkoutForm((prev) => ({ ...prev, perceivedEffort: opt.id as typeof prev.perceivedEffort }))}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <p className="modal-question">איך הרגליים/השרירים אחרי האימון?</p>
                <div className="choice-row">
                  {[
                    { id: "fresh", label: "רענן" },
                    { id: "normal", label: "רגיל" },
                    { id: "heavy", label: "כבד" },
                    { id: "pain", label: "כאב" }
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className={workoutForm.bodyFeel === opt.id ? "choice-btn selected" : "choice-btn"}
                      onClick={() => setWorkoutForm((prev) => ({ ...prev, bodyFeel: opt.id as typeof prev.bodyFeel }))}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <p className="modal-question">איך הייתה תחושת הנשימה?</p>
                <div className="choice-row">
                  {[
                    { id: "easy", label: "נוחה" },
                    { id: "steady", label: "יציבה" },
                    { id: "hard", label: "מאומצת" }
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className={workoutForm.breathingFeel === opt.id ? "choice-btn selected" : "choice-btn"}
                      onClick={() => setWorkoutForm((prev) => ({ ...prev, breathingFeel: opt.id as typeof prev.breathingFeel }))}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="row modal-actions">
              <button className="choice-btn" onClick={() => setShowWorkoutModal(false)}>סגור</button>
              <button className="choice-btn" onClick={dismissCurrentWorkoutFeedback}>בטל משוב לאימון הזה</button>
              <button className="choice-btn" onClick={dismissAllWorkoutFeedback}>בטל הכל</button>
              <button onClick={submitWorkoutFeedback}>שמור משוב</button>
            </div>
          </div>
        </div>
      )}

      {!!toast && <div className="toast-msg">{toast}</div>}
    </div>
  );
}
