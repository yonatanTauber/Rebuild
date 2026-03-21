import { randomUUID } from "node:crypto";
import { dbQuery, dbQueryOne } from "@/lib/db-driver";
import type { NutritionIngredient, NutritionIngredientCategory, NutritionUnit } from "@/lib/types";

type SeedIngredient = {
  name: string;
  category: NutritionIngredientCategory;
  kcalPer100: number;
  proteinPer100: number;
  carbsPer100: number;
  fatPer100: number;
  defaultUnit: NutritionUnit;
  gramsPerUnit: number;
};

const seedIngredients: SeedIngredient[] = [
  // Hydration / coffee
  { name: "מים", category: "hydration", kcalPer100: 0, proteinPer100: 0, carbsPer100: 0, fatPer100: 0, defaultUnit: "ml", gramsPerUnit: 1 },
  { name: "אספרסו כפול", category: "hydration", kcalPer100: 9, proteinPer100: 0.1, carbsPer100: 1.7, fatPer100: 0.2, defaultUnit: "ml", gramsPerUnit: 60 },
  { name: "חלב 3% תנובה", category: "dairy", kcalPer100: 60, proteinPer100: 3.3, carbsPer100: 4.7, fatPer100: 3.0, defaultUnit: "ml", gramsPerUnit: 1 },
  { name: "אספרסו כפול עם חלב", category: "dairy", kcalPer100: 60, proteinPer100: 3.3, carbsPer100: 4.7, fatPer100: 3.0, defaultUnit: "ml", gramsPerUnit: 50 },

  // Dairy
  { name: "קוטג׳ 5% תנובה", category: "dairy", kcalPer100: 95, proteinPer100: 11.0, carbsPer100: 1.5, fatPer100: 5.0, defaultUnit: "g", gramsPerUnit: 100 },
  { name: "יוגורט 4% תנובה", category: "dairy", kcalPer100: 63, proteinPer100: 3.2, carbsPer100: 3.5, fatPer100: 4.0, defaultUnit: "g", gramsPerUnit: 100 },
  { name: "יוגורט דנונה PRO 1.5% (200 גרם)", category: "dairy", kcalPer100: 70, proteinPer100: 10.0, carbsPer100: 3.4, fatPer100: 1.5, defaultUnit: "unit", gramsPerUnit: 200 },
  { name: "יוגורט דנונה PRO 0% (200 גרם)", category: "dairy", kcalPer100: 65, proteinPer100: 10.0, carbsPer100: 5.6, fatPer100: 0.0, defaultUnit: "unit", gramsPerUnit: 200 },

  // Fruit / basics
  { name: "בננה", category: "fruit", kcalPer100: 89, proteinPer100: 1.1, carbsPer100: 23, fatPer100: 0.3, defaultUnit: "unit", gramsPerUnit: 120 },
  { name: "תפוח", category: "fruit", kcalPer100: 52, proteinPer100: 0.3, carbsPer100: 14, fatPer100: 0.2, defaultUnit: "unit", gramsPerUnit: 150 },
  { name: "תמר מג׳הול", category: "fruit", kcalPer100: 277, proteinPer100: 1.8, carbsPer100: 75, fatPer100: 0.2, defaultUnit: "unit", gramsPerUnit: 24 },
  { name: "דבש", category: "sweet", kcalPer100: 304, proteinPer100: 0.3, carbsPer100: 82.4, fatPer100: 0, defaultUnit: "tbsp", gramsPerUnit: 21 },

  // Spreads / fats
  { name: "טחינה גולמית", category: "fat", kcalPer100: 595, proteinPer100: 17.0, carbsPer100: 21.0, fatPer100: 53.0, defaultUnit: "tbsp", gramsPerUnit: 15 },
  { name: "חומוס (ממרח)", category: "fat", kcalPer100: 237, proteinPer100: 7.9, carbsPer100: 14.3, fatPer100: 17.8, defaultUnit: "g", gramsPerUnit: 30 },

  // Meals / carbs
  { name: "שיבולת שועל", category: "carb", kcalPer100: 389, proteinPer100: 16.9, carbsPer100: 66.3, fatPer100: 6.9, defaultUnit: "g", gramsPerUnit: 40 },
  { name: "קינואה מבושלת", category: "carb", kcalPer100: 120, proteinPer100: 4.4, carbsPer100: 21.3, fatPer100: 1.9, defaultUnit: "g", gramsPerUnit: 160 },
  { name: "כוסמת מבושלת", category: "carb", kcalPer100: 92, proteinPer100: 3.4, carbsPer100: 19.9, fatPer100: 0.6, defaultUnit: "g", gramsPerUnit: 160 },
  { name: "פסטה ברוטב עגבניות", category: "carb", kcalPer100: 135, proteinPer100: 4.5, carbsPer100: 24.0, fatPer100: 2.5, defaultUnit: "unit", gramsPerUnit: 250 },
  { name: "לזניה צמחונית", category: "carb", kcalPer100: 130, proteinPer100: 5.6, carbsPer100: 12.0, fatPer100: 4.6, defaultUnit: "unit", gramsPerUnit: 250 },

  // Street food / sweets
  { name: "פלאפל", category: "carb", kcalPer100: 333, proteinPer100: 13.3, carbsPer100: 31.8, fatPer100: 17.8, defaultUnit: "unit", gramsPerUnit: 17 },
  { name: "Kinder Happy Hippo", category: "sweet", kcalPer100: 565, proteinPer100: 8.2, carbsPer100: 52.0, fatPer100: 36.0, defaultUnit: "unit", gramsPerUnit: 21 },
  { name: "פסק זמן", category: "sweet", kcalPer100: 520, proteinPer100: 6.5, carbsPer100: 58.0, fatPer100: 29.0, defaultUnit: "unit", gramsPerUnit: 45 }
];

