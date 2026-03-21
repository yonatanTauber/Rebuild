import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { toggleIngredientFavorite } from "@/lib/nutrition-engine";
import { getDbProvider, dbQuery, dbQueryOne } from "@/lib/db-driver";
import { migrateDb } from "@/lib/db-migrate";
import { ensureCloudNutritionSeed } from "@/lib/nutrition-cloud";
export const dynamic = "force-dynamic";

export const runtime = "nodejs";

const schema = z.object({
  ingredientId: z.string().min(1),
  favorite: z.boolean().optional()
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (getDbProvider() === "postgres") {
    await migrateDb();
    await ensureCloudNutritionSeed();

    const found = await dbQueryOne<{ id: string }>("SELECT id FROM nutrition_ingredients WHERE id = $1 LIMIT 1", [
      parsed.data.ingredientId
    ]);
    if (!found?.id) {
      return NextResponse.json({ error: "ingredient not found" }, { status: 404 });
    }

    const now = new Date().toISOString();
    const shouldFavorite = parsed.data.favorite;
    if (shouldFavorite === false) {
      await dbQuery("DELETE FROM nutrition_ingredient_favorites WHERE ingredientId = $1", [parsed.data.ingredientId]);
      return NextResponse.json({ ok: true, favorite: false });
    }

    // default: toggle or set true
    const existing = await dbQueryOne<{ ingredientid: string }>(
      "SELECT ingredientId FROM nutrition_ingredient_favorites WHERE ingredientId = $1 LIMIT 1",
      [parsed.data.ingredientId]
    );
    const nextFavorite = shouldFavorite === true ? true : !Boolean(existing?.ingredientid ?? (existing as any)?.ingredientId);
    if (!nextFavorite) {
      await dbQuery("DELETE FROM nutrition_ingredient_favorites WHERE ingredientId = $1", [parsed.data.ingredientId]);
      return NextResponse.json({ ok: true, favorite: false });
    }
    await dbQuery(
      `
      INSERT INTO nutrition_ingredient_favorites (ingredientId, createdAt, updatedAt)
      VALUES ($1,$2,$2)
      ON CONFLICT(ingredientId) DO UPDATE SET updatedAt = EXCLUDED.updatedAt
      `,
      [parsed.data.ingredientId, now]
    );
    return NextResponse.json({ ok: true, favorite: true });
  }

  const updated = toggleIngredientFavorite(parsed.data.ingredientId, parsed.data.favorite);
  if (!updated) {
    return NextResponse.json({ error: "ingredient not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, ...updated });
}
