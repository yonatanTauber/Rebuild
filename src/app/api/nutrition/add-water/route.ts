import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { formatISODate } from "@/lib/date";
import { getDbProvider, dbQuery, dbQueryOne } from "@/lib/db-driver";
import { migrateDb } from "@/lib/db-migrate";
import { ensureCloudNutritionSeed } from "@/lib/nutrition-cloud";
import { cloudAddFavoriteToNutritionDay } from "@/lib/nutrition-cloud-meals";
import { addFavoriteToNutritionDay } from "@/lib/nutrition-engine";
export const dynamic = "force-dynamic";

export const runtime = "nodejs";

const WATER_ML = 250;

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(formatISODate()),
  ml: z.number().positive().default(WATER_ML)
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { date, ml } = parsed.data;

  if (getDbProvider() === "postgres") {
    await migrateDb();
    await ensureCloudNutritionSeed();

    // Find or create the water ingredient
    let waterRow = await dbQueryOne<{ id: string }>(
      "SELECT id FROM nutrition_ingredients WHERE name = 'מים' LIMIT 1"
    );

    if (!waterRow?.id) {
      // Create water ingredient if it doesn't exist
      const { randomUUID } = await import("node:crypto");
      const newId = randomUUID();
      const now = new Date().toISOString();
      await dbQuery(
        `INSERT INTO nutrition_ingredients
          (id, name, category, kcalPer100, proteinPer100, carbsPer100, fatPer100, defaultUnit, gramsPerUnit, isBuiltIn, createdAt, updatedAt)
         VALUES ($1, 'מים', 'hydration', 0, 0, 0, 0, 'ml', 1, 1, $2, $2)
         ON CONFLICT(id) DO NOTHING`,
        [newId, now]
      );
      waterRow = await dbQueryOne<{ id: string }>(
        "SELECT id FROM nutrition_ingredients WHERE name = 'מים' LIMIT 1"
      );
    }

    if (!waterRow?.id) {
      return NextResponse.json({ error: "could not find or create water ingredient" }, { status: 500 });
    }

    const result = await cloudAddFavoriteToNutritionDay(
      date,
      `ingredient:${waterRow.id}`,
      "drinks",
      { quantity: ml, unit: "ml" }
    );

    if (!result) {
      return NextResponse.json({ error: "failed to add water" }, { status: 400 });
    }

    return NextResponse.json({ ok: true, ml, ...result });
  }

  // Local SQLite path — use nutrition engine
  const added = addFavoriteToNutritionDay(date, "water-quick", "drinks", { quantity: ml, unit: "ml" });
  if (!added) {
    return NextResponse.json({ error: "failed to add water" }, { status: 400 });
  }
  return NextResponse.json({ ok: true, ml, ...added });
}
