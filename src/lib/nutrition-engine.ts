import { addDaysISO, formatISODate } from "@/lib/date";
import { nutritionQuantityToGrams } from "@/lib/nutrition-units";
import {
  activateNutritionMealSlot,
  deactivateNutritionMealSlot,
  deleteNutritionMealHistory,
  createNutritionIngredient,
  getActiveNutritionMealSlots,
  getNutritionMealsByDate,
  getNutritionPantryItems,
  getNutritionPlan,
  getNutritionPreferenceMap,
  getWorkoutsBetween,
  listNutritionIngredients,
  listNutritionFavoriteIngredientIds,
  replaceNutritionPantryItems,
  setNutritionIngredientFavorite,
  setNutritionMealFeedback,
  upsertNutritionDailyPlan,
  upsertNutritionEvent,
  upsertNutritionMealHistory
} from "@/lib/db";
import type {
  MealSlot,
  NutritionDailyPlan,
  NutritionIngredient,
  NutritionMeal,
  NutritionMealItem,
  NutritionPantryItem,
  NutritionUnit
} from "@/lib/types";

type PantryUpsertItem = {
  ingredientId: string;
  quantity: number;
  unit: NutritionUnit;
};

type MealEditItem = {
  ingredientId: string;
  quantity: number;
  unit: NutritionUnit;
};

type IngredientSuggestion = {
  name: string;
  category: NutritionIngredient["category"];
  kcalPer100: number;
  proteinPer100: number;
  carbsPer100: number;
  fatPer100: number;
  defaultUnit: NutritionUnit;
  gramsPerUnit: number;
  matchedBy: string;
};

type FavoriteIngredientTemplate = {
  name: string;
  category: NutritionIngredient["category"];
  kcalPer100: number;
  proteinPer100: number;
  carbsPer100: number;
  fatPer100: number;
  defaultUnit: NutritionUnit;
  gramsPerUnit: number;
  quantity: number;
  unit: NutritionUnit;
};

export type NutritionFavoriteTemplate = {
  id: string;
  name: string;
  description: string;
  preferredSlot?: MealSlot;
  items: FavoriteIngredientTemplate[];
};

