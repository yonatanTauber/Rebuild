import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { addNutritionIngredient } from "@/lib/nutrition-engine";
import { listNutritionIngredients } from "@/lib/db";
import { getDbProvider, dbQueryOne, dbQuery } from "@/lib/db-driver";
import { migrateDb } from "@/lib/db-migrate";
import { ensureCloudNutritionSeed, cloudListNutritionIngredients } from "@/lib/nutrition-cloud";
import { randomUUID } from "node:crypto";
export const dynamic = "force-dynamic";

export const runtime = "nodejs";

export async function GET() {
  if (getDbProvider() === "postgres") {
    await migrateDb();
    await ensureCloudNutritionSeed();
    const ingredients = await cloudListNutritionIngredients();
    return NextResponse.json({ ingredients });
  }
  return NextResponse.json({ ingredients: listNutritionIngredients() });
}

const schema = z.object({
  name: z.string().min(1).max(120),
  category: z.enum(["protein", "carb", "fat", "sweet", "vegetable", "fruit", "dairy", "hydration", "mixed"]),
  kcalPer100: z.number().min(0).max(1000).optional(),
  proteinPer100: z.number().min(0).max(100),
  carbsPer100: z.number().min(0).max(100),
  fatPer100: z.number().min(0).max(100),
  defaultUnit: z.enum(["g", "ml", "unit"]),
  gramsPerUnit: z.number().min(0.1).max(2000)
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (getDbProvider() !== "postgres") {
    const ingredient = addNutritionIngredient(parsed.data);
    if (!ingredient) {
      return NextResponse.json({ error: "failed to create ingredient" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, ingredient });
  }

  await migrateDb();
  await ensureCloudNutritionSeed();

  const name = parsed.data.name.trim();
  const existing = await dbQueryOne<Record<string, unknown>>(
    "SELECT * FROM nutrition_ingredients WHERE LOWER(name) = LOWER($1) LIMIT 1",
    [name]
  );
  if (existing) {
    return NextResponse.json({ ok: true, ingredient: existing });
  }

  const now = new Date().toISOString();
  const kcalPer100 =
    typeof parsed.data.kcalPer100 === "number" && Number.isFinite(parsed.data.kcalPer100) && parsed.data.kcalPer100 > 0
      ? parsed.data.kcalPer100
      : Math.round(parsed.data.proteinPer100 * 4 + parsed.data.carbsPer100 * 4 + parsed.data.fatPer100 * 9);

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
      name,
      parsed.data.category,
      kcalPer100,
      parsed.data.proteinPer100,
      parsed.data.carbsPer100,
      parsed.data.fatPer100,
      parsed.data.defaultUnit,
      parsed.data.gramsPerUnit,
      now
    ]
  );

  const created = await dbQueryOne<Record<string, unknown>>("SELECT * FROM nutrition_ingredients WHERE id = $1", [id]);
  if (!created) {
    return NextResponse.json({ error: "failed to create ingredient" }, { status: 400 });
  }
  return NextResponse.json({ ok: true, ingredient: created });
}