export async function ensureCloudNutritionSeed() {
  const countRow = await dbQueryOne<{ count: number }>("SELECT COUNT(*)::int AS count FROM nutrition_ingredients");
  if ((countRow?.count ?? 0) > 0) return;

  const now = new Date().toISOString();
  for (const item of seedIngredients) {
    await dbQuery(
      `
      INSERT INTO nutrition_ingredients
        (id, name, category, kcalPer100, proteinPer100, carbsPer100, fatPer100, defaultUnit, gramsPerUnit, isBuiltIn, createdAt, updatedAt)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10,$10)
      ON CONFLICT(name) DO NOTHING
      `,
      [
        randomUUID(),
        item.name,
        item.category,
        item.kcalPer100,
        item.proteinPer100,
        item.carbsPer100,
        item.fatPer100,
        item.defaultUnit,
        item.gramsPerUnit,
        now
      ]
    );
  }
}

export async function cloudListNutritionIngredients(): Promise<NutritionIngredient[]> {
  const res = await dbQuery<{
    id: string;
    name: string;
    category: NutritionIngredientCategory;
    kcalper100: number;
    proteinper100: number;
    carbsper100: number;
    fatper100: number;
    defaultunit: NutritionUnit;
    gramsperunit: number;
    isbuiltin: number | boolean;
    createdat: string;
    updatedat: string;
  }>(
    `
    SELECT
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
      name ASC
    `
  );
  return res.rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    category: row.category,
    kcalPer100: Number((row as any).kcalper100 ?? (row as any).kcalPer100 ?? 0),
    proteinPer100: Number((row as any).proteinper100 ?? (row as any).proteinPer100 ?? 0),
    carbsPer100: Number((row as any).carbsper100 ?? (row as any).carbsPer100 ?? 0),
    fatPer100: Number((row as any).fatper100 ?? (row as any).fatPer100 ?? 0),
    defaultUnit: (String((row as any).defaultunit ?? (row as any).defaultUnit) as NutritionUnit) ?? "g",
    gramsPerUnit: Number((row as any).gramsperunit ?? (row as any).gramsPerUnit ?? 1),
    isBuiltIn: Boolean((row as any).isbuiltin ?? (row as any).isBuiltIn),
    createdAt: String((row as any).createdat ?? (row as any).createdAt ?? ""),
    updatedAt: String((row as any).updatedat ?? (row as any).updatedAt ?? "")
  }));
}