export type NutritionSlotSuggestion = {
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

type NutritionSuggestionBySlot = Record<MealSlot, NutritionSlotSuggestion[]>;

const nutritionFavorites: NutritionFavoriteTemplate[] = [
  {
    id: "espresso_daily",
    name: "אספרסו כפול עם חלב",
    description: "שוט אספרסו כפול עם 50 מ״ל חלב 3%",
    preferredSlot: "breakfast",
    items: [
      {
        name: "אספרסו כפול עם חלב",
        category: "dairy",
        kcalPer100: 60,
        proteinPer100: 3.3,
        carbsPer100: 4.7,
        fatPer100: 3.0,
        defaultUnit: "ml",
        gramsPerUnit: 50,
        quantity: 50,
        unit: "ml"
      }
    ]
  },
  {
    id: "espresso_double",
    name: "אספרסו כפול",
    description: "אספרסו כפול קצר",
    preferredSlot: "breakfast",
    items: [
      {
        name: "אספרסו כפול",
        category: "hydration",
        kcalPer100: 9,
        proteinPer100: 0.1,
        carbsPer100: 1.7,
        fatPer100: 0.2,
        defaultUnit: "ml",
        gramsPerUnit: 60,
        quantity: 60,
        unit: "ml"
      }
    ]
  },
  {
    id: "rocket_salad",
    name: "סלט רוקט",
    description: "רוקט, פטרוזיליה, מלפפון, כף שמן זית וקצת מלח",
    preferredSlot: "lunch",
    items: [
      {
        name: "רוקט",
        category: "vegetable",
        kcalPer100: 25,
        proteinPer100: 2.6,
        carbsPer100: 3.7,
        fatPer100: 0.7,
        defaultUnit: "g",
        gramsPerUnit: 40,
        quantity: 60,
        unit: "g"
      },
      {
        name: "פטרוזיליה",
        category: "vegetable",
        kcalPer100: 36,
        proteinPer100: 3,
        carbsPer100: 6.3,
        fatPer100: 0.8,
        defaultUnit: "g",
        gramsPerUnit: 30,
        quantity: 20,
        unit: "g"
      },
      {
        name: "מלפפון",
        category: "vegetable",
        kcalPer100: 15,
        proteinPer100: 0.7,
        carbsPer100: 3.6,
        fatPer100: 0.1,
        defaultUnit: "unit",
        gramsPerUnit: 120,
        quantity: 1.5,
        unit: "unit"
      },
      {
        name: "שמן זית",
        category: "fat",
        kcalPer100: 884,
        proteinPer100: 0,
        carbsPer100: 0,
        fatPer100: 100,
        defaultUnit: "g",
        gramsPerUnit: 13,
        quantity: 1,
        unit: "tbsp"
      },
      {
        name: "מלח",
        category: "mixed",
        kcalPer100: 0,
        proteinPer100: 0,
        carbsPer100: 0,
        fatPer100: 0,
        defaultUnit: "g",
        gramsPerUnit: 6,
        quantity: 0.2,
        unit: "tsp"
      }
    ]
  },
  {
    id: "rocket_salad_egg",
    name: "סלט רוקט + ביצה קשה",
    description: "אותו סלט בתוספת ביצה קשה",
    preferredSlot: "lunch",
    items: [
      {
        name: "רוקט",
        category: "vegetable",
        kcalPer100: 25,
        proteinPer100: 2.6,
        carbsPer100: 3.7,
        fatPer100: 0.7,
        defaultUnit: "g",
        gramsPerUnit: 40,
        quantity: 60,
        unit: "g"
      },
      {
        name: "פטרוזיליה",
        category: "vegetable",
        kcalPer100: 36,
        proteinPer100: 3,
        carbsPer100: 6.3,
        fatPer100: 0.8,
        defaultUnit: "g",
        gramsPerUnit: 30,
        quantity: 20,
        unit: "g"
      },
      {
        name: "מלפפון",
        category: "vegetable",
        kcalPer100: 15,
        proteinPer100: 0.7,
        carbsPer100: 3.6,
        fatPer100: 0.1,
        defaultUnit: "unit",
        gramsPerUnit: 120,
        quantity: 1.5,
        unit: "unit"
      },
      {
        name: "שמן זית",
        category: "fat",
        kcalPer100: 884,
        proteinPer100: 0,
        carbsPer100: 0,
        fatPer100: 100,
        defaultUnit: "g",
        gramsPerUnit: 13,
        quantity: 1,
        unit: "tbsp"
      },
      {
        name: "ביצה קשה",
        category: "protein",
        kcalPer100: 143,
        proteinPer100: 12.6,
        carbsPer100: 0.7,
        fatPer100: 9.5,
        defaultUnit: "unit",
        gramsPerUnit: 50,
        quantity: 1,
        unit: "unit"
      }
    ]
  }
];

const INGREDIENT_FAVORITE_PREFIX = "ingredient:";

function ingredientFavoriteId(ingredientId: string) {
  return `${INGREDIENT_FAVORITE_PREFIX}${ingredientId}`;
}

function parseIngredientFavoriteId(favoriteId: string) {
  if (!favoriteId.startsWith(INGREDIENT_FAVORITE_PREFIX)) return null;
  const ingredientId = favoriteId.slice(INGREDIENT_FAVORITE_PREFIX.length).trim();
  return ingredientId || null;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function mealSlotByHour() {
  const hour = new Date().getHours();
  if (hour < 12) return "breakfast" as MealSlot;
  if (hour < 17) return "lunch" as MealSlot;
  return "dinner" as MealSlot;
}

function sameIngredientName(a: string, b: string) {
  return normalizeIngredientText(a) === normalizeIngredientText(b);
}

function normalizeIngredientText(value: string) {
  return value
    .toLowerCase()
    .replace(/['"`׳"]/g, "")
    .replace(/[.,/\\()\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeIngredientText(value: string) {
  return normalizeIngredientText(value)
    .split(" ")
    .filter((token) => token.length > 1);
}

function dayWindow(date: string) {
  return {
    from: `${date}T00:00:00.000Z`,
    to: `${addDaysISO(date, 1)}T00:00:00.000Z`
  };
}

function summarizeDay(date: string) {
  const { from, to } = dayWindow(date);
  const workouts = getWorkoutsBetween(from, to);
  const workoutLoad = workouts.reduce((sum, w) => sum + w.tssLike, 0);
  const runMinutes = workouts.filter((w) => w.sport === "run").reduce((sum, w) => sum + w.durationSec / 60, 0);
  const runKm = workouts.filter((w) => w.sport === "run").reduce((sum, w) => sum + (w.distanceM ?? 0) / 1000, 0);
  return { workoutLoad, runMinutes, runKm, workoutsCount: workouts.length };
}

function describeDayType(load: number) {
  if (load >= 95) return "high" as const;
  if (load >= 55) return "normal" as const;
  return "recovery" as const;
}

function computeTargets(date: string) {
  const { workoutLoad, runMinutes, runKm, workoutsCount } = summarizeDay(date);
  const dayType = describeDayType(workoutLoad);

  const carbsBase = dayType === "high" ? 380 : dayType === "normal" ? 300 : 230;
  const carbsG = Math.round(clamp(carbsBase + runKm * 6 + runMinutes * 0.6, 180, 620));
  const proteinG = Math.round(clamp(130 + (workoutLoad >= 75 ? 15 : 0), 110, 210));
  const fatG = Math.round(clamp(dayType === "high" ? 70 : dayType === "normal" ? 78 : 85, 55, 110));
  const totalKcal = Math.round(proteinG * 4 + carbsG * 4 + fatG * 9);
  const hydrationMl = Math.round(clamp(2200 + runMinutes * 11 + (dayType === "high" ? 600 : 250), 1800, 5500));

  const preWorkoutNote =
    workoutsCount > 0
      ? dayType === "high"
        ? "לפני אימון עצים: פחמימה זמינה 60-90 דק' לפני, ונוזלים מספקים."
        : "לפני אימון: ארוחה קלה עם פחמימה קלה לעיכול ונוזלים."
      : "אין אימון מתועד להיום: שמור תזונה מאוזנת ונוזלים לאורך היום.";

  const postWorkoutNote =
    workoutsCount > 0
      ? "אחרי אימון: יעד חלבון 25-35 גרם + פחמימה לשיקום גליקוגן בתוך 1-2 שעות."
      : "יום ללא אימון: מיקוד בהתאוששות כללית ושינה איכותית.";

  upsertNutritionEvent(date, workoutLoad, runMinutes, runKm);

  return {
    date,
    carbsG,
    proteinG,
    fatG,
    totalKcal,
    hydrationMl,
    preWorkoutNote,
    postWorkoutNote,
    rationaleJson: JSON.stringify({
      dayType,
      workoutLoad: Math.round(workoutLoad),
      runMinutes: Math.round(runMinutes),
      runKm: round(runKm, 1)
    })
  };
}

function macroForGrams(ingredient: NutritionIngredient, grams: number) {
  const base = Math.max(0, grams) / 100;
  return {
    kcal: round(ingredient.kcalPer100 * base, 0),
    proteinG: round(ingredient.proteinPer100 * base, 1),
    carbsG: round(ingredient.carbsPer100 * base, 1),
    fatG: round(ingredient.fatPer100 * base, 1)
  };
}

function slotTitle(slot: MealSlot) {
  if (slot === "breakfast") return "ארוחת בוקר";
  if (slot === "pre_run") return "מזון לפני ריצה";
  if (slot === "lunch") return "ארוחת צהריים";
  if (slot === "dinner") return "ארוחת ערב";
  if (slot === "drinks") return "שתייה";
  return "נשנוש";
}

const allMealSlots: MealSlot[] = ["breakfast", "pre_run", "lunch", "dinner", "snack"];

const slotKcalShare: Record<MealSlot, number> = {
  breakfast: 0.23,
  pre_run: 0.13,
  lunch: 0.3,
  dinner: 0.24,
  snack: 0.1,
  drinks: 0
};

function slotCategoryScores(slot: MealSlot, ingredient: NutritionIngredient) {
  const name = ingredient.name;
  if (slot === "breakfast") {
    let score =
      ingredient.category === "fruit"
        ? 1.35
        : ingredient.category === "dairy"
          ? 1.3
          : ingredient.category === "carb"
            ? 1.15
            : ingredient.category === "protein"
              ? 1.05
              : ingredient.category === "fat"
                ? 0.8
                : ingredient.category === "vegetable"
                  ? 0.75
                  : 0.6;
    if (name.includes("פסטה") || name.includes("אורז")) score -= 0.5;
    return score;
  }
  if (slot === "pre_run") {
    let score =
      ingredient.category === "fruit"
        ? 1.4
        : ingredient.category === "carb"
          ? 1.35
          : ingredient.category === "dairy"
            ? 1.05
            : ingredient.category === "hydration"
              ? 0.95
              : ingredient.category === "protein"
                ? 0.82
                : ingredient.category === "fat"
                  ? 0.45
                  : ingredient.category === "vegetable"
                    ? 0.4
                    : 0.65;
    if (name.includes("אבוקדו") || name.includes("שקדים") || name.includes("טחינה")) score -= 0.35;
    if (name.includes("פסטה") || name.includes("אורז")) score -= 0.2;
    return score;
  }
  if (slot === "lunch" || slot === "dinner") {
    return ingredient.category === "protein"
      ? 1.4
      : ingredient.category === "carb"
        ? 1.25
        : ingredient.category === "vegetable"
          ? 1.15
          : ingredient.category === "fat"
            ? 0.9
            : ingredient.category === "fruit"
              ? 0.65
              : 0.8;
  }
  return ingredient.category === "fruit"
    ? 1.25
    : ingredient.category === "dairy"
      ? 1.2
      : ingredient.category === "fat"
        ? 1.1
        : ingredient.category === "protein"
          ? 1.0
          : ingredient.category === "carb"
            ? 0.9
            : 0.6;
}

function defaultPortionGrams(slot: MealSlot, ingredient: NutritionIngredient) {
  if (slot === "breakfast") {
    if (ingredient.category === "carb") return 60;
    if (ingredient.category === "protein" || ingredient.category === "dairy") return 120;
    if (ingredient.category === "fruit") return 140;
    return 40;
  }
  if (slot === "pre_run") {
    if (ingredient.category === "carb") return 55;
    if (ingredient.category === "fruit") return 120;
    if (ingredient.category === "dairy") return 130;
    if (ingredient.category === "hydration") return 350;
    if (ingredient.category === "protein") return 80;
    if (ingredient.category === "fat") return 12;
    return 50;
  }
  if (slot === "lunch" || slot === "dinner") {
    if (ingredient.category === "protein") return 170;
    if (ingredient.category === "carb") return 160;
    if (ingredient.category === "vegetable") return 160;
    if (ingredient.category === "fat") return 20;
    return 80;
  }
  if (ingredient.category === "fruit") return 130;
  if (ingredient.category === "dairy") return 150;
  if (ingredient.category === "fat") return 18;
  return 70;
}

function toQuantityUnit(grams: number, ingredient: NutritionIngredient) {
  if (ingredient.defaultUnit === "unit") {
    const rawQuantity = grams / Math.max(1, ingredient.gramsPerUnit);
    const quantity = clamp(Math.round(rawQuantity), 1, 6);
    return { quantity, unit: "unit" as NutritionUnit };
  }
  if (ingredient.defaultUnit === "ml") {
    return { quantity: round(grams, 0), unit: "ml" as NutritionUnit };
  }
  return { quantity: round(grams, 0), unit: "g" as NutritionUnit };
}

function maxPortionGrams(slot: MealSlot, ingredient: NutritionIngredient) {
  if (slot === "breakfast") {
    if (ingredient.category === "fruit") return 180;
    if (ingredient.category === "dairy") return 250;
    if (ingredient.category === "protein") return ingredient.name.includes("ביצה") ? 160 : 180;
    if (ingredient.category === "carb") return isHeavyBreakfastIngredient(ingredient.name) ? 90 : 110;
    if (ingredient.category === "fat") return 30;
    return 140;
  }
  if (slot === "pre_run") {
    if (ingredient.category === "fruit") return 160;
    if (ingredient.category === "carb") return 95;
    if (ingredient.category === "dairy") return 180;
    if (ingredient.category === "hydration") return 500;
    if (ingredient.category === "protein") return 120;
    if (ingredient.category === "fat") return 20;
    return 110;
  }
  if (slot === "lunch" || slot === "dinner") {
    if (ingredient.category === "protein") return ingredient.name.includes("ביצה") ? 150 : 220;
    if (ingredient.category === "carb") return 230;
    if (ingredient.category === "vegetable") return 260;
    if (ingredient.category === "fat") return 35;
    if (ingredient.category === "fruit") return 170;
    return 220;
  }
  if (ingredient.category === "fruit") return 160;
  if (ingredient.category === "dairy") return 180;
  if (ingredient.category === "fat") return 25;
  if (ingredient.category === "carb") return 90;
  return 130;
}

function minPortionGrams(slot: MealSlot, ingredient: NutritionIngredient) {
  if (ingredient.category === "fat") return 8;
  if (slot === "pre_run") return ingredient.category === "hydration" ? 200 : 30;
  if (slot === "snack") return 35;
  return 45;
}

function isHeavyBreakfastIngredient(name: string) {
  return name.includes("פסטה") || name.includes("אורז");
}

function hasBreakfastFriendlyAlternative(ingredients: NutritionIngredient[]) {
  return ingredients.some(
    (ing) =>
      !isHeavyBreakfastIngredient(ing.name) &&
      (ing.category === "dairy" || ing.category === "protein" || ing.category === "fruit" || ing.category === "carb")
  );
}

function mealTotals(items: NutritionMealItem[]) {
  return {
    totalKcal: round(items.reduce((sum, item) => sum + item.kcal, 0), 0),
    proteinG: round(items.reduce((sum, item) => sum + item.proteinG, 0), 1),
    carbsG: round(items.reduce((sum, item) => sum + item.carbsG, 0), 1),
    fatG: round(items.reduce((sum, item) => sum + item.fatG, 0), 1)
  };
}

type ScoredCandidate = {
  ingredient: NutritionIngredient;
  pantry: NutritionPantryItem | undefined;
  score: number;
};

function pickFirst(
  scored: ScoredCandidate[],
  usedIds: Set<string>,
  predicate: (candidate: ScoredCandidate) => boolean
) {
  const found = scored.find((candidate) => !usedIds.has(candidate.ingredient.id) && predicate(candidate));
  if (!found) return null;
  usedIds.add(found.ingredient.id);
  return found;
}

function selectCandidatesForSlot(slot: MealSlot, scored: ScoredCandidate[]) {
  const selected: ScoredCandidate[] = [];
  const usedIds = new Set<string>();
  const maxItems = slot === "snack" || slot === "pre_run" ? 2 : 3;
  const push = (candidate: ScoredCandidate | null) => {
    if (candidate) selected.push(candidate);
  };

  if (slot === "breakfast") {
    push(pickFirst(scored, usedIds, (c) => c.ingredient.category === "dairy" || c.ingredient.category === "protein"));
    push(pickFirst(scored, usedIds, (c) => c.ingredient.category === "carb" && !isHeavyBreakfastIngredient(c.ingredient.name)));
    push(pickFirst(scored, usedIds, (c) => c.ingredient.category === "fruit"));
    if (selected.length < maxItems) {
      push(pickFirst(scored, usedIds, (c) => c.ingredient.category === "carb"));
    }
  } else if (slot === "pre_run") {
    push(pickFirst(scored, usedIds, (c) => c.ingredient.category === "carb"));
    push(pickFirst(scored, usedIds, (c) => c.ingredient.category === "fruit" || c.ingredient.category === "dairy"));
  } else if (slot === "lunch" || slot === "dinner") {
    push(pickFirst(scored, usedIds, (c) => c.ingredient.category === "protein"));
    push(pickFirst(scored, usedIds, (c) => c.ingredient.category === "carb"));
    push(pickFirst(scored, usedIds, (c) => c.ingredient.category === "vegetable"));
  } else {
    push(pickFirst(scored, usedIds, (c) => c.ingredient.category === "fruit" || c.ingredient.category === "dairy"));
    push(pickFirst(scored, usedIds, (c) => c.ingredient.category === "protein" || c.ingredient.category === "fat"));
  }

  for (const candidate of scored) {
    if (selected.length >= maxItems) break;
    if (usedIds.has(candidate.ingredient.id)) continue;
    if (
      (slot === "lunch" || slot === "dinner") &&
      candidate.ingredient.category === "protein" &&
      selected.some((item) => item.ingredient.category === "protein")
    ) {
      continue;
    }
    if (
      slot === "breakfast" &&
      candidate.ingredient.category === "fruit" &&
      selected.some((item) => item.ingredient.category === "fruit")
    ) {
      continue;
    }
    selected.push(candidate);
    usedIds.add(candidate.ingredient.id);
  }

  return selected.slice(0, maxItems);
}

function scaleMealItemsToTargetKcal(
  slot: MealSlot,
  items: NutritionMealItem[],
  targetKcal: number,
  ingredientById: Map<string, NutritionIngredient>
) {
  const totals = mealTotals(items);
  if (!items.length || totals.totalKcal <= 0 || targetKcal <= 0) return items;
  const factor = clamp(targetKcal / totals.totalKcal, slot === "breakfast" ? 0.85 : 0.75, slot === "breakfast" ? 1.2 : 1.35);

  return items.map((item) => {
    const ingredient = ingredientById.get(item.ingredientId);
    if (!ingredient) return item;
    const scaledGrams = round(
      clamp(item.grams * factor, minPortionGrams(slot, ingredient), maxPortionGrams(slot, ingredient)),
      0
    );
    const macros = macroForGrams(ingredient, scaledGrams);
    const { quantity, unit } = toQuantityUnit(scaledGrams, ingredient);
    return {
      ...item,
      grams: scaledGrams,
      quantity,
      unit,
      kcal: macros.kcal,
      proteinG: macros.proteinG,
      carbsG: macros.carbsG,
      fatG: macros.fatG
    } satisfies NutritionMealItem;
  });
}

function buildMealPlan(
  date: string,
  ingredients: NutritionIngredient[],
  pantryItems: NutritionPantryItem[],
  preferenceMap: Map<string, number>,
  targetKcal: number,
  slots: MealSlot[] = allMealSlots
) {
  const pantryByIngredientId = new Map<string, NutritionPantryItem>();
  for (const item of pantryItems) pantryByIngredientId.set(item.ingredientId, item);
  const ingredientById = new Map<string, NutritionIngredient>(ingredients.map((item) => [item.id, item]));

  const candidates = pantryItems.length
    ? ingredients.filter((ing) => pantryByIngredientId.has(ing.id))
    : ingredients;

  const meals: NutritionMeal[] = [];

  for (const slot of slots) {
    const scored = candidates
      .map((ingredient) => {
        const pantry = pantryByIngredientId.get(ingredient.id);
        const pantryBoost = pantry ? 0.55 : 0;
        const pref = preferenceMap.get(`${ingredient.id}|${slot}`) ?? 0;
        const score = slotCategoryScores(slot, ingredient) + pref * 0.2 + pantryBoost;
        return { ingredient, pantry, score };
      })
      .sort((a, b) => b.score - a.score);

    const picked = selectCandidatesForSlot(slot, scored);
    const baseItems: NutritionMealItem[] = picked.map(({ ingredient, pantry }) => {
      const grams = pantry?.gramsEffective ?? defaultPortionGrams(slot, ingredient);
      const macros = macroForGrams(ingredient, grams);
      const { quantity, unit } = pantry
        ? { quantity: pantry.quantity, unit: pantry.unit }
        : toQuantityUnit(grams, ingredient);
      return {
        ingredientId: ingredient.id,
        name: ingredient.name,
        grams: round(grams, 0),
        quantity,
        unit,
        kcal: macros.kcal,
        proteinG: macros.proteinG,
        carbsG: macros.carbsG,
        fatG: macros.fatG
      };
    });

    const scaledItems =
      pantryItems.length > 0
        ? baseItems
        : scaleMealItemsToTargetKcal(slot, baseItems, Math.round(targetKcal * slotKcalShare[slot]), ingredientById);
    const totals = mealTotals(scaledItems);
    const compromiseNote =
      slot === "breakfast" &&
      scaledItems.some((item) => isHeavyBreakfastIngredient(item.name)) &&
      !hasBreakfastFriendlyAlternative(candidates)
        ? "פשרה: אין כרגע בפנטרי חלופות בוקר טובות יותר, לכן שובצה ארוחה כבדה יחסית."
        : undefined;

    meals.push({
      id: `${date}:${slot}`,
      date,
      slot,
      title: slotTitle(slot),
      items: scaledItems,
      totalKcal: totals.totalKcal,
      proteinG: totals.proteinG,
      carbsG: totals.carbsG,
      fatG: totals.fatG,
      compromiseNote,
      accepted: null
    });
  }

  return meals;
}

function parseRationale(raw: string | null | undefined) {
  try {
    return JSON.parse(raw || "{}") as Record<string, unknown>;
  } catch {
    return {} as Record<string, unknown>;
  }
}

function targetMacrosFromPlan(plan: NutritionDailyPlan) {
  const rationale = parseRationale(plan.rationaleJson);
  const targetKcalRaw = typeof rationale.targetKcal === "number" ? rationale.targetKcal : null;
  const targetProteinRaw = typeof rationale.targetProteinG === "number" ? rationale.targetProteinG : null;
  const targetCarbsRaw = typeof rationale.targetCarbsG === "number" ? rationale.targetCarbsG : null;
  const targetFatRaw = typeof rationale.targetFatG === "number" ? rationale.targetFatG : null;

  const kcalFallback =
    typeof plan.totalKcal === "number" && Number.isFinite(plan.totalKcal)
      ? plan.totalKcal
      : Math.round(plan.proteinG * 4 + plan.carbsG * 4 + plan.fatG * 9);

  return {
    kcal: Math.max(0, Math.round(targetKcalRaw ?? kcalFallback)),
    proteinG: Math.max(0, round(targetProteinRaw ?? plan.proteinG, 1)),
    carbsG: Math.max(0, round(targetCarbsRaw ?? plan.carbsG, 1)),
    fatG: Math.max(0, round(targetFatRaw ?? plan.fatG, 1))
  };
}

function emptySuggestionsBySlot(): NutritionSuggestionBySlot {
  return {
    breakfast: [],
    pre_run: [],
    lunch: [],
    dinner: [],
    snack: [],
    drinks: []
  };
}

function macroNeedBoost(
  ingredient: NutritionIngredient,
  remaining: { kcal: number; proteinG: number; carbsG: number; fatG: number }
) {
  let boost = 0;
  if (remaining.proteinG > 8 && (ingredient.category === "protein" || ingredient.category === "dairy")) {
    boost += 0.75;
  }
  if (remaining.carbsG > 18 && (ingredient.category === "carb" || ingredient.category === "fruit")) {
    boost += 0.75;
  }
  if (remaining.fatG > 6 && ingredient.category === "fat") {
    boost += 0.45;
  }
  if (remaining.kcal < -120 && ingredient.kcalPer100 > 220) {
    boost -= 0.5;
  }
  return boost;
}

function suggestionReason(
  slot: MealSlot,
  ingredient: NutritionIngredient,
  remaining: { proteinG: number; carbsG: number; fatG: number; kcal: number },
  daySummary: ReturnType<typeof summarizeDay>
) {
  if (slot === "pre_run" && daySummary.runMinutes > 0) {
    return "השלמה חכמה אחרי אימון";
  }
  if (remaining.proteinG > remaining.carbsG && (ingredient.category === "protein" || ingredient.category === "dairy")) {
    return "חיזוק חלבון ליעד היומי";
  }
  if (remaining.carbsG > remaining.proteinG && (ingredient.category === "carb" || ingredient.category === "fruit")) {
    return "השלמת פחמימה זמינה";
  }
  if (ingredient.category === "hydration") {
    return "תמיכת נוזלים";
  }
  if (remaining.kcal < -60) {
    return "איזון עומס קלורי";
  }
  return "תוספת מומלצת ליעד היומי";
}

function buildSuggestionsBySlot(
  date: string,
  plan: NutritionDailyPlan,
  meals: NutritionMeal[],
  totals: { kcal: number; proteinG: number; carbsG: number; fatG: number }
) {
  const ingredients = listNutritionIngredients();
  if (!ingredients.length) return emptySuggestionsBySlot();

  const bySlot = emptySuggestionsBySlot();
  const pantryItems = getNutritionPantryItems(date);
  const pantryByIngredientId = new Set(pantryItems.map((item) => item.ingredientId));
  const preferenceMap = getNutritionPreferenceMap();
  const daySummary = summarizeDay(date);
  const target = targetMacrosFromPlan(plan);
  const remaining = {
    kcal: round(target.kcal - totals.kcal, 0),
    proteinG: round(target.proteinG - totals.proteinG, 1),
    carbsG: round(target.carbsG - totals.carbsG, 1),
    fatG: round(target.fatG - totals.fatG, 1)
  };

  for (const slot of allMealSlots) {
    const existingMeal = meals.find((meal) => meal.slot === slot) ?? null;
    const existingIds = new Set(existingMeal?.items.map((item) => item.ingredientId) ?? []);
    const scored = ingredients
      .filter((ingredient) => !existingIds.has(ingredient.id))
      .map((ingredient) => {
        const pref = preferenceMap.get(`${ingredient.id}|${slot}`) ?? 0;
        const pantryBoost = pantryByIngredientId.has(ingredient.id) ? 0.6 : 0;
        const needBoost = macroNeedBoost(ingredient, remaining);
        const runBias =
          slot === "pre_run" && daySummary.runMinutes <= 0 && ingredient.category === "hydration" ? -0.25 : 0;
        const score = slotCategoryScores(slot, ingredient) + pref * 0.22 + pantryBoost + needBoost + runBias;
        return { ingredient, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    bySlot[slot] = scored.map(({ ingredient }, index) => {
      const kcalScale = remaining.kcal < 180 ? 0.82 : remaining.kcal > 780 ? 1.15 : 1;
      const grams = round(
        clamp(defaultPortionGrams(slot, ingredient) * kcalScale, minPortionGrams(slot, ingredient), maxPortionGrams(slot, ingredient)),
        0
      );
      const { quantity, unit } = toQuantityUnit(grams, ingredient);
      return {
        id: `${slot}:${ingredient.id}:${index}`,
        slot,
        favoriteId: ingredientFavoriteId(ingredient.id),
        ingredientId: ingredient.id,
        name: ingredient.name,
        quantity,
        unit,
        reason: suggestionReason(slot, ingredient, remaining, daySummary),
        macros: macroForGrams(ingredient, grams)
      } satisfies NutritionSlotSuggestion;
    });
  }

  return bySlot;
}

function buildPlanOnly(date: string) {
  const basePlan = computeTargets(date);
  const pantryItems = getNutritionPantryItems(date);
  const meals = getNutritionMealsByDate(date);
  const currentPlan = getNutritionPlan(date);
  const rationale = parseRationale(currentPlan?.rationaleJson);
  const baseRationale = parseRationale(basePlan.rationaleJson);

  const plan: NutritionDailyPlan = {
    ...basePlan,
    rationaleJson: JSON.stringify({
      ...rationale,
      ...baseRationale,
      targetKcal: basePlan.totalKcal,
      targetProteinG: basePlan.proteinG,
      targetCarbsG: basePlan.carbsG,
      targetFatG: basePlan.fatG,
      basedOnPantry: pantryItems.length > 0,
      generatedMeals: meals.length
    }),
    updatedAt: new Date().toISOString()
  };

  upsertNutritionDailyPlan(plan);
  return plan;
}

export function recalculateNutritionFrom(date = formatISODate(), days = 8) {
  const out: Array<{ plan: NutritionDailyPlan; meals: NutritionMeal[] }> = [];
  for (let i = 0; i < days; i += 1) {
    const d = addDaysISO(date, i);
    const plan = buildPlanOnly(d);
    const meals = getNutritionMealsToday(d);
    out.push({ plan, meals });
  }
  return out;
}

export function getNutritionToday(date = formatISODate()) {
  const existing = getNutritionPlan(date);
  if (existing) return existing;
  return buildPlanOnly(date);
}

export function getNutritionMealsToday(date = formatISODate()) {
  const existing = getNutritionMealsByDate(date);
  const activeSlots = new Set(getActiveNutritionMealSlots(date));
  if (!activeSlots.size) return [];
  return existing.filter((meal) => activeSlots.has(meal.slot));
}

export function getNutritionForecast(date = formatISODate(), days = 7) {
  recalculateNutritionFrom(date, days);
  const out: NutritionDailyPlan[] = [];
  for (let i = 0; i < days; i += 1) {
    const d = addDaysISO(date, i);
    const existing = getNutritionPlan(d);
    if (existing) out.push(existing);
  }
  return out;
}

export function getNutritionDayBundle(date = formatISODate()) {
  const plan = getNutritionToday(date);
  const meals = getNutritionMealsToday(date);
  const acceptedTotals = meals
    .filter((meal) => meal.accepted === true)
    .reduce(
      (acc, meal) => {
        acc.kcal += meal.totalKcal;
        acc.proteinG += meal.proteinG;
        acc.carbsG += meal.carbsG;
        acc.fatG += meal.fatG;
        return acc;
      },
      { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }
    );
  return {
    date,
    plan,
    meals,
    totals: {
      kcal: round(acceptedTotals.kcal, 0),
      proteinG: round(acceptedTotals.proteinG, 1),
      carbsG: round(acceptedTotals.carbsG, 1),
      fatG: round(acceptedTotals.fatG, 1)
    },
    suggestedBySlot: buildSuggestionsBySlot(date, plan, meals, {
      kcal: round(acceptedTotals.kcal, 0),
      proteinG: round(acceptedTotals.proteinG, 1),
      carbsG: round(acceptedTotals.carbsG, 1),
      fatG: round(acceptedTotals.fatG, 1)
    })
  };
}

export function getNutritionPantryBundle(date = formatISODate()) {
  return {
    date,
    ingredients: listNutritionIngredients(),
    items: getNutritionPantryItems(date)
  };
}

export function listNutritionFavorites() {
  const staticFavorites = nutritionFavorites.map((favorite) => {
    const allIngredients = listNutritionIngredients();
    const previewItems: NutritionMealItem[] = [];
    for (const item of favorite.items) {
      const ingredient = ensureFavoriteIngredient(item, allIngredients);
      if (!ingredient) continue;
      const grams = nutritionQuantityToGrams(item.quantity, item.unit, ingredient);
      const macros = macroForGrams(ingredient, grams);
      previewItems.push({
        ingredientId: ingredient.id,
        name: ingredient.name,
        grams: round(grams, 0),
        quantity: round(item.quantity, item.unit === "unit" ? 1 : 1),
        unit: item.unit,
        kcal: macros.kcal,
        proteinG: macros.proteinG,
        carbsG: macros.carbsG,
        fatG: macros.fatG
      });
    }
    const totals = mealTotals(previewItems);
    return {
      id: favorite.id,
      name: favorite.name,
      description: favorite.description,
      preferredSlot: favorite.preferredSlot ?? null,
      preview: {
        baseQuantity: 1,
        baseUnit: "unit" as NutritionUnit,
        kcal: totals.totalKcal,
        proteinG: totals.proteinG,
        carbsG: totals.carbsG,
        fatG: totals.fatG
      }
    };
  });
  const ingredients = new Map(listNutritionIngredients().map((ingredient) => [ingredient.id, ingredient]));
  const ingredientFavorites = listNutritionFavoriteIngredientIds()
    .map((ingredientId) => ingredients.get(ingredientId))
    .filter((ingredient): ingredient is NutritionIngredient => Boolean(ingredient))
    .map((ingredient) => {
      const defaultUnit = ingredient.defaultUnit;
      const defaultQuantity =
        defaultUnit === "unit"
          ? 1
          : defaultUnit === "ml"
            ? Math.max(1, ingredient.gramsPerUnit)
            : ingredient.gramsPerUnit;
      const grams = nutritionQuantityToGrams(defaultQuantity, defaultUnit, ingredient);
      const macros = macroForGrams(ingredient, grams);
      return {
        id: ingredientFavoriteId(ingredient.id),
        name: ingredient.name,
        description: "מצרך מועדף אישי",
        preferredSlot: null as MealSlot | null,
        preview: {
          baseQuantity: round(defaultQuantity, defaultUnit === "unit" ? 0 : 1),
          baseUnit: defaultUnit,
          kcal: macros.kcal,
          proteinG: macros.proteinG,
          carbsG: macros.carbsG,
          fatG: macros.fatG
        }
      };
    });
  return [...staticFavorites, ...ingredientFavorites];
}

// Used by cloud endpoints: get the raw template definition (no SQLite lookups / previews).
export function getNutritionFavoriteTemplateById(favoriteId: string): NutritionFavoriteTemplate | null {
  return nutritionFavorites.find((favorite) => favorite.id === favoriteId) ?? null;
}

export function listFavoriteIngredientIds() {
  return listNutritionFavoriteIngredientIds();
}

export function toggleIngredientFavorite(ingredientId: string, favorite?: boolean) {
  const favoriteIds = new Set(listNutritionFavoriteIngredientIds());
  const nextFavorite = typeof favorite === "boolean" ? favorite : !favoriteIds.has(ingredientId);
  const updated = setNutritionIngredientFavorite(ingredientId, nextFavorite);
  if (updated == null) return null;
  return {
    ingredientId,
    favorite: updated,
    favoriteIds: listNutritionFavoriteIngredientIds()
  };
}

function mergeMealItems(items: NutritionMealItem[]) {
  const merged = new Map<string, NutritionMealItem>();
  for (const item of items) {
    const key = `${item.ingredientId}|${item.unit}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...item });
      continue;
    }
    const nextQuantity = round(existing.quantity + item.quantity, item.unit === "unit" ? 1 : 1);
    merged.set(key, {
      ...existing,
      grams: round(existing.grams + item.grams, 0),
      quantity: nextQuantity,
      kcal: round(existing.kcal + item.kcal, 0),
      proteinG: round(existing.proteinG + item.proteinG, 1),
      carbsG: round(existing.carbsG + item.carbsG, 1),
      fatG: round(existing.fatG + item.fatG, 1)
    });
  }
  return Array.from(merged.values());
}

function ensureFavoriteIngredient(item: FavoriteIngredientTemplate, existing: NutritionIngredient[]) {
  const found = existing.find((ingredient) => sameIngredientName(ingredient.name, item.name));
  if (found) return found;

  const created = createNutritionIngredient({
    name: item.name,
    category: item.category,
    kcalPer100: item.kcalPer100,
    proteinPer100: item.proteinPer100,
    carbsPer100: item.carbsPer100,
    fatPer100: item.fatPer100,
    defaultUnit: item.defaultUnit,
    gramsPerUnit: item.gramsPerUnit
  });
  if (!created) return null;
  existing.push(created);
  return created;
}

function favoriteMealSlot(template: NutritionFavoriteTemplate, slot?: MealSlot) {
  void template;
  return slot ?? mealSlotByHour();
}

export function addFavoriteToNutritionDay(
  date: string,
  favoriteId: string,
  slot?: MealSlot,
  options?: { quantity?: number; unit?: NutritionUnit }
) {
  const ingredientIdFromFavorite = parseIngredientFavoriteId(favoriteId);
  if (ingredientIdFromFavorite) {
    const ingredient = listNutritionIngredients().find((entry) => entry.id === ingredientIdFromFavorite);
    if (!ingredient) return null;
    const targetSlot = slot ?? mealSlotByHour();
    const unit = options?.unit ?? ingredient.defaultUnit;
    const fallbackQuantity =
      ingredient.defaultUnit === "unit"
        ? 1
        : ingredient.defaultUnit === "ml"
          ? Math.max(1, ingredient.gramsPerUnit)
          : ingredient.gramsPerUnit;
    const quantity =
      options?.quantity != null && Number.isFinite(options.quantity) && options.quantity > 0
        ? options.quantity
        : fallbackQuantity;
    const grams = nutritionQuantityToGrams(quantity, unit, ingredient);
    const macros = macroForGrams(ingredient, grams);
    const mappedItems: NutritionMealItem[] = [
      {
        ingredientId: ingredient.id,
        name: ingredient.name,
        grams: round(grams, 0),
        quantity: round(quantity, unit === "unit" ? 1 : 1),
        unit,
        kcal: macros.kcal,
        proteinG: macros.proteinG,
        carbsG: macros.carbsG,
        fatG: macros.fatG
      }
    ];
    const meals = getNutritionMealsByDate(date);
    const existingMeal = meals.find((meal) => meal.slot === targetSlot);
    const nextMeals = existingMeal
      ? meals.map((meal) => {
          if (meal.id !== existingMeal.id) return meal;
          const mergedItems = mergeMealItems([...meal.items, ...mappedItems]);
          const totals = mealTotals(mergedItems);
          return {
            ...meal,
            title: slotTitle(targetSlot),
            items: mergedItems,
            totalKcal: totals.totalKcal,
            proteinG: totals.proteinG,
            carbsG: totals.carbsG,
            fatG: totals.fatG,
            accepted: true
          } satisfies NutritionMeal;
        })
      : [
          ...meals,
          {
            id: `${date}:${targetSlot}`,
            date,
            slot: targetSlot,
            title: slotTitle(targetSlot),
            items: mappedItems,
            ...mealTotals(mappedItems),
            compromiseNote: undefined,
            accepted: true
          } satisfies NutritionMeal
        ];
    activateNutritionMealSlot(date, targetSlot);
    const updated = persistMealsForDate(date, nextMeals, "manualMealEditAt");
    return {
      date,
      slot: targetSlot,
      favorite: {
        id: favoriteId,
        name: ingredient.name,
        description: "מצרך מועדף אישי"
      },
      meal: updated.meals.find((meal) => meal.slot === targetSlot) ?? null,
      totals: updated.totals
    };
  }

  const template = nutritionFavorites.find((favorite) => favorite.id === favoriteId);
  if (!template) return null;
  const portionFactor =
    options?.quantity != null && Number.isFinite(options.quantity) && options.quantity > 0 ? options.quantity : 1;

  const allIngredients = listNutritionIngredients();
  const mappedItems: NutritionMealItem[] = [];
  for (const sourceItem of template.items) {
    const ingredient = ensureFavoriteIngredient(sourceItem, allIngredients);
    if (!ingredient) continue;
    const scaledQuantity = sourceItem.quantity * portionFactor;
    const grams = nutritionQuantityToGrams(scaledQuantity, sourceItem.unit, ingredient);
    const macros = macroForGrams(ingredient, grams);
    mappedItems.push({
      ingredientId: ingredient.id,
      name: ingredient.name,
      grams: round(grams, 0),
      quantity: round(scaledQuantity, sourceItem.unit === "unit" ? 1 : 1),
      unit: sourceItem.unit,
      kcal: macros.kcal,
      proteinG: macros.proteinG,
      carbsG: macros.carbsG,
      fatG: macros.fatG
    });
  }

  if (!mappedItems.length) return null;

  const targetSlot = favoriteMealSlot(template, slot);
  const meals = getNutritionMealsByDate(date);
  const existingMeal = meals.find((meal) => meal.slot === targetSlot);

  const nextMeals = existingMeal
    ? meals.map((meal) => {
        if (meal.id !== existingMeal.id) return meal;
        const mergedItems = mergeMealItems([...meal.items, ...mappedItems]);
        const totals = mealTotals(mergedItems);
        return {
          ...meal,
          title: slotTitle(targetSlot),
          items: mergedItems,
          totalKcal: totals.totalKcal,
          proteinG: totals.proteinG,
          carbsG: totals.carbsG,
          fatG: totals.fatG,
          accepted: true
        } satisfies NutritionMeal;
      })
    : [
        ...meals,
        {
          id: `${date}:${targetSlot}`,
          date,
          slot: targetSlot,
          title: slotTitle(targetSlot),
          items: mappedItems,
          ...mealTotals(mappedItems),
          compromiseNote: undefined,
          accepted: true
        } satisfies NutritionMeal
      ];

  activateNutritionMealSlot(date, targetSlot);
  const updated = persistMealsForDate(date, nextMeals, "manualMealEditAt");
  return {
    date,
    slot: targetSlot,
    favorite: {
      id: template.id,
      name: template.name,
      description: template.description
    },
    meal: updated.meals.find((meal) => meal.slot === targetSlot) ?? null,
    totals: updated.totals
  };
}

export function upsertNutritionPantry(date: string, items: PantryUpsertItem[]) {
  replaceNutritionPantryItems(date, items);
  buildPlanOnly(date);
  return getNutritionPantryBundle(date);
}

export function createNutritionMealForSlot(date: string, slot: MealSlot) {
  const existing = getNutritionMealsByDate(date).find((entry) => entry.slot === slot);
  if (existing) {
    activateNutritionMealSlot(date, slot);
    buildPlanOnly(date);
    return existing;
  }

  const meal: NutritionMeal = {
    id: `${date}:${slot}`,
    date,
    slot,
    title: slotTitle(slot),
    items: [],
    totalKcal: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    compromiseNote: undefined,
    accepted: null
  };

  upsertNutritionMealHistory([
    {
      id: meal.id,
      date: meal.date,
      slot: meal.slot,
      title: meal.title,
      itemsJson: JSON.stringify(meal.items),
      totalKcal: meal.totalKcal,
      proteinG: meal.proteinG,
      carbsG: meal.carbsG,
      fatG: meal.fatG,
      compromiseNote: meal.compromiseNote ?? null,
      accepted: meal.accepted ?? null
    }
  ]);
  activateNutritionMealSlot(date, slot);
  buildPlanOnly(date);

  return getNutritionMealsByDate(date).find((entry) => entry.slot === slot) ?? null;
}

export function addNutritionIngredient(input: {
  name: string;
  category: NutritionIngredient["category"];
  kcalPer100?: number | null;
  proteinPer100: number;
  carbsPer100: number;
  fatPer100: number;
  defaultUnit: NutritionUnit;
  gramsPerUnit: number;
}) {
  const fallbackKcal = Math.round(input.proteinPer100 * 4 + input.carbsPer100 * 4 + input.fatPer100 * 9);
  const kcalPer100 =
    typeof input.kcalPer100 === "number" && Number.isFinite(input.kcalPer100) && input.kcalPer100 > 0
      ? input.kcalPer100
      : fallbackKcal;
  return createNutritionIngredient({
    ...input,
    kcalPer100
  });
}

export function suggestNutritionIngredientFromText(text: string): IngredientSuggestion | null {
  const cleaned = normalizeIngredientText(text);
  if (!cleaned) return null;

  const presets: Array<{
    aliases: string[];
    suggestion: Omit<IngredientSuggestion, "name" | "matchedBy">;
    matchedBy: string;
  }> = [
    {
      aliases: ["קוטג", "קוטג 5", "קוטג 3", "קוטג 9"],
      suggestion: {
        category: "dairy",
        kcalPer100: 98,
        proteinPer100: 11.0,
        carbsPer100: 3.4,
        fatPer100: 4.3,
        defaultUnit: "g",
        gramsPerUnit: 100
      },
      matchedBy: "קוטג׳"
    },
    {
      aliases: ["גבינה לבנה", "גבינה 5", "גבינה 9", "גבינה לבנה 5"],
      suggestion: {
        category: "dairy",
        kcalPer100: 103,
        proteinPer100: 10.5,
        carbsPer100: 3.2,
        fatPer100: 5,
        defaultUnit: "g",
        gramsPerUnit: 100
      },
      matchedBy: "גבינה לבנה"
    },
    {
      aliases: ["סקייר", "סקיר", "skyr"],
      suggestion: {
        category: "dairy",
        kcalPer100: 63,
        proteinPer100: 11,
        carbsPer100: 3.8,
        fatPer100: 0.2,
        defaultUnit: "g",
        gramsPerUnit: 150
      },
      matchedBy: "סקייר"
    },
    {
      aliases: ["לאבנה", "לבנה", "labaneh"],
      suggestion: {
        category: "dairy",
        kcalPer100: 150,
        proteinPer100: 8.5,
        carbsPer100: 4.5,
        fatPer100: 10,
        defaultUnit: "g",
        gramsPerUnit: 100
      },
      matchedBy: "לאבנה"
    },
    {
      aliases: ["גבינה צהובה", "צהובה", "עמק", "גאודה", "קשקבל", "מוצרלה"],
      suggestion: {
        category: "dairy",
        kcalPer100: 330,
        proteinPer100: 25,
        carbsPer100: 2,
        fatPer100: 26,
        defaultUnit: "unit",
        gramsPerUnit: 28
      },
      matchedBy: "גבינה צהובה"
    },
    {
      aliases: ["לחם מחמצת", "פרוסת לחם מחמצת", "לחם שאור", "סאורדואו"],
      suggestion: {
        category: "carb",
        kcalPer100: 240,
        proteinPer100: 8.5,
        carbsPer100: 46,
        fatPer100: 1.6,
        defaultUnit: "unit",
        gramsPerUnit: 45
      },
      matchedBy: "לחם מחמצת"
    },
    {
      aliases: ["פיתה", "חצי פיתה", "פיתה מלאה"],
      suggestion: {
        category: "carb",
        kcalPer100: 275,
        proteinPer100: 9.1,
        carbsPer100: 55,
        fatPer100: 1.2,
        defaultUnit: "unit",
        gramsPerUnit: 70
      },
      matchedBy: "פיתה"
    },
    {
      aliases: ["פלאפל", "כדור פלאפל", "מנת פלאפל", "פיתה פלאפל"],
      suggestion: {
        category: "carb",
        kcalPer100: 333,
        proteinPer100: 13.3,
        carbsPer100: 31.8,
        fatPer100: 17.8,
        defaultUnit: "unit",
        gramsPerUnit: 17
      },
      matchedBy: "פלאפל"
    },
    {
      aliases: ["ציפס", "צ׳יפס", "צ'יפס", "תפוחי אדמה מטוגנים", "fries", "french fries"],
      suggestion: {
        category: "carb",
        kcalPer100: 312,
        proteinPer100: 3.4,
        carbsPer100: 41,
        fatPer100: 15,
        defaultUnit: "g",
        gramsPerUnit: 100
      },
      matchedBy: "צ׳יפס"
    },
    {
      aliases: ["כבד קצוץ", "כבד קצוץ ביתי", "ממרח כבד", "chopped liver", "liver spread"],
      suggestion: {
        category: "mixed",
        kcalPer100: 280,
        proteinPer100: 16,
        carbsPer100: 5,
        fatPer100: 22,
        defaultUnit: "g",
        gramsPerUnit: 30
      },
      matchedBy: "כבד קצוץ"
    },
    {
      aliases: ["סיידר", "סיידר תפוחים", "cider", "apple cider", "סיידר מוגז", "סיידר תפוח"],
      suggestion: {
        category: "hydration",
        kcalPer100: 46,
        proteinPer100: 0,
        carbsPer100: 11.3,
        fatPer100: 0,
        defaultUnit: "ml",
        gramsPerUnit: 250
      },
      matchedBy: "סיידר תפוחים"
    },
    {
      aliases: ["חומוס", "חומוס ממרח", "ממרח חומוס", "חומוס ביתי"],
      suggestion: {
        category: "fat",
        kcalPer100: 237,
        proteinPer100: 7.9,
        carbsPer100: 14.3,
        fatPer100: 17.8,
        defaultUnit: "g",
        gramsPerUnit: 30
      },
      matchedBy: "חומוס (ממרח)"
    },
    {
      aliases: ["לחמניה", "לחמנייה", "באגט קטן", "רול"],
      suggestion: {
        category: "carb",
        kcalPer100: 268,
        proteinPer100: 9.4,
        carbsPer100: 51,
        fatPer100: 2.8,
        defaultUnit: "unit",
        gramsPerUnit: 60
      },
      matchedBy: "לחמניה"
    },
    {
      aliases: ["בייגל", "ביגל", "בייגל אמריקאי"],
      suggestion: {
        category: "carb",
        kcalPer100: 276,
        proteinPer100: 10.4,
        carbsPer100: 53,
        fatPer100: 1.7,
        defaultUnit: "unit",
        gramsPerUnit: 95
      },
      matchedBy: "בייגל"
    },
    {
      aliases: ["קרקרים", "קרקר", "פתית", "פתיתים פריכים"],
      suggestion: {
        category: "carb",
        kcalPer100: 430,
        proteinPer100: 10,
        carbsPer100: 71,
        fatPer100: 11,
        defaultUnit: "unit",
        gramsPerUnit: 9
      },
      matchedBy: "קרקרים"
    },
    {
      aliases: ["פרוסת לחם", "לחם", "לחם מלא"],
      suggestion: {
        category: "carb",
        kcalPer100: 247,
        proteinPer100: 13,
        carbsPer100: 41,
        fatPer100: 4.2,
        defaultUnit: "unit",
        gramsPerUnit: 35
      },
      matchedBy: "לחם"
    },
    {
      aliases: ["שיבולת שועל", "קוואקר", "oats"],
      suggestion: {
        category: "carb",
        kcalPer100: 389,
        proteinPer100: 16.9,
        carbsPer100: 66.3,
        fatPer100: 6.9,
        defaultUnit: "g",
        gramsPerUnit: 40
      },
      matchedBy: "שיבולת שועל"
    },
    {
      aliases: ["קינואה", "קינואה מבושלת", "quinoa"],
      suggestion: {
        category: "carb",
        kcalPer100: 120,
        proteinPer100: 4.4,
        carbsPer100: 21.3,
        fatPer100: 1.9,
        defaultUnit: "g",
        gramsPerUnit: 160
      },
      matchedBy: "קינואה"
    },
    {
      aliases: ["כוסמת", "כוסמת מבושלת", "buckwheat"],
      suggestion: {
        category: "carb",
        kcalPer100: 92,
        proteinPer100: 3.4,
        carbsPer100: 19.9,
        fatPer100: 0.6,
        defaultUnit: "g",
        gramsPerUnit: 160
      },
      matchedBy: "כוסמת"
    },
    {
      aliases: ["פסטה ברוטב עגבניות", "פסטה עגבניות", "פסטה ברוטב"],
      suggestion: {
        category: "carb",
        kcalPer100: 135,
        proteinPer100: 4.5,
        carbsPer100: 24,
        fatPer100: 2.5,
        defaultUnit: "unit",
        gramsPerUnit: 250
      },
      matchedBy: "פסטה ברוטב עגבניות"
    },
    {
      aliases: ["לזניה", "לזניה צמחונית", "פרוסת לזניה", "לזניה ירקות"],
      suggestion: {
        category: "carb",
        kcalPer100: 130,
        proteinPer100: 5.6,
        carbsPer100: 12.0,
        fatPer100: 4.6,
        defaultUnit: "unit",
        gramsPerUnit: 250
      },
      matchedBy: "לזניה צמחונית"
    },
    {
      aliases: ["גרנולה", "מוזלי"],
      suggestion: {
        category: "carb",
        kcalPer100: 430,
        proteinPer100: 10,
        carbsPer100: 64,
        fatPer100: 14,
        defaultUnit: "g",
        gramsPerUnit: 45
      },
      matchedBy: "גרנולה"
    },
    {
      aliases: ["קורנפלקס", "דגני בוקר", "ציריוס", "כריות"],
      suggestion: {
        category: "carb",
        kcalPer100: 380,
        proteinPer100: 7,
        carbsPer100: 84,
        fatPer100: 2.5,
        defaultUnit: "g",
        gramsPerUnit: 30
      },
      matchedBy: "דגני בוקר"
    },
    {
      aliases: ["יוגורט", "יוגורט יווני"],
      suggestion: {
        category: "dairy",
        kcalPer100: 97,
        proteinPer100: 10,
        carbsPer100: 3.6,
        fatPer100: 5,
        defaultUnit: "g",
        gramsPerUnit: 150
      },
      matchedBy: "יוגורט"
    },
    {
      aliases: ["חלב", "חלב 3", "חלב 3%", "חלב תנובה 3", "חלב תנובה", "חלב דל שומן"],
      suggestion: {
        category: "dairy",
        kcalPer100: 60,
        proteinPer100: 3.3,
        carbsPer100: 4.7,
        fatPer100: 3.0,
        defaultUnit: "ml",
        gramsPerUnit: 1
      },
      matchedBy: "חלב 3%"
    },
    {
      aliases: ["אספרסו כפול", "דאבל אספרסו", "אספרסו", "אספרסו קצר"],
      suggestion: {
        category: "hydration",
        kcalPer100: 9,
        proteinPer100: 0.1,
        carbsPer100: 1.7,
        fatPer100: 0.2,
        defaultUnit: "ml",
        gramsPerUnit: 60
      },
      matchedBy: "אספרסו כפול"
    },
    {
      aliases: ["אספרסו כפול עם חלב", "קפה עם חלב", "דאבל אספרסו עם חלב", "קפה לאטה קטן"],
      suggestion: {
        category: "dairy",
        kcalPer100: 60,
        proteinPer100: 3.3,
        carbsPer100: 4.7,
        fatPer100: 3.0,
        defaultUnit: "ml",
        gramsPerUnit: 50
      },
      matchedBy: "אספרסו כפול עם חלב"
    },
    {
      aliases: ["חלבון", "אבקת חלבון", "סקופ חלבון", "whey"],
      suggestion: {
        category: "protein",
        kcalPer100: 400,
        proteinPer100: 78,
        carbsPer100: 8,
        fatPer100: 6,
        defaultUnit: "unit",
        gramsPerUnit: 30
      },
      matchedBy: "אבקת חלבון"
    },
    {
      aliases: ["בננה"],
      suggestion: {
        category: "fruit",
        kcalPer100: 89,
        proteinPer100: 1.1,
        carbsPer100: 23,
        fatPer100: 0.3,
        defaultUnit: "unit",
        gramsPerUnit: 120
      },
      matchedBy: "בננה"
    },
    {
      aliases: ["תפוח"],
      suggestion: {
        category: "fruit",
        kcalPer100: 52,
        proteinPer100: 0.3,
        carbsPer100: 14,
        fatPer100: 0.2,
        defaultUnit: "unit",
        gramsPerUnit: 150
      },
      matchedBy: "תפוח"
    },
    {
      aliases: ["תמר", "תמר מגהול", "מג'הול", "מגול"],
      suggestion: {
        category: "fruit",
        kcalPer100: 277,
        proteinPer100: 1.8,
        carbsPer100: 75,
        fatPer100: 0.2,
        defaultUnit: "unit",
        gramsPerUnit: 24
      },
      matchedBy: "תמר"
    },
    {
      aliases: ["תמר מג׳הול", "תמר מגהול", "מג׳הול", "מג'הול"],
      suggestion: {
        category: "fruit",
        kcalPer100: 277,
        proteinPer100: 1.8,
        carbsPer100: 75,
        fatPer100: 0.2,
        defaultUnit: "unit",
        gramsPerUnit: 24
      },
      matchedBy: "תמר מג׳הול"
    },
    {
      aliases: ["תפוז", "קלמנטינה", "מנדרינה"],
      suggestion: {
        category: "fruit",
        kcalPer100: 47,
        proteinPer100: 0.9,
        carbsPer100: 12,
        fatPer100: 0.1,
        defaultUnit: "unit",
        gramsPerUnit: 140
      },
      matchedBy: "הדרים"
    },
    {
      aliases: ["ענבים"],
      suggestion: {
        category: "fruit",
        kcalPer100: 69,
        proteinPer100: 0.7,
        carbsPer100: 18,
        fatPer100: 0.2,
        defaultUnit: "g",
        gramsPerUnit: 100
      },
      matchedBy: "ענבים"
    },
    {
      aliases: ["ביצה", "ביצים"],
      suggestion: {
        category: "protein",
        kcalPer100: 143,
        proteinPer100: 12.6,
        carbsPer100: 0.7,
        fatPer100: 9.5,
        defaultUnit: "unit",
        gramsPerUnit: 50
      },
      matchedBy: "ביצה"
    },
    {
      aliases: ["ביצה קשה", "ביצים קשות"],
      suggestion: {
        category: "protein",
        kcalPer100: 143,
        proteinPer100: 12.6,
        carbsPer100: 0.7,
        fatPer100: 9.5,
        defaultUnit: "unit",
        gramsPerUnit: 50
      },
      matchedBy: "ביצה קשה"
    },
    {
      aliases: ["חביתה", "אומלט", "omelette"],
      suggestion: {
        category: "protein",
        kcalPer100: 168,
        proteinPer100: 11.9,
        carbsPer100: 1.6,
        fatPer100: 13.2,
        defaultUnit: "unit",
        gramsPerUnit: 110
      },
      matchedBy: "חביתה"
    },
    {
      aliases: ["טונה", "טונה במים", "טונה משומרת"],
      suggestion: {
        category: "protein",
        kcalPer100: 116,
        proteinPer100: 26,
        carbsPer100: 0,
        fatPer100: 1,
        defaultUnit: "unit",
        gramsPerUnit: 120
      },
      matchedBy: "טונה"
    },
    {
      aliases: ["חזה עוף", "עוף", "פרגית", "שניצל עוף"],
      suggestion: {
        category: "protein",
        kcalPer100: 165,
        proteinPer100: 31,
        carbsPer100: 0,
        fatPer100: 3.6,
        defaultUnit: "g",
        gramsPerUnit: 150
      },
      matchedBy: "חזה עוף"
    },
    {
      aliases: ["פסטרמה", "הודו", "חזה הודו"],
      suggestion: {
        category: "protein",
        kcalPer100: 104,
        proteinPer100: 18.5,
        carbsPer100: 2.2,
        fatPer100: 2.1,
        defaultUnit: "g",
        gramsPerUnit: 60
      },
      matchedBy: "פסטרמה"
    },
    {
      aliases: ["סלמון", "דג סלמון"],
      suggestion: {
        category: "protein",
        kcalPer100: 208,
        proteinPer100: 20,
        carbsPer100: 0,
        fatPer100: 13,
        defaultUnit: "g",
        gramsPerUnit: 150
      },
      matchedBy: "סלמון"
    },
    {
      aliases: ["טחינה", "טחינה גולמית"],
      suggestion: {
        category: "fat",
        kcalPer100: 595,
        proteinPer100: 17,
        carbsPer100: 21,
        fatPer100: 53,
        defaultUnit: "g",
        gramsPerUnit: 15
      },
      matchedBy: "טחינה"
    },
    {
      aliases: ["חומוס", "ממרח חומוס"],
      suggestion: {
        category: "fat",
        kcalPer100: 237,
        proteinPer100: 7.9,
        carbsPer100: 14.3,
        fatPer100: 17.8,
        defaultUnit: "g",
        gramsPerUnit: 30
      },
      matchedBy: "חומוס"
    },
    {
      aliases: ["חמאת בוטנים", "ממרח בוטנים", "peanut butter"],
      suggestion: {
        category: "fat",
        kcalPer100: 588,
        proteinPer100: 25,
        carbsPer100: 20,
        fatPer100: 50,
        defaultUnit: "g",
        gramsPerUnit: 16
      },
      matchedBy: "חמאת בוטנים"
    },
    {
      aliases: ["האפי היפו", "הפי היפו", "happy hippo", "קינדר האפי היפו", "kinder happy hippo"],
      suggestion: {
        category: "sweet",
        kcalPer100: 565,
        proteinPer100: 8.2,
        carbsPer100: 52.0,
        fatPer100: 36.0,
        defaultUnit: "unit",
        gramsPerUnit: 21
      },
      matchedBy: "Kinder Happy Hippo"
    },
    {
      aliases: ["פסק זמן", "חטיף פסק זמן", "pesek zman", "פסקזמן"],
      suggestion: {
        category: "sweet",
        kcalPer100: 520,
        proteinPer100: 6.5,
        carbsPer100: 58.0,
        fatPer100: 29.0,
        defaultUnit: "unit",
        gramsPerUnit: 45
      },
      matchedBy: "פסק זמן"
    },
    {
      aliases: ["דבש", "דבש טבעי", "דבש טהור"],
      suggestion: {
        category: "carb",
        kcalPer100: 304,
        proteinPer100: 0.3,
        carbsPer100: 82.4,
        fatPer100: 0,
        defaultUnit: "g",
        gramsPerUnit: 21
      },
      matchedBy: "דבש"
    },
    {
      aliases: ["שמן זית", "כף שמן זית", "olive oil"],
      suggestion: {
        category: "fat",
        kcalPer100: 884,
        proteinPer100: 0,
        carbsPer100: 0,
        fatPer100: 100,
        defaultUnit: "g",
        gramsPerUnit: 13
      },
      matchedBy: "שמן זית"
    },
    {
      aliases: ["אבוקדו"],
      suggestion: {
        category: "fat",
        kcalPer100: 160,
        proteinPer100: 2,
        carbsPer100: 9,
        fatPer100: 15,
        defaultUnit: "unit",
        gramsPerUnit: 140
      },
      matchedBy: "אבוקדו"
    },
    {
      aliases: ["שקדים", "אגוזים", "אגוז מלך", "קשיו", "פקאן", "פיסטוק"],
      suggestion: {
        category: "fat",
        kcalPer100: 600,
        proteinPer100: 19,
        carbsPer100: 18,
        fatPer100: 53,
        defaultUnit: "g",
        gramsPerUnit: 20
      },
      matchedBy: "אגוזים"
    },
    {
      aliases: ["רוקט", "עלי רוקט", "arugula"],
      suggestion: {
        category: "vegetable",
        kcalPer100: 25,
        proteinPer100: 2.6,
        carbsPer100: 3.7,
        fatPer100: 0.7,
        defaultUnit: "g",
        gramsPerUnit: 40
      },
      matchedBy: "רוקט"
    },
    {
      aliases: ["פטרוזיליה", "עלי פטרוזיליה"],
      suggestion: {
        category: "vegetable",
        kcalPer100: 36,
        proteinPer100: 3,
        carbsPer100: 6.3,
        fatPer100: 0.8,
        defaultUnit: "g",
        gramsPerUnit: 30
      },
      matchedBy: "פטרוזיליה"
    },
    {
      aliases: ["אורז", "אורז מבושל", "אורז לבן", "אורז מלא"],
      suggestion: {
        category: "carb",
        kcalPer100: 130,
        proteinPer100: 2.7,
        carbsPer100: 28,
        fatPer100: 0.3,
        defaultUnit: "g",
        gramsPerUnit: 150
      },
      matchedBy: "אורז מבושל"
    },
    {
      aliases: ["פסטה", "פסטה מבושלת", "ספגטי", "פנה"],
      suggestion: {
        category: "carb",
        kcalPer100: 158,
        proteinPer100: 5.8,
        carbsPer100: 30.9,
        fatPer100: 0.9,
        defaultUnit: "g",
        gramsPerUnit: 180
      },
      matchedBy: "פסטה מבושלת"
    },
    {
      aliases: ["לזניה", "לזניה צמחונית", "פרוסת לזניה", "לזניה ירקות"],
      suggestion: {
        category: "carb",
        kcalPer100: 130,
        proteinPer100: 5.6,
        carbsPer100: 12.0,
        fatPer100: 4.6,
        defaultUnit: "unit",
        gramsPerUnit: 250
      },
      matchedBy: "לזניה צמחונית"
    },
    {
      aliases: ["קוסקוס", "פתיתים", "בורגול", "קינואה"],
      suggestion: {
        category: "carb",
        kcalPer100: 120,
        proteinPer100: 4,
        carbsPer100: 23,
        fatPer100: 1.3,
        defaultUnit: "g",
        gramsPerUnit: 150
      },
      matchedBy: "פחמימה מבושלת"
    },
    {
      aliases: ["תפוח אדמה", "תפוא", "תפוחי אדמה", "פירה"],
      suggestion: {
        category: "carb",
        kcalPer100: 87,
        proteinPer100: 1.9,
        carbsPer100: 20.1,
        fatPer100: 0.1,
        defaultUnit: "unit",
        gramsPerUnit: 180
      },
      matchedBy: "תפוח אדמה"
    },
    {
      aliases: ["בטטה"],
      suggestion: {
        category: "carb",
        kcalPer100: 86,
        proteinPer100: 1.6,
        carbsPer100: 20.1,
        fatPer100: 0.1,
        defaultUnit: "unit",
        gramsPerUnit: 180
      },
      matchedBy: "בטטה"
    },
    {
      aliases: ["מלפפון", "מלפפונים"],
      suggestion: {
        category: "vegetable",
        kcalPer100: 15,
        proteinPer100: 0.7,
        carbsPer100: 3.6,
        fatPer100: 0.1,
        defaultUnit: "unit",
        gramsPerUnit: 120
      },
      matchedBy: "מלפפון"
    },
    {
      aliases: ["עגבניה", "עגבניות", "עגבנייה", "עגבניות שרי", "שרי"],
      suggestion: {
        category: "vegetable",
        kcalPer100: 18,
        proteinPer100: 0.9,
        carbsPer100: 3.9,
        fatPer100: 0.2,
        defaultUnit: "unit",
        gramsPerUnit: 120
      },
      matchedBy: "עגבנייה"
    },
    {
      aliases: ["סלט ירקות", "ירקות", "חסה", "פלפל", "גזר"],
      suggestion: {
        category: "vegetable",
        kcalPer100: 25,
        proteinPer100: 1,
        carbsPer100: 5,
        fatPer100: 0.2,
        defaultUnit: "g",
        gramsPerUnit: 100
      },
      matchedBy: "ירקות"
    },
    {
      aliases: ["מים", "בקבוק מים"],
      suggestion: {
        category: "hydration",
        kcalPer100: 0,
        proteinPer100: 0,
        carbsPer100: 0,
        fatPer100: 0,
        defaultUnit: "ml",
        gramsPerUnit: 1
      },
      matchedBy: "מים"
    },
    {
      aliases: ["איזוטוני", "משקה איזוטוני", "גטורייד"],
      suggestion: {
        category: "hydration",
        kcalPer100: 24,
        proteinPer100: 0,
        carbsPer100: 6,
        fatPer100: 0,
        defaultUnit: "ml",
        gramsPerUnit: 1
      },
      matchedBy: "משקה איזוטוני"
    }
  ];

  for (const preset of presets) {
    if (preset.aliases.some((alias) => cleaned.includes(normalizeIngredientText(alias)))) {
      return {
        name: text.trim(),
        ...preset.suggestion,
        matchedBy: preset.matchedBy
      };
    }
  }

  const tokens = tokenizeIngredientText(text);
  const ingredients = listNutritionIngredients();
  let best: NutritionIngredient | null = null;
  let bestScore = 0;

  for (const ingredient of ingredients) {
    const ingredientTokens = new Set(tokenizeIngredientText(ingredient.name));
    const overlap = tokens.filter((token) => ingredientTokens.has(token)).length;
    const direct = cleaned.includes(normalizeIngredientText(ingredient.name)) ? 2 : 0;
    const score = overlap + direct;
    if (score > bestScore) {
      best = ingredient;
      bestScore = score;
    }
  }

  if (best && bestScore > 0) {
    return {
      name: text.trim(),
      category: best.category,
      kcalPer100: best.kcalPer100,
      proteinPer100: best.proteinPer100,
      carbsPer100: best.carbsPer100,
      fatPer100: best.fatPer100,
      defaultUnit: best.defaultUnit,
      gramsPerUnit: best.gramsPerUnit,
      matchedBy: best.name
    };
  }

  return null;
}

export function editNutritionMeal(mealId: string, items: MealEditItem[]) {
  const [date] = mealId.split(":");
  if (!date) return null;

  const meals = getNutritionMealsToday(date);
  const meal = meals.find((entry) => entry.id === mealId);
  if (!meal) return null;

  const ingredientMap = new Map(listNutritionIngredients().map((ingredient) => [ingredient.id, ingredient]));
  const normalizedItems: NutritionMealItem[] = items
    .map((item) => {
      const ingredient = ingredientMap.get(item.ingredientId);
      if (!ingredient) return null;
      const quantity = Number(item.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) return null;
      const unit = item.unit;
      const grams = nutritionQuantityToGrams(quantity, unit, ingredient);
      const macros = macroForGrams(ingredient, grams);
      return {
        ingredientId: ingredient.id,
        name: ingredient.name,
        grams: round(grams, 0),
        quantity: unit === "unit" ? Math.round(quantity) : round(quantity, 1),
        unit,
        kcal: macros.kcal,
        proteinG: macros.proteinG,
        carbsG: macros.carbsG,
        fatG: macros.fatG
      } satisfies NutritionMealItem;
    })
    .filter((item): item is NutritionMealItem => Boolean(item));

  if (normalizedItems.length === 0) return null;
  const editedTotals = mealTotals(normalizedItems);
  const updatedMeals = meals.map((entry) =>
    entry.id === mealId
      ? {
          ...entry,
          items: normalizedItems,
          totalKcal: editedTotals.totalKcal,
          proteinG: editedTotals.proteinG,
          carbsG: editedTotals.carbsG,
          fatG: editedTotals.fatG,
          compromiseNote: undefined
        }
      : entry
  );

  return persistMealsForDate(date, updatedMeals, "manualMealEditAt");
}

function persistMealsForDate(date: string, meals: NutritionMeal[], rationaleField: "manualMealEditAt" | "manualMealDeleteAt") {
  const acceptedTotals = meals.reduce(
    (acc, entry) => {
      if (entry.accepted === true) {
        acc.kcal += entry.totalKcal;
        acc.protein += entry.proteinG;
        acc.carbs += entry.carbsG;
        acc.fat += entry.fatG;
      }
      return acc;
    },
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const plan = buildPlanOnly(date);
  const existingRationale = parseRationale(plan.rationaleJson);
  const updatedPlan: NutritionDailyPlan = {
    ...plan,
    rationaleJson: JSON.stringify({
      ...existingRationale,
      [rationaleField]: new Date().toISOString(),
      generatedMeals: meals.length
    }),
    updatedAt: new Date().toISOString()
  };

  upsertNutritionMealHistory(
    meals.map((entry) => ({
      id: entry.id,
      date: entry.date,
      slot: entry.slot,
      title: entry.title,
      itemsJson: JSON.stringify(entry.items),
      totalKcal: entry.totalKcal,
      proteinG: entry.proteinG,
      carbsG: entry.carbsG,
      fatG: entry.fatG,
      compromiseNote: entry.compromiseNote ?? null,
      accepted: entry.accepted ?? null
    }))
  );
  upsertNutritionDailyPlan(updatedPlan);

  return {
    date,
    plan: updatedPlan,
    meals,
    totals: {
      kcal: round(acceptedTotals.kcal, 0),
      proteinG: round(acceptedTotals.protein, 1),
      carbsG: round(acceptedTotals.carbs, 1),
      fatG: round(acceptedTotals.fat, 1)
    }
  };
}

export function deleteNutritionMeal(mealId: string) {
  const [date] = mealId.split(":");
  if (!date) return null;

  const meals = getNutritionMealsToday(date);
  const meal = meals.find((entry) => entry.id === mealId);
  if (!meal) return null;

  const deleted = deleteNutritionMealHistory(mealId);
  if (!deleted) return null;

  deactivateNutritionMealSlot(date, meal.slot);
  const remainingMeals = getNutritionMealsToday(date).filter((entry) => entry.id !== mealId);
  return persistMealsForDate(date, remainingMeals, "manualMealDeleteAt");
}

export function setMealFeedback(mealId: string, accepted: boolean | null) {
  const ok = setNutritionMealFeedback(mealId, accepted);
  if (!ok) return { ok: false };
  const [date] = mealId.split(":");
  return { ok: true };
}
