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

// ──────────────────────────────────────────────────────────────────────────────
// Seed ingredient data — verified against USDA FoodData Central,
// Open Food Facts (Israeli barcodes), and official Israeli product labels.
//
// gramsPerUnit semantics:
//   • defaultUnit = "unit"/"tbsp"/"tsp"  → grams that 1 of that unit weighs
//   • defaultUnit = "g"/"ml"             → default display quantity in the modal
//     (used in the today-page add-food flow so users see a sensible starting qty)
// ──────────────────────────────────────────────────────────────────────────────
const seedIngredients: SeedIngredient[] = [
  // ── Hydration ──────────────────────────────────────────────────────────────
  // Water: 0 kcal. gramsPerUnit=250 → modal opens at 250 ml (1 glass).
  { name: "מים", category: "hydration", kcalPer100: 0, proteinPer100: 0, carbsPer100: 0, fatPer100: 0, defaultUnit: "ml", gramsPerUnit: 250 },

  // Double espresso ~60 ml. USDA: plain brewed espresso ≈ 3 kcal/100 ml.
  // defaultUnit="unit": 1 unit = 1 double shot (60 ml). Modal shows "1 יח'".
  { name: "אספרסו כפול", category: "hydration", kcalPer100: 3, proteinPer100: 0.1, carbsPer100: 0.5, fatPer100: 0.2, defaultUnit: "unit", gramsPerUnit: 60 },

  // Espresso with milk (cortado-style, ~130 ml: 60 ml espresso + 70 ml milk).
  // Blended macros: ~34 kcal/100 ml, protein 1.8 g, carbs 2.9 g, fat 1.7 g.
  { name: "אספרסו כפול עם חלב", category: "hydration", kcalPer100: 34, proteinPer100: 1.8, carbsPer100: 2.9, fatPer100: 1.7, defaultUnit: "unit", gramsPerUnit: 130 },

  // ── Dairy ──────────────────────────────────────────────────────────────────
  // Tenuva 3% milk. FatSecret/Open Food Facts verified.
  // gramsPerUnit=200 → modal opens at 200 ml (1 cup).
  { name: "חלב 3% תנובה", category: "dairy", kcalPer100: 60, proteinPer100: 3.3, carbsPer100: 5.0, fatPer100: 3.0, defaultUnit: "ml", gramsPerUnit: 200 },

  // Tenuva cottage 5%. Open Food Facts barcode 7290000055039.
  // defaultUnit="unit": 1 unit = 1 container (250 g). Modal shows "1 יח'" = 238 kcal.
  { name: "קוטג׳ 5% תנובה", category: "dairy", kcalPer100: 95, proteinPer100: 11.0, carbsPer100: 1.5, fatPer100: 5.0, defaultUnit: "unit", gramsPerUnit: 250 },

  // Tenuva plain yogurt 4%. FatSecret Tnuva listing.
  // defaultUnit="unit": 1 unit = 1 container (200 g). Modal shows "1 יח'" = 126 kcal.
  { name: "יוגורט 4% תנובה", category: "dairy", kcalPer100: 63, proteinPer100: 3.3, carbsPer100: 4.5, fatPer100: 4.0, defaultUnit: "unit", gramsPerUnit: 200 },

  // Danone PRO 1.5% 200 g container. FoodsDictionary.co.il (Strauss Israel).
  { name: "יוגורט דנונה PRO 1.5% (200 גרם)", category: "dairy", kcalPer100: 70, proteinPer100: 10.0, carbsPer100: 3.4, fatPer100: 1.5, defaultUnit: "unit", gramsPerUnit: 200 },

  // Danone PRO 0% high-protein line (kaloria.co.il: 21 g protein / 200 g container).
  { name: "יוגורט דנונה PRO 0% (200 גרם)", category: "dairy", kcalPer100: 58, proteinPer100: 10.5, carbsPer100: 3.3, fatPer100: 0.0, defaultUnit: "unit", gramsPerUnit: 200 },

  // ── Fruit ──────────────────────────────────────────────────────────────────
  // Banana medium (without peel). USDA FDC #173944. 1 medium = ~118 g.
  { name: "בננה", category: "fruit", kcalPer100: 89, proteinPer100: 1.1, carbsPer100: 22.8, fatPer100: 0.3, defaultUnit: "unit", gramsPerUnit: 118 },

  // Apple with skin. USDA FDC #171688. 1 medium (edible portion) = ~182 g.
  { name: "תפוח", category: "fruit", kcalPer100: 52, proteinPer100: 0.3, carbsPer100: 13.8, fatPer100: 0.2, defaultUnit: "unit", gramsPerUnit: 182 },

  // Medjool date pitted. USDA FDC #168191. 1 date = ~24 g.
  { name: "תמר מג׳הול", category: "fruit", kcalPer100: 277, proteinPer100: 1.8, carbsPer100: 75.0, fatPer100: 0.2, defaultUnit: "unit", gramsPerUnit: 24 },

  // ── Sweeteners ─────────────────────────────────────────────────────────────
  // Honey. USDA FDC #169640. 1 tbsp = 21 g.
  { name: "דבש", category: "sweet", kcalPer100: 304, proteinPer100: 0.3, carbsPer100: 82.0, fatPer100: 0.0, defaultUnit: "tbsp", gramsPerUnit: 21 },

  // ── Fats / spreads ─────────────────────────────────────────────────────────
  // Raw tahini. USDA FDC #169410. 1 tbsp = 15 g.
  { name: "טחינה גולמית", category: "fat", kcalPer100: 595, proteinPer100: 17.0, carbsPer100: 21.0, fatPer100: 53.0, defaultUnit: "tbsp", gramsPerUnit: 15 },

  // Hummus (Achla by Strauss — most common Israeli supermarket brand).
  // nutritionvalue.org. 1 heaping tbsp ≈ 25 g.
  { name: "חומוס (ממרח)", category: "fat", kcalPer100: 214, proteinPer100: 7.1, carbsPer100: 10.7, fatPer100: 16.1, defaultUnit: "tbsp", gramsPerUnit: 25 },

  // ── Carbs / grains ─────────────────────────────────────────────────────────
  // Dry rolled oats. USDA FDC #169705. gramsPerUnit=80 → modal opens at 80 g (1 cup dry).
  { name: "שיבולת שועל", category: "carb", kcalPer100: 389, proteinPer100: 17.0, carbsPer100: 66.0, fatPer100: 7.0, defaultUnit: "g", gramsPerUnit: 80 },

  // Cooked quinoa. USDA FDC #168917. gramsPerUnit=185 → modal opens at 185 g (1 cup cooked).
  { name: "קינואה מבושלת", category: "carb", kcalPer100: 120, proteinPer100: 4.4, carbsPer100: 21.3, fatPer100: 1.9, defaultUnit: "g", gramsPerUnit: 185 },

  // Cooked buckwheat groats. USDA FDC #170686. gramsPerUnit=170 → modal opens at 170 g (1 cup).
  { name: "כוסמת מבושלת", category: "carb", kcalPer100: 92, proteinPer100: 3.4, carbsPer100: 19.9, fatPer100: 0.6, defaultUnit: "g", gramsPerUnit: 170 },

  // ── Cooked dishes ──────────────────────────────────────────────────────────
  // Pasta with tomato sauce, no meat. Average home recipe. 1 plate ≈ 300 g.
  { name: "פסטה ברוטב עגבניות", category: "carb", kcalPer100: 130, proteinPer100: 4.0, carbsPer100: 22.0, fatPer100: 2.0, defaultUnit: "unit", gramsPerUnit: 300 },

  // Vegetarian lasagna, home-cooked with ricotta & vegetables. 1 portion ≈ 285 g.
  { name: "לזניה צמחונית", category: "carb", kcalPer100: 130, proteinPer100: 6.0, carbsPer100: 14.0, fatPer100: 5.5, defaultUnit: "unit", gramsPerUnit: 285 },

  // ── Street food ────────────────────────────────────────────────────────────
  // Israeli falafel ball, deep-fried. 1 ball (walnut-sized) ≈ 20 g.
  { name: "פלאפל", category: "carb", kcalPer100: 333, proteinPer100: 13.3, carbsPer100: 31.8, fatPer100: 17.8, defaultUnit: "unit", gramsPerUnit: 20 },

  // ── Sweets ─────────────────────────────────────────────────────────────────
  // Kinder Happy Hippo hazelnut. FatSecret/Nutracheck. 1 piece = 20.7 g ≈ 21 g.
  { name: "Kinder Happy Hippo", category: "sweet", kcalPer100: 545, proteinPer100: 8.5, carbsPer100: 57.0, fatPer100: 31.0, defaultUnit: "unit", gramsPerUnit: 21 },

  // Pesek Zman classic (Elite). Standard bar = 45 g. Eat This Much / MyNetDiary.
  { name: "פסק זמן", category: "sweet", kcalPer100: 556, proteinPer100: 6.0, carbsPer100: 51.0, fatPer100: 33.0, defaultUnit: "unit", gramsPerUnit: 45 }
];

export async function ensureCloudNutritionSeed() {
  const now = new Date().toISOString();
  // Always upsert built-in ingredients so macro / unit corrections propagate on deploy.
  // User-created ingredients are NOT overwritten (isBuiltIn=0 rows are untouched).
  for (const item of seedIngredients) {
    await dbQuery(
      `
      INSERT INTO nutrition_ingredients
        (id, name, category, kcalPer100, proteinPer100, carbsPer100, fatPer100, defaultUnit, gramsPerUnit, isBuiltIn, createdAt, updatedAt)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10,$10)
      ON CONFLICT(name) DO UPDATE SET
        category      = EXCLUDED.category,
        kcalPer100    = EXCLUDED.kcalPer100,
        proteinPer100 = EXCLUDED.proteinPer100,
        carbsPer100   = EXCLUDED.carbsPer100,
        fatPer100     = EXCLUDED.fatPer100,
        defaultUnit   = EXCLUDED.defaultUnit,
        gramsPerUnit  = EXCLUDED.gramsPerUnit,
        isBuiltIn     = 1,
        updatedAt     = EXCLUDED.updatedAt
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

