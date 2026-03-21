"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import FeedbackInline from "@/components/workout-feedback-inline";
import UiSelect from "@/components/ui-select";
import { Section } from "@/components/cards";
import { formatDisplayDateTime } from "@/lib/date";
import { workoutDetailPath } from "@/lib/url";
import { nutritionQuantityToGrams, nutritionUnitLabel, nutritionUnitOptions } from "@/lib/nutrition-units";
import type { MealSlot, NutritionIngredient, NutritionMeal, NutritionUnit } from "@/lib/types";

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

type Recovery = {
  date: string;
  rpe?: number | null;
  sleepHours?: number | null;
  sleepQuality?: number | null;
  hrv?: number | null;
  restingHr?: number | null;
  mood?: number | null;
  sorenessGlobal?: number | null;
  sorenessByArea?: string | null;
};

type WorkoutItem = {
  id: string;
  sport: "run" | "bike" | "swim" | "strength";
  startAt: string;
  durationSec: number;
  durationForPaceSec?: number | null;
  movingDurationSec?: number | null;
  pauseDurationSec?: number | null;
  distanceM: number | null;
  distanceRawKm?: number | null;
  distanceOfficialKm?: number | null;
  distanceDisplayKm?: number | null;
  paceDisplayMinPerKm?: number | null;
  avgHr: number | null;
  elevationM: number | null;
  tssLike: number;
  shoeId: string | null;
  shoeName: string | null;
};

type WorkoutFeedback = {
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
  openNote?: string | null;
  fuelingSource?: string | null;
  fuelingQuantity?: number | null;
};

type MorningMetricBar = {
  field: keyof CheckinOptions["options"];
  label: string;
  value: number;
  icon: string;
  color: string;
  choiceLabel: string;
  score10: number;
  actualLabel?: string;
};

type NutritionSlotSuggestion = {
  id: string;
  slot: MealSlot;
  favoriteId: string;
  ingredientId: string;
  name: string;
  quantity: number;
  unit: NutritionUnit;
  reason: string;
  macros: {
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  };
};

export type DayJournalBundle = {
  date: string;
  scores?: {
    readinessScore: number;
    fatigueScore: number;
    fitnessScore: number;
  };
  recovery: Recovery | null;
  nutrition: {
    plan: {
      hydrationMl: number;
      preWorkoutNote: string;
      postWorkoutNote: string;
    };
    meals: NutritionMeal[];
    totals: {
      kcal: number;
      proteinG: number;
      carbsG: number;
      fatG: number;
    };
    suggestedBySlot?: Partial<Record<MealSlot, NutritionSlotSuggestion[]>>;
    target: {
      kcal: number;
      proteinG: number;
      carbsG: number;
      fatG: number;
    };
    deltaToTarget: {
      kcal: number;
      proteinG: number;
      carbsG: number;
      fatG: number;
    };
    status: {
      kcal: "under" | "on_target" | "over";
      protein: "under" | "on_target" | "over";
      kcalLabel: string;
      proteinLabel: string;
    };
  };
  workouts: WorkoutItem[];
  workoutFeedback: WorkoutFeedback[];
  dayStatus: {
    label: string;
    hasWorkout: boolean;
  };
  energyBattery?: {
    start: number;
    current: number;
    end: number;
    isEstimated: boolean;
  };
  dailyScore?: {
    value: number;
    label: string;
    confidence: number;
    partial: boolean;
    breakdown: Array<{
      key: string;
      label: string;
      score: number | null;
      weight: number;
      used: boolean;
    }>;
  };
};

type MealEditRow = {
  ingredientId: string;
  quantity: number;
  unit: NutritionUnit;
};

type PantryRow = {
  ingredientId: string;
  quantity: number;
  unit: NutritionUnit;
};

type NewIngredientDraft = {
  freeText: string;
  name: string;
  category: NutritionIngredient["category"];
  kcalPer100: string;
  proteinPer100: string;
  carbsPer100: string;
  fatPer100: string;
  defaultUnit: NutritionUnit;
  gramsPerUnit: string;
};

type NutritionFavoriteOption = {
  id: string;
  name: string;
  description: string;
  preferredSlot?: MealSlot | null;
};

type UndoMealSnapshot = {
  id: string;
  accepted?: boolean | null;
  items: Array<{
    ingredientId: string;
    quantity: number;
    unit: NutritionUnit;
  }>;
};

const labels = {
  exertion: "תחושת מאמץ כללית",
  sleep: "איך הייתה השינה",
  hrv: "סטטוס HRV",
  restingHr: "דופק מנוחה",
  mood: "מצב רוח",
  sorenessLevel: "רמת כאב שרירים"
} as const;

const ingredientCategoryLabels: Record<NutritionIngredient["category"], string> = {
  protein: "חלבון",
  carb: "פחמימה",
  fat: "שומן",
  sweet: "מתוקים",
  vegetable: "ירק",
  fruit: "פרי",
  dairy: "חלבי",
  hydration: "נוזלים",
  mixed: "מעורב"
};

const ingredientCategoryOrder: Record<NutritionIngredient["category"], number> = {
  dairy: 1,
  protein: 2,
  carb: 3,
  sweet: 4,
  vegetable: 5,
  fruit: 6,
  fat: 7,
  hydration: 8,
  mixed: 9
};

const emptyIngredientDraft = (): NewIngredientDraft => ({
  freeText: "",
  name: "",
  category: "mixed",
  kcalPer100: "",
  proteinPer100: "",
  carbsPer100: "",
  fatPer100: "",
  defaultUnit: "g",
  gramsPerUnit: "100"
});

const mealSlotButtons: Array<{ slot: MealSlot; label: string }> = [
  { slot: "breakfast", label: "א. בוקר" },
  { slot: "lunch", label: "א. צהריים" },
  { slot: "dinner", label: "א. ערב" },
  { slot: "snack", label: "נשנוש" },
  { slot: "pre_run", label: "מזון לפני ריצה" }
];

function sportLabel(sport: WorkoutItem["sport"]) {
  if (sport === "run") return "ריצה";
  if (sport === "bike") return "אופניים";
  if (sport === "strength") return "כוח";
  return "שחייה";
}

function formatDuration(sec: number) {
  const min = Math.round(sec / 60);
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}` : `${m} דק'`;
}

function formatDistance(workout: WorkoutItem) {
  const displayKm =
    workout.distanceDisplayKm ??
    (workout.distanceM != null && Number.isFinite(workout.distanceM)
      ? workout.distanceM / 1000
      : null);
  if (displayKm == null || !Number.isFinite(displayKm)) return "-";
  const rounded = Math.round(displayKm * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(2)} ק"מ`;
}

function workoutDurationLine(workout: WorkoutItem) {
  if (workout.sport === "run" && workout.movingDurationSec != null && workout.movingDurationSec > 0) {
    const delta = Math.abs(workout.durationSec - workout.movingDurationSec);
    if (delta >= 60) {
      return `ריצה ${formatDuration(workout.movingDurationSec)} · אימון ${formatDuration(workout.durationSec)}`;
    }
    return formatDuration(workout.movingDurationSec);
  }
  return formatDuration(workout.durationSec);
}

