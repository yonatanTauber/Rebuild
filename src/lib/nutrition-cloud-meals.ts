import { randomUUID } from "node:crypto";
import { formatISODate } from "@/lib/date";
import { dbQuery, dbQueryOne, getDbProvider } from "@/lib/db-driver";
import { migrateDb } from "@/lib/db-migrate";
import { ensureCloudNutritionSeed } from "@/lib/nutrition-cloud";
import { nutritionQuantityToGrams, normalizeNutritionUnit } from "@/lib/nutrition-units";
import type { MealSlot, NutritionDailyPlan, NutritionIngredient, NutritionMeal, NutritionMealItem, NutritionUnit } from "@/lib/types";
import { getNutritionFavoriteTemplateById } from "@/lib/nutrition-engine";

function mealTitle(slot: MealSlot) {
  if (slot === "breakfast") return "ארוחת בוקר";
  if (slot === "lunch") return "ארוחת צהריים";
  if (slot === "dinner") return "ארוחת ערב";
  if (slot === "snack") return "נשנוש";
  if (slot === "pre_run") return "מזון לפני ריצה";
  if (slot === "drinks") return "שתייה";
  return "ארוחה";
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function round0(value: number) {
  return Math.round(value);
}

function computeMealItems(input: {
  ingredientById: Map<
    string,
    Pick<NutritionIngredient, "id" | "name" | "kcalPer100" | "proteinPer100" | "carbsPer100" | "fatPer100" | "gramsPerUnit">
  >;
  items: Array<{ ingredientId: string; quantity: number; unit: NutritionUnit }>;
}): { items: NutritionMealItem[]; totals: Pick<NutritionMeal, "totalKcal" | "proteinG" | "carbsG" | "fatG"> } {
  const items: NutritionMealItem[] = [];
  let totalKcal = 0;
  let proteinG = 0;
  let carbsG = 0;
  let fatG = 0;

  for (const entry of input.items) {
    const ing = input.ingredientById.get(entry.ingredientId);
    if (!ing) continue;
    const quantity = Number(entry.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    const unit = normalizeNutritionUnit(entry.unit);
    const grams = nutritionQuantityToGrams(quantity, unit, { name: ing.name, gramsPerUnit: ing.gramsPerUnit });
    const factor = grams / 100;
    const kcal = round0(ing.kcalPer100 * factor);
    const p = round1(ing.proteinPer100 * factor);
    const c = round1(ing.carbsPer100 * factor);
    const f = round1(ing.fatPer100 * factor);

    items.push({
      ingredientId: ing.id,
      name: ing.name,
      grams: round1(grams),
      quantity: round1(quantity),
      unit,
      kcal,
      proteinG: p,
      carbsG: c,
      fatG: f
    });

    totalKcal += kcal;
    proteinG += p;
    carbsG += c;
    fatG += f;
  }

  return {
    items,
    totals: {
      totalKcal: round0(totalKcal),
      proteinG: round1(proteinG),
      carbsG: round1(carbsG),
      fatG: round1(fatG)
    }
  };
}

async function ensureCloudNutritionReady() {
  if (getDbProvider() !== "postgres") return;
  await migrateDb();
  await ensureCloudNutritionSeed();
}

function parseIngredientFavoriteId(favoriteId: string) {
  if (!favoriteId) return null;
  if (!favoriteId.startsWith("ingredient:")) return null;
  const id = favoriteId.slice("ingredient:".length).trim();
  return id.length ? id : null;
}

function mergeMealItemsByIngredient(items: NutritionMealItem[]) {
  const merged = new Map<string, NutritionMealItem>();
  for (const item of items) {
    const key = `${item.ingredientId}|${item.unit}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...item });
      continue;
    }
    merged.set(key, {
      ...existing,
      grams: round1(Number(existing.grams) + Number(item.grams)),
      quantity: round1(Number(existing.quantity) + Number(item.quantity)),
      kcal: round0(Number(existing.kcal) + Number(item.kcal)),
      proteinG: round1(Number(existing.proteinG) + Number(item.proteinG)),
      carbsG: round1(Number(existing.carbsG) + Number(item.carbsG)),
      fatG: round1(Number(existing.fatG) + Number(item.fatG))
    });
  }
  return Array.from(merged.values());
}

async function cloudEnsureIngredientByName(input: {
  name: string;
  category: NutritionIngredient["category"];
  kcalPer100: number;
  proteinPer100: number;
  carbsPer100: number;
  fatPer100: number;
  defaultUnit: NutritionUnit;
  gramsPerUnit: number;
}): Promise<NutritionIngredient | null> {
  await ensureCloudNutritionReady();
  const existing = await dbQueryOne<Record<string, unknown>>(
    "SELECT id, name, category, kcalPer100, proteinPer100, carbsPer100, fatPer100, defaultUnit, gramsPerUnit, isBuiltIn, createdAt, updatedAt FROM nutrition_ingredients WHERE name = $1 LIMIT 1",
    [input.name]
  );
  if (existing) {
    return {
      id: String((existing as any).id),
      name: String((existing as any).name),
      category: String((existing as any).category) as any,
      kcalPer100: Number((existing as any).kcalper100 ?? (existing as any).kcalPer100 ?? 0),
      proteinPer100: Number((existing as any).proteinper100 ?? (existing as any).proteinPer100 ?? 0),
      carbsPer100: Number((existing as any).carbsper100 ?? (existing as any).carbsPer100 ?? 0),
      fatPer100: Number((existing as any).fatper100 ?? (existing as any).fatPer100 ?? 0),
      defaultUnit: String((existing as any).defaultunit ?? (existing as any).defaultUnit ?? "g") as NutritionUnit,
      gramsPerUnit: Number((existing as any).gramsperunit ?? (existing as any).gramsPerUnit ?? 1),
      isBuiltIn: Boolean((existing as any).isbuiltin ?? (existing as any).isBuiltIn),
      createdAt: String((existing as any).createdat ?? (existing as any).createdAt ?? ""),
      updatedAt: String((existing as any).updatedat ?? (existing as any).updatedAt ?? "")
    };
  }

  const now = new Date().toISOString();
  const id = randomUUID();
  await dbQuery(
    `
    INSERT INTO nutrition_ingredients
      (id, name, category, kcalPer100, proteinPer100, carbsPer100, fatPer100, defaultUnit, gramsPerUnit, isBuiltIn, createdAt, updatedAt)
    VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10,$10)
    `,
    [
      id,
      input.name,
      input.category,
      input.kcalPer100,
      input.proteinPer100,
      input.carbsPer100,
      input.fatPer100,
      input.defaultUnit,
      input.gramsPerUnit,
      now
    ]
  );
  return {
    id,
    name: input.name,
    category: input.category,
    kcalPer100: input.kcalPer100,
    proteinPer100: input.proteinPer100,
    carbsPer100: input.carbsPer100,
    fatPer100: input.fatPer100,
    defaultUnit: input.defaultUnit,
    gramsPerUnit: input.gramsPerUnit,
    isBuiltIn: false,
    createdAt: now,
    updatedAt: now
  };
}

export async function cloudAddFavoriteToNutritionDay(
  date: string,
  favoriteId: string,
  slot?: MealSlot,
  options?: { quantity?: number; unit?: NutritionUnit }
): Promise<
  | null
  | {
      date: string;
      slot: MealSlot;
      meal: NutritionMeal | null;
      totals: { kcal: number; proteinG: number; carbsG: number; fatG: number };
    }
> {
  await ensureCloudNutritionReady();

  const ingredientId = parseIngredientFavoriteId(favoriteId);
  const targetSlot = slot ?? "breakfast";

  if (ingredientId) {
    const ing = await dbQueryOne<Record<string, unknown>>(
      `
      SELECT id, name, kcalPer100, proteinPer100, carbsPer100, fatPer100, defaultUnit, gramsPerUnit
      FROM nutrition_ingredients
      WHERE id = $1
      LIMIT 1
      `,
      [ingredientId]
    );
    if (!ing) return null;

    const ingredient = {
      id: String((ing as any).id),
      name: String((ing as any).name),
      kcalPer100: Number((ing as any).kcalper100 ?? (ing as any).kcalPer100 ?? 0),
      proteinPer100: Number((ing as any).proteinper100 ?? (ing as any).proteinPer100 ?? 0),
      carbsPer100: Number((ing as any).carbsper100 ?? (ing as any).carbsPer100 ?? 0),
      fatPer100: Number((ing as any).fatper100 ?? (ing as any).fatPer100 ?? 0),
      defaultUnit: String((ing as any).defaultunit ?? (ing as any).defaultUnit ?? "g") as NutritionUnit,
      gramsPerUnit: Number((ing as any).gramsperunit ?? (ing as any).gramsPerUnit ?? 1)
    };

    const meal = await cloudCreateNutritionMealForSlot(date, targetSlot);
    if (!meal) return null;

    const unit = normalizeNutritionUnit(options?.unit ?? ingredient.defaultUnit);
    const fallbackQuantity = unit === "unit" || unit === "tbsp" || unit === "tsp" ? 1 : unit === "ml" ? 50 : 100;
    const quantity =
      options?.quantity != null && Number.isFinite(options.quantity) && options.quantity > 0 ? options.quantity : fallbackQuantity;
    const grams = nutritionQuantityToGrams(Number(quantity), unit, { name: ingredient.name, gramsPerUnit: ingredient.gramsPerUnit });
    const factor = grams / 100;
    const item: NutritionMealItem = {
      ingredientId: ingredient.id,
      name: ingredient.name,
      grams: round1(grams),
      quantity: round1(Number(quantity)),
      unit,
      kcal: round0(ingredient.kcalPer100 * factor),
      proteinG: round1(ingredient.proteinPer100 * factor),
      carbsG: round1(ingredient.carbsPer100 * factor),
      fatG: round1(ingredient.fatPer100 * factor)
    };

    const mergedItems = mergeMealItemsByIngredient([...(meal.items ?? []), item]);
    const totals = mergedItems.reduce(
      (acc, row) => {
        acc.kcal += Number(row.kcal ?? 0);
        acc.proteinG += Number(row.proteinG ?? 0);
        acc.carbsG += Number(row.carbsG ?? 0);
        acc.fatG += Number(row.fatG ?? 0);
        return acc;
      },
      { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }
    );

    await dbQuery(
      `
      UPDATE nutrition_meal_history
      SET itemsJson = $1, totalKcal = $2, proteinG = $3, carbsG = $4, fatG = $5, accepted = 1
      WHERE id = $6
      `,
      [
        JSON.stringify(mergedItems),
        round0(totals.kcal),
        round1(totals.proteinG),
        round1(totals.carbsG),
        round1(totals.fatG),
        meal.id
      ]
    );

    const refreshedMeals = await cloudGetMealsByDate(date);
    const refreshedMeal = refreshedMeals.find((m) => m.id === meal.id) ?? null;
    const acceptedTotals = refreshedMeals
      .filter((m) => m.accepted === true)
      .reduce(
        (acc, m) => {
          acc.kcal += m.totalKcal ?? 0;
          acc.proteinG += m.proteinG ?? 0;
          acc.carbsG += m.carbsG ?? 0;
          acc.fatG += m.fatG ?? 0;
          return acc;
        },
        { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }
      );

    return { date, slot: targetSlot, meal: refreshedMeal, totals: acceptedTotals };
  }

  const template = getNutritionFavoriteTemplateById(favoriteId);
  if (!template) return null;
  const portionFactor =
    options?.quantity != null && Number.isFinite(options.quantity) && options.quantity > 0 ? Number(options.quantity) : 1;
  const templateSlot = slot ?? (template.preferredSlot as MealSlot | undefined) ?? targetSlot;

  const meal = await cloudCreateNutritionMealForSlot(date, templateSlot);
  if (!meal) return null;

  const mappedItems: NutritionMealItem[] = [];
  for (const source of template.items) {
    const ingredient = await cloudEnsureIngredientByName({
      name: source.name,
      category: source.category,
      kcalPer100: source.kcalPer100,
      proteinPer100: source.proteinPer100,
      carbsPer100: source.carbsPer100,
      fatPer100: source.fatPer100,
      defaultUnit: source.defaultUnit,
      gramsPerUnit: source.gramsPerUnit
    });
    if (!ingredient) continue;
    const scaledQuantity = source.quantity * portionFactor;
    const unit = normalizeNutritionUnit(source.unit);
    const grams = nutritionQuantityToGrams(scaledQuantity, unit, { name: ingredient.name, gramsPerUnit: ingredient.gramsPerUnit });
    const factor = grams / 100;
    mappedItems.push({
      ingredientId: ingredient.id,
      name: ingredient.name,
      grams: round1(grams),
      quantity: round1(scaledQuantity),
      unit,
      kcal: round0(ingredient.kcalPer100 * factor),
      proteinG: round1(ingredient.proteinPer100 * factor),
      carbsG: round1(ingredient.carbsPer100 * factor),
      fatG: round1(ingredient.fatPer100 * factor)
    });
  }
  if (!mappedItems.length) return null;

  const mergedItems = mergeMealItemsByIngredient([...(meal.items ?? []), ...mappedItems]);
  const totals = mergedItems.reduce(
    (acc, row) => {
      acc.kcal += Number(row.kcal ?? 0);
      acc.proteinG += Number(row.proteinG ?? 0);
      acc.carbsG += Number(row.carbsG ?? 0);
      acc.fatG += Number(row.fatG ?? 0);
      return acc;
    },
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }
  );

  await dbQuery(
    `
    UPDATE nutrition_meal_history
    SET itemsJson = $1, totalKcal = $2, proteinG = $3, carbsG = $4, fatG = $5, accepted = 1
    WHERE id = $6
    `,
    [
      JSON.stringify(mergedItems),
      round0(totals.kcal),
      round1(totals.proteinG),
      round1(totals.carbsG),
      round1(totals.fatG),
      meal.id
    ]
  );

  const refreshedMeals = await cloudGetMealsByDate(date);
  const refreshedMeal = refreshedMeals.find((m) => m.id === meal.id) ?? null;
  const acceptedTotals = refreshedMeals
    .filter((m) => m.accepted === true)
    .reduce(
      (acc, m) => {
        acc.kcal += m.totalKcal ?? 0;
        acc.proteinG += m.proteinG ?? 0;
        acc.carbsG += m.carbsG ?? 0;
        acc.fatG += m.fatG ?? 0;
        return acc;
      },
      { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }
    );

  return { date, slot: templateSlot, meal: refreshedMeal, totals: acceptedTotals };
}

export async function cloudGetNutritionPlan(date = formatISODate()): Promise<NutritionDailyPlan> {
  await ensureCloudNutritionReady();
  const existing = await dbQueryOne<Record<string, unknown>>("SELECT * FROM nutrition_daily_plan WHERE date = $1 LIMIT 1", [date]);
  if (existing) {
    return {
      date: String((existing as any).date),
      carbsG: Number((existing as any).carbsg ?? (existing as any).carbsG ?? 0),
      proteinG: Number((existing as any).proteing ?? (existing as any).proteinG ?? 0),
      fatG: Number((existing as any).fatg ?? (existing as any).fatG ?? 0),
      hydrationMl: Number((existing as any).hydrationml ?? (existing as any).hydrationMl ?? 0),
      preWorkoutNote: String((existing as any).preworkoutnote ?? (existing as any).preWorkoutNote ?? ""),
      postWorkoutNote: String((existing as any).postworkoutnote ?? (existing as any).postWorkoutNote ?? ""),
      rationaleJson: String((existing as any).rationalejson ?? (existing as any).rationaleJson ?? "{}"),
      updatedAt: String((existing as any).updatedat ?? (existing as any).updatedAt ?? "")
    };
  }

  const now = new Date().toISOString();
  const fallback: NutritionDailyPlan = {
    date,
    carbsG: 230,
    proteinG: 130,
    fatG: 85,
    hydrationMl: 2450,
    preWorkoutNote: "",
    postWorkoutNote: "",
    rationaleJson: JSON.stringify({
      targetKcal: 2205,
      targetProteinG: 130,
      targetCarbsG: 230,
      targetFatG: 85,
      note: "ברירת מחדל (עד שיוגדר פרופיל תזונה מלא)."
    }),
    updatedAt: now
  };

  await dbQuery(
    `
    INSERT INTO nutrition_daily_plan
      (date, carbsG, proteinG, fatG, hydrationMl, preWorkoutNote, postWorkoutNote, rationaleJson, updatedAt)
    VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `,
    [
      fallback.date,
      fallback.carbsG,
      fallback.proteinG,
      fallback.fatG,
      fallback.hydrationMl,
      fallback.preWorkoutNote,
      fallback.postWorkoutNote,
      fallback.rationaleJson,
      fallback.updatedAt
    ]
  );

  return fallback;
}

export async function cloudGetMealsByDate(date = formatISODate()): Promise<NutritionMeal[]> {
  await ensureCloudNutritionReady();
  const res = await dbQuery<Record<string, unknown>>(
    `
    SELECT id, date, mealSlot, title, itemsJson, totalKcal, proteinG, carbsG, fatG, compromiseNote, accepted, createdAt
    FROM nutrition_meal_history
    WHERE date = $1
    ORDER BY createdAt ASC
    `,
    [date]
  );

  return res.rows.map((row) => {
    const items = (() => {
      try {
        const parsed = JSON.parse(String((row as any).itemsjson ?? (row as any).itemsJson ?? "[]")) as NutritionMealItem[];
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })();

    const acceptedRaw = (row as any).accepted;
    const accepted = acceptedRaw == null ? null : Boolean(Number(acceptedRaw));

    return {
      id: String((row as any).id),
      date: String((row as any).date),
      slot: String((row as any).mealslot ?? (row as any).mealSlot) as MealSlot,
      title: String((row as any).title),
      items,
      totalKcal: Number((row as any).totalkcal ?? (row as any).totalKcal ?? 0),
      proteinG: Number((row as any).proteing ?? (row as any).proteinG ?? 0),
      carbsG: Number((row as any).carbsg ?? (row as any).carbsG ?? 0),
      fatG: Number((row as any).fatg ?? (row as any).fatG ?? 0),
      compromiseNote: ((): string | undefined => {
        const note = (row as any).compromisenote ?? (row as any).compromiseNote ?? null;
        return note == null ? undefined : String(note);
      })(),
      accepted
    };
  });
}

export async function cloudCreateNutritionMealForSlot(date: string, slot: MealSlot): Promise<NutritionMeal | null> {
  await ensureCloudNutritionReady();
  const existing = await dbQueryOne<Record<string, unknown>>(
    `
    SELECT id
    FROM nutrition_meal_history
    WHERE date = $1 AND mealSlot = $2
    ORDER BY createdAt DESC
    LIMIT 1
    `,
    [date, slot]
  );

  const now = new Date().toISOString();
  await dbQuery(
    `
    INSERT INTO nutrition_meal_activation (date, mealSlot, createdAt)
    VALUES ($1,$2,$3)
    ON CONFLICT(date, mealSlot) DO NOTHING
    `,
    [date, slot, now]
  );

  if (existing?.id) {
    const mealId = String((existing as any).id);
    const mealRow = await dbQueryOne<Record<string, unknown>>("SELECT * FROM nutrition_meal_history WHERE id = $1 LIMIT 1", [mealId]);
    if (!mealRow) return null;
    return (await cloudGetMealsByDate(date)).find((meal) => meal.id === mealId) ?? null;
  }

  const id = randomUUID();
  await dbQuery(
    `
    INSERT INTO nutrition_meal_history
      (id, date, mealSlot, title, itemsJson, totalKcal, proteinG, carbsG, fatG, compromiseNote, accepted, createdAt)
    VALUES
      ($1,$2,$3,$4,'[]',0,0,0,0,NULL,NULL,$5)
    `,
    [id, date, slot, mealTitle(slot), now]
  );

  return (await cloudGetMealsByDate(date)).find((meal) => meal.id === id) ?? null;
}

export async function cloudEditNutritionMeal(
  mealId: string,
  items: Array<{ ingredientId: string; quantity: number; unit: NutritionUnit }>
): Promise<{ ok: boolean; meal?: NutritionMeal }> {
  await ensureCloudNutritionReady();
  const mealRow = await dbQueryOne<Record<string, unknown>>("SELECT id, date FROM nutrition_meal_history WHERE id = $1 LIMIT 1", [mealId]);
  if (!mealRow) return { ok: false };
  const date = String((mealRow as any).date);

  const ingredientIds = Array.from(new Set(items.map((item) => item.ingredientId).filter(Boolean)));
  if (!ingredientIds.length) return { ok: false };

  const inParams = ingredientIds.map((_, idx) => `$${idx + 1}`).join(",");
  const ingRes = await dbQuery<Record<string, unknown>>(
    `
    SELECT id, name, kcalPer100, proteinPer100, carbsPer100, fatPer100, gramsPerUnit
    FROM nutrition_ingredients
    WHERE id IN (${inParams})
    `,
    ingredientIds
  );
  const ingredientById = new Map<string, any>();
  for (const row of ingRes.rows) {
    ingredientById.set(String((row as any).id), {
      id: String((row as any).id),
      name: String((row as any).name),
      kcalPer100: Number((row as any).kcalper100 ?? (row as any).kcalPer100 ?? 0),
      proteinPer100: Number((row as any).proteinper100 ?? (row as any).proteinPer100 ?? 0),
      carbsPer100: Number((row as any).carbsper100 ?? (row as any).carbsPer100 ?? 0),
      fatPer100: Number((row as any).fatper100 ?? (row as any).fatPer100 ?? 0),
      gramsPerUnit: Number((row as any).gramsperunit ?? (row as any).gramsPerUnit ?? 1)
    });
  }

  const computed = computeMealItems({ ingredientById, items });
  const itemsJson = JSON.stringify(computed.items);
  await dbQuery(
    `
    UPDATE nutrition_meal_history
    SET itemsJson = $2,
        totalKcal = $3,
        proteinG = $4,
        carbsG = $5,
        fatG = $6
    WHERE id = $1
    `,
    [mealId, itemsJson, computed.totals.totalKcal, computed.totals.proteinG, computed.totals.carbsG, computed.totals.fatG]
  );

  const meal = (await cloudGetMealsByDate(date)).find((entry) => entry.id === mealId) ?? null;
  if (!meal) return { ok: false };
  return { ok: true, meal };
}

export async function cloudDeleteNutritionMeal(mealId: string): Promise<{ ok: boolean; date?: string; slot?: MealSlot }> {
  await ensureCloudNutritionReady();
  const mealRow = await dbQueryOne<Record<string, unknown>>("SELECT date, mealSlot FROM nutrition_meal_history WHERE id = $1 LIMIT 1", [mealId]);
  if (!mealRow) return { ok: false };
  const date = String((mealRow as any).date);
  const slot = String((mealRow as any).mealslot ?? (mealRow as any).mealSlot) as MealSlot;
  await dbQuery("DELETE FROM nutrition_meal_history WHERE id = $1", [mealId]);
  await dbQuery("DELETE FROM nutrition_meal_activation WHERE date = $1 AND mealSlot = $2", [date, slot]);
  return { ok: true, date, slot };
}

export async function cloudSetNutritionMealFeedback(mealId: string, accepted: boolean | null): Promise<{ ok: boolean }> {
  await ensureCloudNutritionReady();
  const exists = await dbQueryOne<Record<string, unknown>>("SELECT id FROM nutrition_meal_history WHERE id = $1 LIMIT 1", [mealId]);
  if (!exists) return { ok: false };
  await dbQuery("UPDATE nutrition_meal_history SET accepted = $2 WHERE id = $1", [mealId, accepted == null ? null : accepted ? 1 : 0]);
  return { ok: true };
}
