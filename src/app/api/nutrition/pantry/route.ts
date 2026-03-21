import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { formatISODate } from "@/lib/date";
import { getNutritionPantryBundle, upsertNutritionPantry } from "@/lib/nutrition-engine";
import { getDbProvider, dbQuery } from "@/lib/db-driver";
import { migrateDb } from "@/lib/db-migrate";
import { ensureCloudNutritionSeed, cloudListNutritionIngredients } from "@/lib/nutrition-cloud";
import { randomUUID } from "node:crypto";
export const dynamic = "force-dynamic";

export const runtime = "nodejs";

const pantryItemSchema = z.object({
  ingredientId: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.enum(["g", "ml", "unit", "tbsp", "tsp"])
});

const postSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  items: z.array(pantryItemSchema).max(200)
});

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date") ?? formatISODate();
  if (getDbProvider() !== "postgres") {
    return NextResponse.json(getNutritionPantryBundle(date));
  }

  await migrateDb();
  await ensureCloudNutritionSeed();

  const ingredients = await cloudListNutritionIngredients();
  const itemsRes = await dbQuery<{
    id: string;
    date: string;
    ingredientid: string;
    quantity: number;
    unit: string;
    gramseffective: number;
    ingredientname: string;
    ingredientcategory: string;
  }>(
    `
    SELECT
      p.id,
      p.date,
      p.ingredientId,
      p.quantity,
      p.unit,
      p.gramsEffective,
      i.name AS ingredientName,
      i.category AS ingredientCategory
    FROM nutrition_pantry_items p
    JOIN nutrition_ingredients i ON i.id = p.ingredientId
    WHERE p.date = $1
    ORDER BY i.category ASC, i.name ASC
    `,
    [date]
  );

  const items = itemsRes.rows.map((row) => ({
    id: String((row as any).id),
    date: String((row as any).date),
    ingredientId: String((row as any).ingredientid ?? (row as any).ingredientId),
    quantity: Number((row as any).quantity ?? 0),
    unit: String((row as any).unit),
    gramsEffective: Number((row as any).gramseffective ?? (row as any).gramsEffective ?? 0),
    ingredientName: String((row as any).ingredientname ?? (row as any).ingredientName ?? ""),
    ingredientCategory: String((row as any).ingredientcategory ?? (row as any).ingredientCategory ?? "")
  }));

  return NextResponse.json({ date, ingredients, items });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const date = parsed.data.date ?? formatISODate();
  if (getDbProvider() !== "postgres") {
    const payload = upsertNutritionPantry(date, parsed.data.items);
    return NextResponse.json({ ok: true, ...payload });
  }

  await migrateDb();
  await ensureCloudNutritionSeed();

  // Replace for date (cloud mode)
  await dbQuery("DELETE FROM nutrition_pantry_items WHERE date = $1", [date]);
  const now = new Date().toISOString();
  for (const item of parsed.data.items) {
    const quantity = Number(item.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    await dbQuery(
      `
      INSERT INTO nutrition_pantry_items
        (id, date, ingredientId, quantity, unit, gramsEffective, createdAt, updatedAt)
      SELECT
        $1, $2, i.id, $3, $4,
        CASE
          WHEN $4 = 'g' THEN $3
          WHEN $4 = 'ml' THEN $3
          WHEN $4 = 'unit' THEN $3 * i.gramsPerUnit
          WHEN $4 = 'tbsp' THEN $3 * i.gramsPerUnit
          WHEN $4 = 'tsp' THEN $3 * i.gramsPerUnit
          ELSE $3
        END,
        $5, $5
      FROM nutrition_ingredients i
      WHERE i.id = $6
      `,
      [randomUUID(), date, quantity, item.unit, now, item.ingredientId]
    );
  }

  return NextResponse.json({ ok: true, date });
}