function roundValue(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function mealSlotLabel(slot: MealSlot) {
  if (slot === "drinks") return "שתייה";
  const found = mealSlotButtons.find((item) => item.slot === slot);
  return found?.label ?? slot;
}

function suggestionQuantityLabel(quantity: number, unit: NutritionUnit) {
  const rounded = unit === "unit" ? roundValue(quantity, 0) : roundValue(quantity, 1);
  const quantityLabel = Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
  return `${quantityLabel} ${nutritionUnitLabel(unit)}`;
}

function quickValueToIngredientId(value: string) {
  if (!value.startsWith("ingredient:")) return null;
  const ingredientId = value.slice("ingredient:".length).trim();
  return ingredientId || null;
}

function looksLikeDrinkName(name: string) {
  const normalized = name.trim().toLowerCase();
  return /מים|קפה|תה|אספרסו|משקה|drink|coffee|tea|water/.test(normalized);
}

function toChoiceIdFromRecovery(field: keyof CheckinOptions["options"], value: number | null | undefined) {
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

function sleepChoiceFromRecovery(recovery: Recovery | null | undefined) {
  const quality = recovery?.sleepQuality;
  if (quality != null) {
    if (quality <= 1.5) return "poor";
    if (quality <= 3.5) return "ok";
    if (quality <= 4.5) return "good";
    return "great";
  }
  return toChoiceIdFromRecovery("sleep", recovery?.sleepHours) ?? "good";
}

function normalizeMorningMetric(field: keyof CheckinOptions["options"], id: string) {
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

function morningMetricIcon(field: keyof CheckinOptions["options"]) {
  if (field === "sleep") return "☾";
  if (field === "mood") return "◔";
  if (field === "sorenessLevel") return "◉";
  if (field === "restingHr") return "♥";
  if (field === "hrv") return "∿";
  if (field === "exertion") return "⚑";
  return "•";
}

function morningMetricColor(value: number) {
  const clamped = Math.max(0, Math.min(100, value));
  const hue = Math.round((clamped / 100) * 120);
  return `hsl(${hue} 62% 44%)`;
}

function morningScore10(value: number) {
  const clamped = Math.max(0, Math.min(100, value));
  return Math.max(1, Math.min(10, Math.round(clamped / 10)));
}

export function DayJournalGrid({
  date,
  journal,
  onRefresh,
  hideWorkouts = false,
  hideFeedback = false,
  hideMorning = false,
  nutritionSummaryOnly = false,
  readOnly = false
}: {
  date: string;
  journal: DayJournalBundle | null;
  onRefresh: () => Promise<void> | void;
  hideWorkouts?: boolean;
  hideFeedback?: boolean;
  hideMorning?: boolean;
  nutritionSummaryOnly?: boolean;
  readOnly?: boolean;
}) {
  const [checkinOptions, setCheckinOptions] = useState<CheckinOptions | null>(null);
  const [nutritionIngredients, setNutritionIngredients] = useState<NutritionIngredient[]>([]);
  const [pantryRows, setPantryRows] = useState<PantryRow[]>([]);
  const [mealEditors, setMealEditors] = useState<Record<string, MealEditRow[]>>({});
  const [mealEditorOpenId, setMealEditorOpenId] = useState<string | null>(null);
  const [mealEditorFocusIndex, setMealEditorFocusIndex] = useState<number | null>(null);
  const [savingMealId, setSavingMealId] = useState<string | null>(null);
  const [checkinEditing, setCheckinEditing] = useState(false);
  const [morningSummaryOpen, setMorningSummaryOpen] = useState(false);
  const [savingCheckin, setSavingCheckin] = useState(false);
  const [savingPantry, setSavingPantry] = useState(false);
  const [savingIngredient, setSavingIngredient] = useState(false);
  const [suggestingIngredient, setSuggestingIngredient] = useState(false);
  const [creatingMealSlot, setCreatingMealSlot] = useState<MealSlot | null>(null);
  const [status, setStatus] = useState("");
  const [showPantry, setShowPantry] = useState(false);
  const [favorites, setFavorites] = useState<NutritionFavoriteOption[]>([]);
  const [ingredientFavoriteIds, setIngredientFavoriteIds] = useState<string[]>([]);
  const [addingFavorite, setAddingFavorite] = useState(false);
  const [quickAddValue, setQuickAddValue] = useState("");
  const [quickAddQuantity, setQuickAddQuantity] = useState(1);
  const [quickAddUnit, setQuickAddUnit] = useState<NutritionUnit>("unit");
  const [showNewIngredient, setShowNewIngredient] = useState(false);
  const [newIngredient, setNewIngredient] = useState<NewIngredientDraft>(emptyIngredientDraft);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoActionRef = useRef<null | (() => Promise<void>)>(null);
  const [toast, setToast] = useState<{ message: string; canUndo: boolean } | null>(null);
  const [checkinForm, setCheckinForm] = useState({
    date,
    exertion: "moderate",
    sleep: "good",
    hrv: "normal",
    restingHr: "normal",
    mood: "good",
    sorenessLevel: "light",
    painAreas: [] as string[],
    sleepHoursActual: "" as string,
    hrvActual: "" as string,
    restingHrActual: "" as string
  });

  useEffect(() => {
    void loadSideData(date);
    setMorningSummaryOpen(false);
  }, [date]);

  useEffect(() => {
    if (!readOnly && !nutritionSummaryOnly) return;
    setCheckinEditing(false);
    setShowPantry(false);
    setMealEditors({});
    setMealEditorOpenId(null);
    setMealEditorFocusIndex(null);
    setShowNewIngredient(false);
  }, [readOnly, nutritionSummaryOnly]);

  useEffect(() => {
    if (!mealEditorOpenId || !journal) return;
    setMealEditors((prev) => {
      const existing = prev[mealEditorOpenId];
      if (existing && existing.length > 0) return prev;
      const meal = journal.nutrition.meals.find((item) => item.id === mealEditorOpenId);
      if (!meal) return prev;
      const hydratedRows = meal.items.map((item) => ({
        ingredientId: item.ingredientId,
        quantity: item.quantity,
        unit: item.unit
      }));
      return {
        ...prev,
        [mealEditorOpenId]:
          hydratedRows.length > 0 ? hydratedRows : [{ ingredientId: "", quantity: 1, unit: "unit" as NutritionUnit }]
      };
    });
    setMealEditorFocusIndex(null);
  }, [mealEditorOpenId, journal]);

  useEffect(() => {
    if (!checkinOptions || !journal) return;
    hydrateCheckin(journal, checkinOptions, date);
  }, [journal, checkinOptions, date]);

  async function loadSideData(nextDate: string) {
    const [optionsRes, pantryRes, favoritesRes] = await Promise.all([
      fetch("/api/checkin/options").then((res) => res.json()),
      fetch(`/api/nutrition/pantry?date=${nextDate}`).then((res) => res.json()),
      fetch("/api/nutrition/favorites").then((res) => res.json()).catch(() => ({ favorites: [] }))
    ]);

    const options = optionsRes as CheckinOptions;
    setCheckinOptions(options);
    setNutritionIngredients(((pantryRes as { ingredients?: NutritionIngredient[] }).ingredients ?? []) as NutritionIngredient[]);
    setPantryRows(
      ((((pantryRes as { items?: Array<{ ingredientId: string; quantity: number; unit: NutritionUnit }> }).items ?? []) as Array<{
        ingredientId: string;
        quantity: number;
        unit: NutritionUnit;
      }>)).map((item) => ({
        ingredientId: item.ingredientId,
        quantity: Number(item.quantity),
        unit: item.unit
      }))
    );
    const favoriteItems = ((favoritesRes as { favorites?: NutritionFavoriteOption[] }).favorites ?? []) as NutritionFavoriteOption[];
    const favoriteIngredientIds = ((favoritesRes as { ingredientFavoriteIds?: string[] }).ingredientFavoriteIds ?? []) as string[];
    setFavorites(favoriteItems);
    setIngredientFavoriteIds(favoriteIngredientIds);
  }

  function hydrateCheckin(bundle: DayJournalBundle, options: CheckinOptions, nextDate: string) {
    void options;
    let parsedAreas: string[] = [];
    if (bundle.recovery?.sorenessByArea) {
      try {
        const areas = JSON.parse(bundle.recovery.sorenessByArea) as string[];
        if (Array.isArray(areas)) parsedAreas = areas;
      } catch {
        parsedAreas = [];
      }
    }
    setCheckinForm({
      date: nextDate,
      exertion: toChoiceIdFromRecovery("exertion", bundle.recovery?.rpe) ?? "moderate",
      sleep: sleepChoiceFromRecovery(bundle.recovery),
      hrv: toChoiceIdFromRecovery("hrv", bundle.recovery?.hrv) ?? "normal",
      restingHr: toChoiceIdFromRecovery("restingHr", bundle.recovery?.restingHr) ?? "normal",
      mood: toChoiceIdFromRecovery("mood", bundle.recovery?.mood) ?? "good",
      sorenessLevel: toChoiceIdFromRecovery("sorenessLevel", bundle.recovery?.sorenessGlobal) ?? "light",
      painAreas: parsedAreas,
      sleepHoursActual: bundle.recovery?.sleepHours != null ? String(bundle.recovery.sleepHours) : "",
      hrvActual: bundle.recovery?.hrv != null ? String(bundle.recovery.hrv) : "",
      restingHrActual: bundle.recovery?.restingHr != null ? String(bundle.recovery.restingHr) : ""
    });
    setCheckinEditing(false);
  }

  function showStatus(message: string) {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    setStatus(message);
    statusTimerRef.current = setTimeout(() => {
      setStatus("");
      statusTimerRef.current = null;
    }, 2800);
  }

  function showToast(message: string, undo?: () => Promise<void>) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    undoActionRef.current = undo ?? null;
    setToast({ message, canUndo: Boolean(undo) });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      undoActionRef.current = null;
      toastTimerRef.current = null;
    }, 4500);
  }

  async function undoLastAction() {
    const action = undoActionRef.current;
    if (!action) return;
    try {
      await action();
      showStatus("הפעולה בוטלה.");
    } finally {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
      undoActionRef.current = null;
      setToast(null);
    }
  }

  useEffect(
    () => () => {
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    []
  );

  const ingredientMap = useMemo(
    () => new Map(nutritionIngredients.map((ingredient) => [ingredient.id, ingredient])),
    [nutritionIngredients]
  );
  const ingredientFavoriteIdSet = useMemo(() => new Set(ingredientFavoriteIds), [ingredientFavoriteIds]);

  const sortedIngredients = useMemo(
    () =>
      [...nutritionIngredients].sort((a, b) => {
        const byCategory = ingredientCategoryOrder[a.category] - ingredientCategoryOrder[b.category];
        if (byCategory !== 0) return byCategory;
        return a.name.localeCompare(b.name, "he");
      }),
    [nutritionIngredients]
  );
  const ingredientSelectOptions = useMemo(
    () =>
      sortedIngredients.map((ingredient) => ({
        value: ingredient.id,
        label: ingredientOptionLabel(ingredient.id)
      })),
    [sortedIngredients]
  );
  const quickAddOptions = useMemo(() => {
    const favoriteOptions = favorites.map((favorite) => ({
      value: favorite.id,
      label: `★ ${favorite.name}`
    }));
    const seenFavoriteIngredient = new Set(
      favorites
        .filter((favorite) => favorite.id.startsWith("ingredient:"))
        .map((favorite) => favorite.id.slice("ingredient:".length))
    );
    const allIngredientOptions = sortedIngredients
      .filter((ingredient) => !seenFavoriteIngredient.has(ingredient.id))
      .map((ingredient) => ({
        value: `ingredient:${ingredient.id}`,
        label: ingredient.name
      }));
    return [...favoriteOptions, ...allIngredientOptions];
  }, [favorites, sortedIngredients]);
  const quickAddIngredientId = useMemo(() => quickValueToIngredientId(quickAddValue), [quickAddValue]);
  const quickAddIngredient = useMemo(
    () => (quickAddIngredientId ? ingredientMap.get(quickAddIngredientId) ?? null : null),
    [ingredientMap, quickAddIngredientId]
  );
  const quickAddMacroPreview = useMemo(() => {
    if (!quickAddIngredient) return null;
    return getIngredientMacroPreview(quickAddIngredient.id, quickAddQuantity, quickAddUnit);
  }, [quickAddIngredient, quickAddQuantity, quickAddUnit]);
  const waterIngredientId = useMemo(() => {
    const exact = sortedIngredients.find((ingredient) => ingredient.name.trim() === "מים");
    if (exact) return exact.id;
    const fallback = sortedIngredients.find((ingredient) => ingredient.name.includes("מים"));
    return fallback?.id ?? null;
  }, [sortedIngredients]);
  const unitSelectOptions = useMemo(
    () => nutritionUnitOptions.map((option) => ({ value: option.value, label: option.label })),
    []
  );
  const categorySelectOptions = useMemo(
    () =>
      Object.entries(ingredientCategoryLabels).map(([value, label]) => ({
        value,
        label
      })),
    []
  );
  const defaultUnitOptions = useMemo(
    () => [
      { value: "g", label: "גרם" },
      { value: "ml", label: "מ״ל" },
      { value: "unit", label: "יח׳" }
    ],
    []
  );

  function ingredientOptionLabel(ingredientId: string) {
    return ingredientMap.get(ingredientId)?.name ?? "מצרך";
  }

  function isFavoriteIngredient(ingredientId: string) {
    return ingredientFavoriteIdSet.has(ingredientId);
  }

  async function toggleIngredientStar(ingredientId: string) {
    if (!ingredientId) return;
    const nextFavorite = !isFavoriteIngredient(ingredientId);
    const res = await fetch("/api/nutrition/favorites/ingredient", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ingredientId, favorite: nextFavorite })
    });
    if (!res.ok) {
      showStatus("עדכון מועדף נכשל.");
      return;
    }
    const payload = (await res.json()) as { favoriteIds?: string[]; favorite?: boolean };
    if (Array.isArray(payload.favoriteIds)) {
      setIngredientFavoriteIds(payload.favoriteIds);
    } else {
      setIngredientFavoriteIds((prev) =>
        payload.favorite ? [...new Set([...prev, ingredientId])] : prev.filter((id) => id !== ingredientId)
      );
    }
    showStatus(nextFavorite ? "נוסף למועדפים." : "הוסר ממועדפים.");
  }

  function getIngredientMacroPreview(ingredientId: string, quantity: number, unit: NutritionUnit) {
    const ingredient = ingredientMap.get(ingredientId);
    if (!ingredient) return null;
    const safeQuantity = Number(quantity);
    if (!Number.isFinite(safeQuantity) || safeQuantity <= 0) return null;
    const grams = nutritionQuantityToGrams(safeQuantity, unit, ingredient);
    const factor = grams / 100;
    return {
      grams: roundValue(grams, 0),
      kcal: roundValue(ingredient.kcalPer100 * factor, 0),
      proteinG: roundValue(ingredient.proteinPer100 * factor, 1),
      carbsG: roundValue(ingredient.carbsPer100 * factor, 1),
      fatG: roundValue(ingredient.fatPer100 * factor, 1)
    };
  }

  function startMealEdit(meal: NutritionMeal) {
    setMealEditors((prev) => ({
      ...prev,
      [meal.id]: meal.items.map((item) => ({
        ingredientId: item.ingredientId,
        quantity: item.quantity,
        unit: item.unit
      }))
    }));
    setMealEditorOpenId(meal.id);
    setMealEditorFocusIndex(null);
  }

  function updateMealEditRow(mealId: string, rowIndex: number, patch: Partial<MealEditRow>) {
    setMealEditors((prev) => ({
      ...prev,
      [mealId]: (prev[mealId] ?? []).map((row, idx) => (idx === rowIndex ? { ...row, ...patch } : row))
    }));
  }

  function addMealEditRow(mealId: string) {
    if (sortedIngredients.length === 0) {
      showStatus("אין קטלוג מצרכים זמין.");
      return;
    }
    let nextFocus = 0;
    setMealEditors((prev) => ({
      ...prev,
      [mealId]: (() => {
        const nextRows = [...(prev[mealId] ?? []), { ingredientId: "", quantity: 1, unit: "unit" as NutritionUnit }];
        nextFocus = nextRows.length - 1;
        return nextRows;
      })()
    }));
    setMealEditorFocusIndex(nextFocus);
  }

  function removeMealEditRow(mealId: string, rowIndex: number) {
    setMealEditors((prev) => ({
      ...prev,
      [mealId]: (prev[mealId] ?? []).filter((_, idx) => idx !== rowIndex)
    }));
  }

  async function persistMealDraft(mealId: string, silent = false) {
    const rows = (mealEditors[mealId] ?? [])
      .map((row) => ({
        ingredientId: row.ingredientId,
        quantity: Number(row.quantity),
        unit: row.unit
      }))
      .filter((row) => row.ingredientId && Number.isFinite(row.quantity) && row.quantity > 0);

    if (!rows.length) {
      const existingMeal = journal?.nutrition.meals.find((meal) => meal.id === mealId) ?? null;
      if (existingMeal && existingMeal.items.length === 0) {
        if (!silent) showStatus("הארוחה נשארה ריקה. אפשר להוסיף רכיבים בהמשך.");
        return true;
      }
      if (!silent) showStatus("צריך לפחות רכיב אחד בארוחה.");
      return false;
    }

    setSavingMealId(mealId);
    try {
      const res = await fetch("/api/nutrition/meal-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mealId, items: rows })
      });
      if (!res.ok) {
        if (!silent) showStatus("שמירת הטיוטה נכשלה.");
        return false;
      }
      if (!silent) showStatus("הטיוטה נשמרה.");
      await Promise.resolve(onRefresh());
      await loadSideData(date);
      return true;
    } finally {
      setSavingMealId(null);
    }
  }

  async function closeMealEdit(mealId: string, silent = false) {
    const saved = await persistMealDraft(mealId, silent);
    if (!saved) return;
    setMealEditors((prev) => {
      const next = { ...prev };
      delete next[mealId];
      return next;
    });
    setMealEditorOpenId((prev) => (prev === mealId ? null : prev));
    setMealEditorFocusIndex(null);
  }

  async function deleteMeal(mealId: string) {
    const res = await fetch("/api/nutrition/meal-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mealId })
    });
    if (!res.ok) {
      showStatus("מחיקת הארוחה נכשלה.");
      return;
    }
    setMealEditors((prev) => {
      const next = { ...prev };
      delete next[mealId];
      return next;
    });
    setMealEditorOpenId((prev) => (prev === mealId ? null : prev));
    showStatus("הארוחה הוסרה מהיום.");
    await Promise.resolve(onRefresh());
  }

  async function setMealApproval(mealId: string, accepted: boolean | null) {
    const res = await fetch("/api/nutrition/meal-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mealId, accepted })
    });
    if (!res.ok) {
      showStatus("עדכון אישור ארוחה נכשל.");
      return;
    }
    showStatus(accepted ? "הארוחה אושרה." : "האישור הוסר.");
    await Promise.resolve(onRefresh());
  }

  async function saveCheckin() {
    setSavingCheckin(true);
    try {
      const res = await fetch("/api/checkin/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...checkinForm,
          date,
          sleepHoursActual: checkinForm.sleepHoursActual ? Number(checkinForm.sleepHoursActual) : null,
          hrvActual: checkinForm.hrvActual ? Number(checkinForm.hrvActual) : null,
          restingHrActual: checkinForm.restingHrActual ? Number(checkinForm.restingHrActual) : null
        })
      });
      if (!res.ok) {
        showStatus("שמירת צ׳ק-אין נכשלה.");
        return;
      }
      setCheckinEditing(false);
      showStatus("צ׳ק-אין עודכן.");
      await Promise.resolve(onRefresh());
    } finally {
      setSavingCheckin(false);
    }
  }

  function labelFor(field: keyof CheckinOptions["options"], id: string) {
    return checkinOptions?.options[field].find((choice) => choice.id === id)?.label ?? id;
  }

  function updatePantryRow(index: number, patch: Partial<PantryRow>) {
    setPantryRows((prev) => prev.map((row, idx) => (idx === index ? { ...row, ...patch } : row)));
  }

  function addPantryRow() {
    if (sortedIngredients.length === 0) {
      showStatus("אין עדיין מצרכים בקטלוג.");
      return;
    }
    setPantryRows((prev) => [...prev, { ingredientId: "", quantity: 1, unit: "unit" as NutritionUnit }]);
  }

  function removePantryRow(index: number) {
    setPantryRows((prev) => prev.filter((_, idx) => idx !== index));
  }

  async function savePantry() {
    setSavingPantry(true);
    try {
      const validRows = pantryRows
        .map((row) => ({
          ingredientId: row.ingredientId,
          quantity: Number(row.quantity),
          unit: row.unit
        }))
        .filter((row) => row.ingredientId && Number.isFinite(row.quantity) && row.quantity > 0);
      const res = await fetch("/api/nutrition/pantry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          items: validRows
        })
      });
      if (!res.ok) {
        showStatus("שמירת פנטרי נכשלה.");
        return;
      }
      showStatus("הפנטרי נשמר.");
      await Promise.resolve(onRefresh());
      await loadSideData(date);
    } finally {
      setSavingPantry(false);
    }
  }

  async function createIngredient() {
    const payload = {
      name: newIngredient.name.trim(),
      category: newIngredient.category,
      kcalPer100: newIngredient.kcalPer100.trim() ? Number(newIngredient.kcalPer100) : undefined,
      proteinPer100: Number(newIngredient.proteinPer100),
      carbsPer100: Number(newIngredient.carbsPer100),
      fatPer100: Number(newIngredient.fatPer100),
      defaultUnit: newIngredient.defaultUnit,
      gramsPerUnit: Number(newIngredient.gramsPerUnit || 1)
    };

    if (
      !payload.name ||
      !Number.isFinite(payload.proteinPer100) ||
      !Number.isFinite(payload.carbsPer100) ||
      !Number.isFinite(payload.fatPer100) ||
      !Number.isFinite(payload.gramsPerUnit) ||
      payload.gramsPerUnit <= 0
    ) {
      showStatus("צריך להזין שם וערכי מאקרו תקינים.");
      return;
    }

    setSavingIngredient(true);
    try {
      const res = await fetch("/api/nutrition/ingredient", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        showStatus("שמירת מזון חדש נכשלה.");
        return;
      }

      setNewIngredient(emptyIngredientDraft());
      setShowNewIngredient(false);
      showStatus("המזון נוסף לקטלוג.");
      await loadSideData(date);
      await Promise.resolve(onRefresh());
    } finally {
      setSavingIngredient(false);
    }
  }

  async function suggestIngredientFromText() {
    const text = newIngredient.freeText.trim();
    if (!text) {
      showStatus("כתוב מצרך חופשי כדי שהמערכת תנחש.");
      return;
    }
    setSuggestingIngredient(true);
    try {
      const res = await fetch("/api/nutrition/ingredient/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      const payload = (await res.json()) as {
        ok?: boolean;
        suggestion?: {
          name: string;
          category: NutritionIngredient["category"];
          kcalPer100: number;
          proteinPer100: number;
          carbsPer100: number;
          fatPer100: number;
          defaultUnit: NutritionUnit;
          gramsPerUnit: number;
          matchedBy: string;
        } | null;
      };
      if (!res.ok || !payload.suggestion) {
        showStatus("לא הצלחתי לזהות את המצרך. אפשר להזין ידנית.");
        return;
      }
      setNewIngredient((prev) => ({
        ...prev,
        name: payload.suggestion?.name ?? prev.name,
        category: payload.suggestion?.category ?? prev.category,
        kcalPer100: String(payload.suggestion?.kcalPer100 ?? prev.kcalPer100),
        proteinPer100: String(payload.suggestion?.proteinPer100 ?? prev.proteinPer100),
        carbsPer100: String(payload.suggestion?.carbsPer100 ?? prev.carbsPer100),
        fatPer100: String(payload.suggestion?.fatPer100 ?? prev.fatPer100),
        defaultUnit: payload.suggestion?.defaultUnit ?? prev.defaultUnit,
        gramsPerUnit: String(payload.suggestion?.gramsPerUnit ?? prev.gramsPerUnit)
      }));
      showStatus(`זוהה: ${payload.suggestion.name} (לפי ${payload.suggestion.matchedBy}).`);
    } catch {
      showStatus("ניחוש חכם נכשל כרגע. נסה שוב.");
    } finally {
      setSuggestingIngredient(false);
    }
  }

  async function createIngredientFromInlineSearch(textRaw: string) {
    const text = textRaw.trim();
    if (text.length < 2) return null;
    try {
      const suggestRes = await fetch("/api/nutrition/ingredient/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      const suggestPayload = (await suggestRes.json()) as {
        ok?: boolean;
        suggestion?: {
          name: string;
          category: NutritionIngredient["category"];
          kcalPer100: number;
          proteinPer100: number;
          carbsPer100: number;
          fatPer100: number;
          defaultUnit: NutritionUnit;
          gramsPerUnit: number;
          matchedBy: string;
        } | null;
      };
      if (!suggestRes.ok || !suggestPayload.suggestion) {
        showStatus("לא מצאתי את המזון. אפשר להוסיף ידנית דרך 'חדש'.");
        return null;
      }

      const createRes = await fetch("/api/nutrition/ingredient", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: suggestPayload.suggestion.name,
          category: suggestPayload.suggestion.category,
          kcalPer100: suggestPayload.suggestion.kcalPer100,
          proteinPer100: suggestPayload.suggestion.proteinPer100,
          carbsPer100: suggestPayload.suggestion.carbsPer100,
          fatPer100: suggestPayload.suggestion.fatPer100,
          defaultUnit: suggestPayload.suggestion.defaultUnit === "tbsp" || suggestPayload.suggestion.defaultUnit === "tsp" ? "g" : suggestPayload.suggestion.defaultUnit,
          gramsPerUnit: suggestPayload.suggestion.gramsPerUnit
        })
      });
      const createPayload = (await createRes.json()) as { ok?: boolean; ingredient?: NutritionIngredient };
      if (!createRes.ok || !createPayload.ingredient) {
        showStatus("הוספת מזון חדש נכשלה.");
        return null;
      }

      showStatus(`נוסף לקטלוג: ${createPayload.ingredient.name}`);
      await loadSideData(date);
      await Promise.resolve(onRefresh());
      return createPayload.ingredient;
    } catch {
      showStatus("הוספת מזון חדש נכשלה.");
      return null;
    }
  }

  async function handleInlineIngredientCreate(mealId: string, rowIndex: number, query: string) {
    const created = await createIngredientFromInlineSearch(query);
    if (!created) return;
    updateMealEditRow(mealId, rowIndex, { ingredientId: created.id });
  }

  const feedbackMap = useMemo(
    () => new Map((journal?.workoutFeedback ?? []).map((item) => [item.workoutId, item])),
    [journal?.workoutFeedback]
  );

  const mealBySlot = useMemo(
    () => new Map((journal?.nutrition.meals ?? []).map((meal) => [meal.slot, meal])),
    [journal?.nutrition.meals]
  );
  const visibleNutritionMeals = useMemo(
    () =>
      (journal?.nutrition.meals ?? []).filter((meal) =>
        nutritionSummaryOnly ? meal.items.length > 0 || meal.totalKcal > 0 : true
      ),
    [journal?.nutrition.meals, nutritionSummaryOnly]
  );
  const visibleDrinkMeals = useMemo(
    () => visibleNutritionMeals.filter((meal) => meal.slot === "drinks"),
    [visibleNutritionMeals]
  );
  const visibleFoodMeals = useMemo(
    () => visibleNutritionMeals.filter((meal) => meal.slot !== "drinks"),
    [visibleNutritionMeals]
  );

  const hasMorningUpdate = Boolean(journal?.recovery);

  const morningMetrics = useMemo<MorningMetricBar[]>(
    () =>
      hasMorningUpdate && checkinOptions
        ? ([
            { field: "sleep", label: "שינה" },
            { field: "mood", label: "מצב רוח" },
            { field: "sorenessLevel", label: "כאב שרירים" },
            { field: "restingHr", label: "דופק מנוחה" },
            { field: "hrv", label: "HRV" },
            { field: "exertion", label: "גוף כללי" }
          ] as const).map((metric) => {
            const choiceId = checkinForm[metric.field];
            const choiceLabel = checkinOptions.options[metric.field].find((choice) => choice.id === choiceId)?.label ?? "לא הוזן";
            const value = normalizeMorningMetric(metric.field, choiceId);
            const actualLabel =
              metric.field === "restingHr" && checkinForm.restingHrActual.trim()
                ? `${checkinForm.restingHrActual.trim()} bpm`
                : metric.field === "hrv" && checkinForm.hrvActual.trim()
                  ? `${checkinForm.hrvActual.trim()} ms`
                  : undefined;
            return {
              field: metric.field,
              label: metric.label,
              value,
              icon: morningMetricIcon(metric.field),
              color: morningMetricColor(value),
              choiceLabel,
              score10: morningScore10(value),
              actualLabel
            };
          })
        : [],
    [checkinForm, hasMorningUpdate, checkinOptions]
  );

  const morningAverage = useMemo(
    () =>
      morningMetrics.length
        ? Math.round(morningMetrics.reduce((sum, item) => sum + item.value, 0) / morningMetrics.length)
        : null,
    [morningMetrics]
  );
  const morningAverage10 = useMemo(
    () => (morningAverage == null ? null : morningScore10(morningAverage)),
    [morningAverage]
  );
  const morningLineData = useMemo(() => {
    if (!morningMetrics.length) return null;
    const width = 640;
    const height = 170;
    const padX = 42;
    const top = 40;
    const bottom = 146;
    const step = morningMetrics.length > 1 ? (width - padX * 2) / (morningMetrics.length - 1) : 0;
    const points = morningMetrics.map((metric, index) => {
      const x = padX + index * step;
      const y = bottom - (metric.value / 100) * (bottom - top);
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
  }, [morningMetrics]);
  async function createMealSlot(slot: MealSlot) {
    if (!journal) return;
    const existing = mealBySlot.get(slot);
    if (existing) {
      startMealEdit(existing);
      return;
    }

    setCreatingMealSlot(slot);
    try {
      const res = await fetch("/api/nutrition/meal-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, slot })
      });
      if (!res.ok) {
        showStatus("יצירת ארוחה נכשלה.");
        return;
      }
      const payload = (await res.json()) as { meal?: NutritionMeal };
      showStatus("נפתחה ארוחה ריקה. רכיבים יתווספו רק בלחיצה.");
      await Promise.resolve(onRefresh());
      await loadSideData(date);
      if (payload.meal) {
        startMealEdit(payload.meal);
      }
    } finally {
      setCreatingMealSlot(null);
    }
  }

  function snapshotMealBySlot() {
    const snapshot = new Map<MealSlot, UndoMealSnapshot>();
    for (const meal of journal?.nutrition.meals ?? []) {
      snapshot.set(meal.slot, {
        id: meal.id,
        accepted: meal.accepted ?? null,
        items: meal.items.map((item) => ({
          ingredientId: item.ingredientId,
          quantity: item.quantity,
          unit: item.unit
        }))
      });
    }
    return snapshot;
  }

  async function addFavoriteToDate(
    favoriteId: string,
    options?: { quantity?: number; unit?: NutritionUnit },
    forcedSlot?: MealSlot
  ) {
    if (!favoriteId) return;
    const beforeBySlot = snapshotMealBySlot();
    setAddingFavorite(true);
    try {
      const res = await fetch("/api/nutrition/favorites/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          favoriteId,
          slot: forcedSlot,
          quantity: options?.quantity,
          unit: options?.unit
        })
      });
      if (!res.ok) {
        showStatus("הוספת מזון נכשלה.");
        return;
      }
      const payload = (await res.json()) as {
        slot?: MealSlot;
        favorite?: { name?: string };
        meal?: { id: string; accepted?: boolean | null } | null;
      };
      const slotText = payload.slot ? mealSlotLabel(payload.slot) : "ארוחה";
      showStatus(`נוסף: ${payload.favorite?.name ?? "מזון"} · ${slotText}`);
      await Promise.resolve(onRefresh());
      await loadSideData(date);
      if (payload.meal?.id) {
        setMealEditors((prev) => {
          const next = { ...prev };
          delete next[payload.meal!.id];
          return next;
        });
        setMealEditorOpenId(payload.meal.id);
      }

      if (payload.slot && payload.meal?.id) {
        const beforeMeal = beforeBySlot.get(payload.slot);
        const mealId = payload.meal.id;
        showToast(`נוסף ל-${slotText}`, async () => {
          if (beforeMeal) {
            await fetch("/api/nutrition/meal-edit", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                mealId,
                items: beforeMeal.items
              })
            });
            await fetch("/api/nutrition/meal-feedback", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                mealId,
                accepted: beforeMeal.accepted ?? null
              })
            });
          } else {
            await fetch("/api/nutrition/meal-delete", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ mealId })
            });
          }
          await Promise.resolve(onRefresh());
          await loadSideData(date);
        });
      } else {
        showToast(`נוסף: ${payload.favorite?.name ?? "מזון"}`);
      }
    } finally {
      setAddingFavorite(false);
    }
  }

  function applyQuickSelection(nextValue: string) {
    setQuickAddValue(nextValue);
    const ingredientId = quickValueToIngredientId(nextValue);
    if (!ingredientId) return;
    const ingredient = ingredientMap.get(ingredientId);
    if (!ingredient) return;
    const defaultUnit = ingredient.defaultUnit;
    const defaultQuantity = defaultUnit === "unit" || defaultUnit === "tbsp" || defaultUnit === "tsp" ? 1 : 100;
    setQuickAddUnit(defaultUnit);
    setQuickAddQuantity(defaultQuantity);
  }

  async function addFromQuickSearch() {
    if (!quickAddValue) return;
    const isIngredient = quickAddValue.startsWith("ingredient:");
    const selectedFavorite = favorites.find((item) => item.id === quickAddValue) ?? null;
    const forcedSlot: MealSlot | undefined =
      (quickAddIngredient?.category === "hydration" ||
        Boolean(quickAddIngredient && looksLikeDrinkName(quickAddIngredient.name)) ||
        Boolean(selectedFavorite && looksLikeDrinkName(selectedFavorite.name)))
        ? "drinks"
        : undefined;
    await addFavoriteToDate(
      quickAddValue,
      isIngredient
        ? {
            quantity: Number.isFinite(quickAddQuantity) && quickAddQuantity > 0 ? quickAddQuantity : 1,
            unit: quickAddUnit
          }
        : undefined,
      forcedSlot
    );
    setQuickAddValue("");
    setQuickAddQuantity(1);
    setQuickAddUnit("unit");
  }

  async function addWaterCup() {
    if (!waterIngredientId) {
      showStatus("לא נמצא 'מים' בקטלוג. אפשר להוסיף מהפנטרי.");
      return;
    }
    await addFavoriteToDate(`ingredient:${waterIngredientId}`, { quantity: 250, unit: "ml" }, "drinks");
  }

  const editedMeal = useMemo(
    () => (mealEditorOpenId ? journal?.nutrition.meals.find((meal) => meal.id === mealEditorOpenId) ?? null : null),
    [journal?.nutrition.meals, mealEditorOpenId]
  );
  const editedMealSuggestions = useMemo(() => {
    if (!editedMeal) return [] as NutritionSlotSuggestion[];
    const bySlot = journal?.nutrition.suggestedBySlot?.[editedMeal.slot] ?? [];
    return bySlot.slice(0, 4);
  }, [journal?.nutrition.suggestedBySlot, editedMeal]);
  const editedMealRows = mealEditorOpenId ? mealEditors[mealEditorOpenId] ?? [] : [];
  const editedMealMacroSummary = useMemo(() => {
    if (!mealEditorOpenId) return null;
    const rows = mealEditors[mealEditorOpenId] ?? [];
    let kcal = 0;
    let proteinG = 0;
    let carbsG = 0;
    let fatG = 0;
    for (const row of rows) {
      const preview = getIngredientMacroPreview(row.ingredientId, row.quantity, row.unit);
      if (!preview) continue;
      kcal += preview.kcal;
      proteinG += preview.proteinG;
      carbsG += preview.carbsG;
      fatG += preview.fatG;
    }
    return {
      kcal: roundValue(kcal, 0),
      proteinG: roundValue(proteinG, 1),
      carbsG: roundValue(carbsG, 1),
      fatG: roundValue(fatG, 1)
    };
  }, [mealEditorOpenId, mealEditors, ingredientMap]);

  async function closeMealEditorModal() {
    if (!mealEditorOpenId) return;
    await closeMealEdit(mealEditorOpenId, true);
    setMealEditorFocusIndex(null);
  }

  useEffect(() => {
    if (mealEditorFocusIndex == null) return;
    const target = document.querySelector<HTMLElement>(`[data-meal-edit-row='${mealEditorFocusIndex}']`);
    if (target) {
      target.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [mealEditorFocusIndex, mealEditorOpenId, editedMealRows.length]);

  return (
    <>
      {status && <p className="note">{status}</p>}
      {toast ? (
        <div className="toast-msg">
          <span>{toast.message}</span>
          {toast.canUndo ? (
            <button type="button" className="toast-undo-btn" onClick={() => void undoLastAction()} aria-label="בטל פעולה">
              ↶
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="journal-grid">
        {!hideMorning ? (
          <Section title="מדדי בוקר" subtitle="תחושת הבוקר והתרשמות כללית של היום">
            {checkinOptions && journal ? (
              <div className="journal-block">
                {hasMorningUpdate ? (
                  <div className="morning-graph-card">
                    <button
                      type="button"
                      className={morningSummaryOpen ? "morning-summary-toggle open" : "morning-summary-toggle"}
                      onClick={() => setMorningSummaryOpen((prev) => !prev)}
                      aria-expanded={morningSummaryOpen}
                    >
                      <div className="morning-graph-head">
                        <strong>מדד בוקר כללי</strong>
                        <span>{morningAverage10 ?? "-"}/10</span>
                      </div>
                      <div className="morning-line-wrap">
                        {morningLineData ? (
                          <svg
                            className="morning-line-chart"
                            viewBox={`0 0 ${morningLineData.width} ${morningLineData.height}`}
                            role="img"
                            aria-label="גרף מדדי בוקר"
                          >
                            {[20, 50, 80].map((guide) => {
                              const y =
                                morningLineData.bottom -
                                (guide / 100) * (morningLineData.bottom - morningLineData.top);
                              return (
                                <g key={`guide-${guide}`}>
                                  <line x1={24} x2={morningLineData.width - 16} y1={y} y2={y} className="morning-line-guide" />
                                  <text x={16} y={y + 4} textAnchor="middle" className="morning-line-guide-label">
                                    {guide}
                                  </text>
                                </g>
                              );
                            })}
                            <polyline points={morningLineData.polyline} className="morning-line-path" />
                            {morningLineData.points.map((point) => (
                              <g key={`point-${point.field}`}>
                                <text x={point.x} y={point.y - 22} textAnchor="middle" className="morning-line-point-icon">
                                  {point.icon}
                                </text>
                                <circle cx={point.x} cy={point.y} r={5.6} className="morning-line-point" style={{ fill: point.color }} />
                              </g>
                            ))}
                          </svg>
                        ) : null}
                      </div>
                      <span className="morning-summary-toggle-caption">{morningSummaryOpen ? "הסתר פירוט" : "הצג פירוט"}</span>
                    </button>
                    {morningSummaryOpen ? (
                      <div className="morning-graph-bars">
                        {morningMetrics.map((metric) => (
                          <div key={metric.field} className="morning-bar-item">
                            <span>
                              <i>{metric.icon}</i>
                              {metric.label}
                            </span>
                            <div className="morning-bar-track">
                              <div className="morning-bar-fill" style={{ width: `${metric.value}%`, background: metric.color }} />
                            </div>
                            <em>
                              {metric.choiceLabel} · {metric.score10}/10
                              {metric.actualLabel ? ` · ${metric.actualLabel}` : ""}
                            </em>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="morning-graph-card morning-graph-empty">
                    <strong>אין מדדי בוקר ליום הזה</strong>
                    <p className="note">המדדים יוצגו רק אחרי הזנת עדכון בוקר.</p>
                  </div>
                )}
                {checkinEditing && !readOnly ? (
                  <>
                    <div className="morning-edit-grid">
                      {(Object.keys(labels) as Array<keyof typeof labels>).map((field) => (
                        <article className="run-feedback-question morning-choice-card" key={field}>
                          <p>{labels[field]}</p>
                          <div className="choice-row compact-choice-row">
                            {checkinOptions.options[field].map((choice) => (
                              <button
                                key={choice.id}
                                type="button"
                                className={checkinForm[field] === choice.id ? "run-option-btn selected" : "run-option-btn"}
                                onClick={() => setCheckinForm((prev) => ({ ...prev, [field]: choice.id }))}
                              >
                                {choice.label}
                              </button>
                            ))}
                          </div>
                        </article>
                      ))}
                    </div>
                    <div className="choice-row">
                      {checkinOptions.painAreas.map((area) => (
                        <button
                          key={area.id}
                          type="button"
                          className={checkinForm.painAreas.includes(area.name) ? "choice-btn selected" : "choice-btn"}
                          onClick={() =>
                            setCheckinForm((prev) => ({
                              ...prev,
                              painAreas: prev.painAreas.includes(area.name)
                                ? prev.painAreas.filter((item) => item !== area.name)
                                : [...prev.painAreas, area.name]
                            }))
                          }
                        >
                          {area.name}
                        </button>
                      ))}
                    </div>
                    <details className="compact-panel">
                      <summary>מדדים מספריים (אופציונלי)</summary>
                      <div className="journal-form-grid">
                        <label className="field">
                          שעות שינה
                          <input
                            type="number"
                            min={0}
                            max={14}
                            step={0.1}
                            value={checkinForm.sleepHoursActual}
                            onChange={(event) => setCheckinForm((prev) => ({ ...prev, sleepHoursActual: event.target.value }))}
                          />
                        </label>
                        <label className="field">
                          HRV
                          <input
                            type="number"
                            min={0}
                            max={250}
                            step={1}
                            value={checkinForm.hrvActual}
                            onChange={(event) => setCheckinForm((prev) => ({ ...prev, hrvActual: event.target.value }))}
                          />
                        </label>
                        <label className="field">
                          דופק מנוחה
                          <input
                            type="number"
                            min={20}
                            max={120}
                            step={1}
                            value={checkinForm.restingHrActual}
                            onChange={(event) => setCheckinForm((prev) => ({ ...prev, restingHrActual: event.target.value }))}
                          />
                        </label>
                      </div>
                    </details>
                    <div className="row">
                      <button className="sync-workouts-btn" onClick={() => void saveCheckin()} disabled={savingCheckin}>
                        {savingCheckin ? "שומר..." : "שמור צ׳ק-אין"}
                      </button>
                    </div>
                  </>
                ) : readOnly ? (
                  <p className="note">מצב צפייה בלבד ליום עבר. לחץ על עריכה בדף היום כדי לשנות.</p>
                ) : (
                  <div className="row">
                    <button className="choice-btn" onClick={() => setCheckinEditing(true)}>
                      {hasMorningUpdate ? "ערוך" : "הזן עדכון בוקר"}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className="note">טוען נתוני בוקר...</p>
            )}
          </Section>
        ) : null}

        <Section title="תזונה" subtitle="בפועל מול היעד היומי">
          {journal ? (
            <div className="journal-block">
              {!readOnly && !nutritionSummaryOnly ? (
                <div className="journal-card-toolbar">
                  <button className={showPantry ? "choice-btn selected" : "choice-btn"} onClick={() => setShowPantry((prev) => !prev)}>
                    פנטרי
                  </button>
                  <div className="nutrition-quick-add">
                    <UiSelect
                      value={quickAddValue}
                      onChange={applyQuickSelection}
                      disabled={addingFavorite || quickAddOptions.length === 0}
                      placeholder="חפש מזון או מועדף…"
                      options={quickAddOptions}
                      searchable
                      maxVisibleOptions={14}
                    />
                    {quickAddIngredient ? (
                      <>
                        <input
                          type="number"
                          min={0.1}
                          step={0.1}
                          value={quickAddQuantity}
                          onChange={(event) => setQuickAddQuantity(Number(event.target.value))}
                          aria-label="כמות"
                        />
                        <UiSelect
                          value={quickAddUnit}
                          onChange={(nextValue) => setQuickAddUnit(nextValue as NutritionUnit)}
                          options={unitSelectOptions}
                        />
                      </>
                    ) : null}
                    <button
                      type="button"
                      className="icon-btn primary"
                      onClick={() => void addFromQuickSearch()}
                      disabled={addingFavorite || !quickAddValue}
                      aria-label="הוסף מזון"
                      title="הוסף מזון"
                    >
                      ＋
                    </button>
                  </div>
                </div>
              ) : null}
              {quickAddMacroPreview && !readOnly && !nutritionSummaryOnly ? (
                <p className="macro-line quick-add-macro-line">
                  {quickAddMacroPreview.grams}ג׳ · {quickAddMacroPreview.kcal} קק״ל · חלבון {quickAddMacroPreview.proteinG}ג׳ · פחמימה{" "}
                  {quickAddMacroPreview.carbsG}ג׳ · שומן {quickAddMacroPreview.fatG}ג׳
                </p>
              ) : null}
              {!readOnly && !nutritionSummaryOnly ? (
                <div className="nutrition-inline-actions">
                  <button type="button" className="water-quick-btn" onClick={() => void addWaterCup()}>
                    + כוס שתייה
                  </button>
                </div>
              ) : null}
              {!readOnly && !nutritionSummaryOnly ? (
                <div className="meal-slot-buttons">
                  {mealSlotButtons.map((slotItem) => {
                    const isActive = mealBySlot.has(slotItem.slot);
                    const isBusy = creatingMealSlot === slotItem.slot;
                    return (
                      <button
                        key={slotItem.slot}
                        className={isActive ? "meal-slot-btn active" : "meal-slot-btn"}
                        onClick={() => void createMealSlot(slotItem.slot)}
                        disabled={isBusy}
                      >
                        {isBusy ? "…" : slotItem.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {!readOnly && !nutritionSummaryOnly && showPantry && (
                <details className="compact-panel pantry-panel" open>
                  <summary>
                    <span>פנטרי יומי</span>
                    <span className="note">{pantryRows.length} פריטים</span>
                  </summary>
                  <div className="pantry-builder">
                    <div className="row pantry-header">
                      <h4>רשימת מצרכים</h4>
                      <div className="row mini-actions">
                        <button className="icon-btn" onClick={addPantryRow} aria-label="הוסף מצרך" title="הוסף מצרך">＋</button>
                        <button
                          className={showNewIngredient ? "icon-btn selected" : "icon-btn"}
                          onClick={() => setShowNewIngredient((prev) => !prev)}
                          aria-label="מזון חדש למערכת"
                          title="מזון חדש למערכת"
                        >
                          חדש
                        </button>
                        <button className="icon-btn primary" onClick={savePantry} disabled={savingPantry} aria-label="שמור פנטרי" title="שמור פנטרי">
                          {savingPantry ? "…" : "✓"}
                        </button>
                      </div>
                    </div>
                    {showNewIngredient && (
                      <div className="pantry-create-box">
                        <div className="pantry-create-head">
                          <strong>מזון חדש למערכת</strong>
                          <span className="note">הזנה לפי 100 גרם או לפי יחידה</span>
                        </div>
                        <div className="pantry-free-text-row">
                          <input
                            value={newIngredient.freeText}
                            onChange={(event) => setNewIngredient((prev) => ({ ...prev, freeText: event.target.value }))}
                            placeholder="למשל: פרוסת לחם מחמצת או קוטג׳"
                          />
                          <button className="choice-btn" onClick={() => void suggestIngredientFromText()} disabled={suggestingIngredient}>
                            {suggestingIngredient ? "חושב..." : "נחש לפי טקסט"}
                          </button>
                        </div>
                        <div className="pantry-new-grid compact">
                          <label className="field">
                            שם
                            <input
                              value={newIngredient.name}
                              onChange={(event) => setNewIngredient((prev) => ({ ...prev, name: event.target.value }))}
                              placeholder="למשל קוטג׳"
                            />
                          </label>
                          <label className="field">
                            קטגוריה
                            <UiSelect
                              value={newIngredient.category}
                              onChange={(nextValue) =>
                                setNewIngredient((prev) => ({
                                  ...prev,
                                  category: nextValue as NutritionIngredient["category"]
                                }))
                              }
                              options={categorySelectOptions}
                            />
                          </label>
                          <label className="field">
                            קק״ל ל־100
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={newIngredient.kcalPer100}
                              onChange={(event) => setNewIngredient((prev) => ({ ...prev, kcalPer100: event.target.value }))}
                            />
                          </label>
                          <label className="field">
                            חלבון ל־100
                            <input
                              type="number"
                              min={0}
                              step={0.1}
                              value={newIngredient.proteinPer100}
                              onChange={(event) => setNewIngredient((prev) => ({ ...prev, proteinPer100: event.target.value }))}
                            />
                          </label>
                          <label className="field">
                            פחמימה ל־100
                            <input
                              type="number"
                              min={0}
                              step={0.1}
                              value={newIngredient.carbsPer100}
                              onChange={(event) => setNewIngredient((prev) => ({ ...prev, carbsPer100: event.target.value }))}
                            />
                          </label>
                          <label className="field">
                            שומן ל־100
                            <input
                              type="number"
                              min={0}
                              step={0.1}
                              value={newIngredient.fatPer100}
                              onChange={(event) => setNewIngredient((prev) => ({ ...prev, fatPer100: event.target.value }))}
                            />
                          </label>
                          <label className="field">
                            יחידת ברירת מחדל
                            <UiSelect
                              value={newIngredient.defaultUnit}
                              onChange={(nextValue) =>
                                setNewIngredient((prev) => ({
                                  ...prev,
                                  defaultUnit: nextValue as NutritionUnit
                                }))
                              }
                              options={defaultUnitOptions}
                            />
                          </label>
                          <label className="field">
                            גרם ליחידה
                            <input
                              type="number"
                              min={0.1}
                              step={0.1}
                              value={newIngredient.gramsPerUnit}
                              onChange={(event) => setNewIngredient((prev) => ({ ...prev, gramsPerUnit: event.target.value }))}
                            />
                          </label>
                        </div>
                        <div className="row pantry-create-actions">
                          <button className="choice-btn" onClick={() => setShowNewIngredient(false)}>
                            סגור
                          </button>
                          <button className="sync-workouts-btn compact" onClick={() => void createIngredient()} disabled={savingIngredient}>
                            {savingIngredient ? "שומר..." : "הוסף לקטלוג"}
                          </button>
                        </div>
                      </div>
                    )}
                    {pantryRows.length === 0 && <p className="note">עדיין אין מצרכים להיום.</p>}
                    {pantryRows.map((row, idx) => (
                      <div key={`pantry-row-${idx}`} className="pantry-row-wrap">
                        <div className="pantry-row">
                          <UiSelect
                            value={row.ingredientId}
                            onChange={(nextValue) => updatePantryRow(idx, { ingredientId: nextValue })}
                            options={ingredientSelectOptions}
                            searchable
                            placeholder="חפש מזון…"
                            maxVisibleOptions={10}
                            autoFocus={row.ingredientId === "" && idx === pantryRows.length - 1}
                          />
                          <button
                            className={row.ingredientId && isFavoriteIngredient(row.ingredientId) ? "star-btn on" : "star-btn"}
                            onClick={() => void toggleIngredientStar(row.ingredientId)}
                            disabled={!row.ingredientId}
                            aria-label={row.ingredientId && isFavoriteIngredient(row.ingredientId) ? "הסר ממועדפים" : "הוסף למועדפים"}
                            title={row.ingredientId && isFavoriteIngredient(row.ingredientId) ? "הסר ממועדפים" : "הוסף למועדפים"}
                          >
                            ★
                          </button>
                          <input type="number" min={0} step={0.1} value={row.quantity} onChange={(event) => updatePantryRow(idx, { quantity: Number(event.target.value) })} />
                          <UiSelect value={row.unit} onChange={(nextValue) => updatePantryRow(idx, { unit: nextValue as NutritionUnit })} options={unitSelectOptions} />
                          <button className="icon-btn" onClick={() => removePantryRow(idx)} aria-label="הסר מצרך" title="הסר מצרך">✕</button>
                        </div>
                        {(() => {
                          const preview = getIngredientMacroPreview(row.ingredientId, row.quantity, row.unit);
                          if (!preview) return null;
                          return (
                            <p className="macro-line">
                              {preview.grams}ג׳ · {preview.kcal} קק״ל · חלבון {preview.proteinG}ג׳ · פחמימה {preview.carbsG}ג׳ · שומן {preview.fatG}ג׳
                            </p>
                          );
                        })()}
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {visibleFoodMeals.length === 0 ? (
                <p className="note">
                  {nutritionSummaryOnly ? "עדיין לא הוזן אוכל היום." : "אין ארוחות מזון רשומות. לחץ על סוג ארוחה כדי להתחיל."}
                </p>
              ) : (
                <div className="journal-meals-grid">
                  {visibleFoodMeals.map((meal) => (
                    <article key={meal.id} className="meal-card" data-meal-card-id={meal.id}>
                      <div className="row meal-card-head">
                        <strong>{meal.title}</strong>
                        <span className="note">{meal.totalKcal} קק״ל</span>
                      </div>
                      <p className="macro-line">
                        חלבון {meal.proteinG}ג׳ · פחמימה {meal.carbsG}ג׳ · שומן {meal.fatG}ג׳
                      </p>
                      {meal.compromiseNote && <p className="note">{meal.compromiseNote}</p>}
                      <details className="meal-items-toggle">
                        <summary>רכיבים ({meal.items.length})</summary>
                        <ul className="list compact-list">
                          {meal.items.map((item) => (
                            <li key={`${meal.id}-${item.ingredientId}`}>
                              <span>{item.name} · {item.quantity} {nutritionUnitLabel(item.unit)}</span>
                              {!nutritionSummaryOnly ? (
                                <button
                                  className={isFavoriteIngredient(item.ingredientId) ? "star-btn on" : "star-btn"}
                                  onClick={() => void toggleIngredientStar(item.ingredientId)}
                                  aria-label={isFavoriteIngredient(item.ingredientId) ? "הסר ממועדפים" : "הוסף למועדפים"}
                                  title={isFavoriteIngredient(item.ingredientId) ? "הסר ממועדפים" : "הוסף למועדפים"}
                                >
                                  ★
                                </button>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </details>
                      {!readOnly && !nutritionSummaryOnly ? (
                        <div className="row meal-card-actions">
                          <button
                            className={meal.accepted ? "icon-btn primary" : "icon-btn"}
                            onClick={() => void setMealApproval(meal.id, meal.accepted ? null : true)}
                            aria-label={meal.accepted ? "הסר אישור ארוחה" : "אשר ארוחה"}
                            title={meal.accepted ? "הסר אישור ארוחה" : "אשר ארוחה"}
                          >
                            ✓
                          </button>
                          <button
                            className="icon-btn"
                            onClick={() => startMealEdit(meal)}
                            aria-label="ערוך ארוחה"
                            title="ערוך ארוחה"
                          >
                            ✎
                          </button>
                          <button className="icon-btn danger" onClick={() => void deleteMeal(meal.id)} aria-label="מחק ארוחה" title="מחק ארוחה">
                            ✕
                          </button>
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}

              <div className="journal-drinks-zone" aria-label="אזור שתייה">
                <div className="journal-drinks-head">
                  <strong>שתייה</strong>
                  <span className="note">{visibleDrinkMeals.length ? `${visibleDrinkMeals.length} רשומות` : "עדיין לא הוזנו משקאות"}</span>
                </div>
                {visibleDrinkMeals.length ? (
                  <div className="journal-drinks-list">
                    {visibleDrinkMeals.map((meal) => (
                      <article key={meal.id} className="journal-drink-row" data-meal-card-id={meal.id}>
                        <div className="row meal-card-head">
                          <strong>{meal.title}</strong>
                          <span className="note">{meal.totalKcal} קק״ל</span>
                        </div>
                        <details className="meal-items-toggle">
                          <summary>משקאות ({meal.items.length})</summary>
                          <ul className="list compact-list">
                            {meal.items.map((item) => (
                              <li key={`${meal.id}-${item.ingredientId}`}>
                                <span>{item.name} · {item.quantity} {nutritionUnitLabel(item.unit)}</span>
                                {!nutritionSummaryOnly ? (
                                  <button
                                    className={isFavoriteIngredient(item.ingredientId) ? "star-btn on" : "star-btn"}
                                    onClick={() => void toggleIngredientStar(item.ingredientId)}
                                    aria-label={isFavoriteIngredient(item.ingredientId) ? "הסר ממועדפים" : "הוסף למועדפים"}
                                    title={isFavoriteIngredient(item.ingredientId) ? "הסר ממועדפים" : "הוסף למועדפים"}
                                  >
                                    ★
                                  </button>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </details>
                        {!readOnly && !nutritionSummaryOnly ? (
                          <div className="row meal-card-actions">
                            <button
                              className={meal.accepted ? "icon-btn primary" : "icon-btn"}
                              onClick={() => void setMealApproval(meal.id, meal.accepted ? null : true)}
                              aria-label={meal.accepted ? "הסר אישור שתייה" : "אשר שתייה"}
                              title={meal.accepted ? "הסר אישור שתייה" : "אשר שתייה"}
                            >
                              ✓
                            </button>
                            <button
                              className="icon-btn"
                              onClick={() => startMealEdit(meal)}
                              aria-label="ערוך שתייה"
                              title="ערוך שתייה"
                            >
                              ✎
                            </button>
                            <button className="icon-btn danger" onClick={() => void deleteMeal(meal.id)} aria-label="מחק שתייה" title="מחק שתייה">
                              ✕
                            </button>
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="note">כאן יופיעו מים, קפה, תה ומשקאות נוספים.</p>
                )}
              </div>
            </div>
          ) : (
            <p className="note">טוען תזונה...</p>
          )}
        </Section>

        {!hideWorkouts && (
          <Section title="אימונים" subtitle="מה בוצע באותו יום">
            {journal?.workouts.length ? (
              <div className="journal-workouts-list">
                {journal.workouts.map((workout) => (
                  <Link key={workout.id} href={workoutDetailPath(workout.id)} className="journal-workout-card">
                    <strong>
                      {sportLabel(workout.sport)} · {formatDisplayDateTime(workout.startAt)}
                    </strong>
                    <span>{workoutDurationLine(workout)} · {formatDistance(workout)}</span>
                    <span>עומס {Math.round(workout.tssLike)}{workout.shoeName ? ` · ${workout.shoeName}` : ""}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="note">אין אימונים מתועדים ביום הזה.</p>
            )}
          </Section>
        )}

        {!hideFeedback && (
          <Section title="משוב" subtitle="עדכון לפי כל אימון רלוונטי באותו יום">
            {journal?.workouts.length ? (
              <div className="journal-feedback-list">
                {journal.workouts.map((workout) => (
                  <div key={workout.id} className="journal-feedback-card">
                    <div className="journal-feedback-head">
                      <strong>
                        {sportLabel(workout.sport)} · {formatDisplayDateTime(workout.startAt)}
                      </strong>
                      {feedbackMap.has(workout.id) && <span className="note">יש משוב שמור</span>}
                    </div>
                    <FeedbackInline workoutId={workout.id} sport={workout.sport} date={date} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="note">אין אימונים, ולכן אין משוב ליום הזה.</p>
            )}
          </Section>
        )}
      </div>
      {mealEditorOpenId && editedMeal && !readOnly && !nutritionSummaryOnly ? (
        <div
          className="meal-edit-modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              void closeMealEditorModal();
            }
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal-card meal-edit-modal-card">
            <div className="meal-edit-modal-head">
              <div>
                <h3>{editedMeal.title}</h3>
                <p className="note">
                  {editedMealMacroSummary
                    ? `${editedMealMacroSummary.kcal} קק״ל · חלבון ${editedMealMacroSummary.proteinG}ג׳ · פחמימה ${editedMealMacroSummary.carbsG}ג׳ · שומן ${editedMealMacroSummary.fatG}ג׳`
                    : "אין רכיבים בטיוטה"}
                </p>
              </div>
              <div className="row meal-edit-actions meal-edit-actions-top">
                <button className="icon-btn" onClick={() => addMealEditRow(mealEditorOpenId)} aria-label="הוסף רכיב" title="הוסף רכיב">
                  ＋
                </button>
                <button
                  className="icon-btn primary"
                  onClick={() => void closeMealEdit(mealEditorOpenId)}
                  disabled={savingMealId === mealEditorOpenId}
                  aria-label="סגור עריכה"
                  title="סגור עריכה"
                >
                  {savingMealId === mealEditorOpenId ? "…" : "✓"}
                </button>
              </div>
            </div>
            <div className="meal-edit-modal-body">
              {editedMealSuggestions.length > 0 ? (
                <div className="meal-edit-suggestions">
                  <p className="note">המלצות מהירות ל-{editedMeal.title}</p>
                  <div className="meal-edit-suggestion-chips">
                    {editedMealSuggestions.map((suggestion) => (
                      <button
                        key={suggestion.id}
                        type="button"
                        className="meal-suggestion-chip"
                        onClick={() =>
                          void addFavoriteToDate(
                            suggestion.favoriteId,
                            { quantity: suggestion.quantity, unit: suggestion.unit },
                            editedMeal.slot
                          )
                        }
                        disabled={addingFavorite}
                        title={suggestion.reason}
                      >
                        <strong>{suggestion.name}</strong>
                        <small>{suggestionQuantityLabel(suggestion.quantity, suggestion.unit)}</small>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {editedMealRows.map((row, idx) => (
                <div key={`${mealEditorOpenId}-edit-${idx}`} className="meal-edit-row-wrap" data-meal-edit-row={idx}>
                  <div className="meal-edit-row">
                    <UiSelect
                      value={row.ingredientId}
                      onChange={(nextValue) => updateMealEditRow(mealEditorOpenId, idx, { ingredientId: nextValue })}
                      creatable
                      onCreate={(query) => void handleInlineIngredientCreate(mealEditorOpenId, idx, query)}
                      options={ingredientSelectOptions}
                      searchable
                      placeholder="חפש מזון…"
                      maxVisibleOptions={10}
                      autoFocus={
                        mealEditorFocusIndex === idx ||
                        (mealEditorFocusIndex == null && row.ingredientId === "" && idx === editedMealRows.length - 1)
                      }
                    />
                    <button
                      className={row.ingredientId && isFavoriteIngredient(row.ingredientId) ? "star-btn on" : "star-btn"}
                      onClick={() => void toggleIngredientStar(row.ingredientId)}
                      disabled={!row.ingredientId}
                      aria-label={row.ingredientId && isFavoriteIngredient(row.ingredientId) ? "הסר ממועדפים" : "הוסף למועדפים"}
                      title={row.ingredientId && isFavoriteIngredient(row.ingredientId) ? "הסר ממועדפים" : "הוסף למועדפים"}
                    >
                      ★
                    </button>
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={row.quantity}
                      onChange={(event) => updateMealEditRow(mealEditorOpenId, idx, { quantity: Number(event.target.value) })}
                    />
                    <UiSelect
                      value={row.unit}
                      onChange={(nextValue) => updateMealEditRow(mealEditorOpenId, idx, { unit: nextValue as NutritionUnit })}
                      options={unitSelectOptions}
                    />
                  </div>
                  <div className="meal-edit-row-footer">
                    {(() => {
                      const preview = getIngredientMacroPreview(row.ingredientId, row.quantity, row.unit);
                      if (!preview) return <p className="macro-line">—</p>;
                      return (
                        <p className="macro-line">
                          {preview.grams}ג׳ · {preview.kcal} קק״ל · חלבון {preview.proteinG}ג׳ · פחמימה {preview.carbsG}ג׳ · שומן {preview.fatG}ג׳
                        </p>
                      );
                    })()}
                    <button className="icon-btn" onClick={() => removeMealEditRow(mealEditorOpenId, idx)} aria-label="הסר רכיב" title="הסר רכיב">
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
