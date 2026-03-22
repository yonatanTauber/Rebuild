import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getDbProvider, dbQuery, dbQueryOne } from "@/lib/db-driver";
import { migrateDb } from "@/lib/db-migrate";
import { ensureCloudNutritionSeed } from "@/lib/nutrition-cloud";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ingredientLineSchema = z.object({
  ingredientId: z.string(),
  name: z.string(),
  quantity: z.number().positive(),
  unit: z.enum(["g", "ml", "unit", "tbsp", "tsp"]),
  grams: z.number().min(0),
  kcal: z.number().min(0),
  proteinG: z.number().min(0),
  carbsG: z.number().min(0),
  fatG: z.number().min(0),
});

const recipeSchema = z.object({
  name: z.string().min(1).max(120),
  servings: z.number().int().min(1).max(99).default(1),
  ingredients: z.array(ingredientLineSchema).min(1),
  notes: z.string().max(500).optional(),
});

async function ensureReady() {
  await migrateDb();
  await ensureCloudNutritionSeed();
}

export async function GET() {
  await ensureReady();
  const res = await dbQuery<Record<string, unknown>>(
    `SELECT id, name, servings, ingredientsJson, totalGrams,
            kcalPerServing, proteinPerServing, carbsPerServing, fatPerServing,
            ingredientId, notes, createdAt
     FROM nutrition_recipes ORDER BY createdAt DESC`
  );
  const recipes = res.rows.map((r) => ({
    id: String((r as any).id),
    name: String((r as any).name),
    servings: Number((r as any).servings ?? 1),
    ingredients: (() => { try { return JSON.parse(String((r as any).ingredientsjson ?? (r as any).ingredientsJson ?? "[]")); } catch { return []; } })(),
    totalGrams: Number((r as any).totalgrams ?? (r as any).totalGrams ?? 0),
    kcalPerServing: Number((r as any).kcalperserving ?? (r as any).kcalPerServing ?? 0),
    proteinPerServing: Number((r as any).proteinperserving ?? (r as any).proteinPerServing ?? 0),
    carbsPerServing: Number((r as any).carbsperserving ?? (r as any).carbsPerServing ?? 0),
    fatPerServing: Number((r as any).fatperserving ?? (r as any).fatPerServing ?? 0),
    ingredientId: (r as any).ingredientid ?? (r as any).ingredientId ?? null,
    notes: (r as any).notes ?? null,
    createdAt: String((r as any).createdat ?? (r as any).createdAt),
  }));
  return NextResponse.json({ recipes });
}

export async function POST(req: NextRequest) {
  await ensureReady();
  const body = await req.json().catch(() => ({}));
  const parsed = recipeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { name, servings, ingredients, notes } = parsed.data;

  // Calculate totals
  const totalKcal   = ingredients.reduce((s, i) => s + i.kcal, 0);
  const totalProtein = ingredients.reduce((s, i) => s + i.proteinG, 0);
  const totalCarbs  = ingredients.reduce((s, i) => s + i.carbsG, 0);
  const totalFat    = ingredients.reduce((s, i) => s + i.fatG, 0);
  const totalGrams  = ingredients.reduce((s, i) => s + i.grams, 0);

  const kcalPerServing   = Math.round(totalKcal / servings);
  const proteinPerServing = Math.round(totalProtein / servings * 10) / 10;
  const carbsPerServing  = Math.round(totalCarbs / servings * 10) / 10;
  const fatPerServing    = Math.round(totalFat / servings * 10) / 10;
  const gramsPerServing  = Math.round(totalGrams / servings);

  // Compute per-100g for ingredient catalog entry
  const factor = gramsPerServing > 0 ? 100 / gramsPerServing : 1;
  const kcalPer100   = Math.round(kcalPerServing * factor);
  const proteinPer100 = Math.round(proteinPerServing * factor * 10) / 10;
  const carbsPer100  = Math.round(carbsPerServing * factor * 10) / 10;
  const fatPer100    = Math.round(fatPerServing * factor * 10) / 10;

  // Create/update catalog ingredient for this recipe
  const ingName = `מתכון: ${name}`;
  const existingIng = await dbQueryOne<Record<string, unknown>>(
    "SELECT id FROM nutrition_ingredients WHERE LOWER(name) = LOWER($1) LIMIT 1",
    [ingName]
  );

  let ingredientId: string;
  const now = new Date().toISOString();

  if (existingIng?.id) {
    ingredientId = String((existingIng as any).id);
    await dbQuery(
      `UPDATE nutrition_ingredients
       SET kcalPer100=$1, proteinPer100=$2, carbsPer100=$3, fatPer100=$4,
           gramsPerUnit=$5, updatedAt=$6
       WHERE id=$7`,
      [kcalPer100, proteinPer100, carbsPer100, fatPer100, gramsPerServing, now, ingredientId]
    );
  } else {
    ingredientId = randomUUID();
    await dbQuery(
      `INSERT INTO nutrition_ingredients
         (id, name, category, kcalPer100, proteinPer100, carbsPer100, fatPer100,
          defaultUnit, gramsPerUnit, isBuiltIn, createdAt, updatedAt)
       VALUES ($1,$2,'mixed',$3,$4,$5,$6,'unit',$7,0,$8,$8)`,
      [ingredientId, ingName, kcalPer100, proteinPer100, carbsPer100, fatPer100, gramsPerServing, now]
    );
  }

  // Save or update recipe
  const existing = await dbQueryOne<Record<string, unknown>>(
    "SELECT id FROM nutrition_recipes WHERE LOWER(name) = LOWER($1) LIMIT 1",
    [name]
  );

  let recipeId: string;
  if (existing?.id) {
    recipeId = String((existing as any).id);
    await dbQuery(
      `UPDATE nutrition_recipes
       SET name=$1, servings=$2, ingredientsJson=$3, totalGrams=$4,
           kcalPerServing=$5, proteinPerServing=$6, carbsPerServing=$7, fatPerServing=$8,
           ingredientId=$9, notes=$10
       WHERE id=$11`,
      [name, servings, JSON.stringify(ingredients), totalGrams,
       kcalPerServing, proteinPerServing, carbsPerServing, fatPerServing,
       ingredientId, notes ?? null, recipeId]
    );
  } else {
    recipeId = randomUUID();
    await dbQuery(
      `INSERT INTO nutrition_recipes
         (id, name, servings, ingredientsJson, totalGrams,
          kcalPerServing, proteinPerServing, carbsPerServing, fatPerServing,
          ingredientId, notes, createdAt)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [recipeId, name, servings, JSON.stringify(ingredients), totalGrams,
       kcalPerServing, proteinPerServing, carbsPerServing, fatPerServing,
       ingredientId, notes ?? null, now]
    );
  }

  return NextResponse.json({
    ok: true,
    recipeId,
    ingredientId,
    kcalPerServing,
    proteinPerServing,
    carbsPerServing,
    fatPerServing,
    gramsPerServing,
  });
}
