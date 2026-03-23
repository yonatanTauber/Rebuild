import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDbProvider, dbQuery, dbQueryOne } from "@/lib/db-driver";
import { migrateDb } from "@/lib/db-migrate";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const editSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  category: z.enum(["protein", "carb", "fat", "sweet", "vegetable", "fruit", "dairy", "hydration", "mixed"]).optional(),
  kcalPer100: z.number().min(0).max(1000).optional(),
  proteinPer100: z.number().min(0).max(100).optional(),
  carbsPer100: z.number().min(0).max(100).optional(),
  fatPer100: z.number().min(0).max(100).optional(),
  defaultUnit: z.enum(["g", "ml", "unit"]).optional(),
  gramsPerUnit: z.number().min(0.1).max(2000).optional()
});

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = editSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const now = new Date().toISOString();

  if (getDbProvider() !== "postgres") {
    // Local SQLite — not supported for edit
    return NextResponse.json({ error: "edit not supported in local mode" }, { status: 400 });
  }

  await migrateDb();

  const sets: string[] = [];
  const values: (string | number)[] = [];
  let idx = 1;

  if (data.name !== undefined) { sets.push(`name = $${idx++}`); values.push(data.name); }
  if (data.category !== undefined) { sets.push(`category = $${idx++}`); values.push(data.category); }
  if (data.kcalPer100 !== undefined) { sets.push(`kcalPer100 = $${idx++}`); values.push(data.kcalPer100); }
  if (data.proteinPer100 !== undefined) { sets.push(`proteinPer100 = $${idx++}`); values.push(data.proteinPer100); }
  if (data.carbsPer100 !== undefined) { sets.push(`carbsPer100 = $${idx++}`); values.push(data.carbsPer100); }
  if (data.fatPer100 !== undefined) { sets.push(`fatPer100 = $${idx++}`); values.push(data.fatPer100); }
  if (data.defaultUnit !== undefined) { sets.push(`defaultUnit = $${idx++}`); values.push(data.defaultUnit); }
  if (data.gramsPerUnit !== undefined) { sets.push(`gramsPerUnit = $${idx++}`); values.push(data.gramsPerUnit); }

  if (sets.length === 0) return NextResponse.json({ ok: true });

  sets.push(`updatedAt = $${idx++}`);
  values.push(now);
  values.push(id);

  await dbQuery(
    `UPDATE nutrition_ingredients SET ${sets.join(", ")} WHERE id = $${idx}`,
    values
  );

  const updated = await dbQueryOne<Record<string, unknown>>("SELECT * FROM nutrition_ingredients WHERE id = $1", [id]);
  return NextResponse.json({ ok: true, ingredient: updated });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (getDbProvider() !== "postgres") {
    return NextResponse.json({ error: "delete not supported in local mode" }, { status: 400 });
  }

  await migrateDb();
  const ingredient = await dbQueryOne<{ id: string; name: string; isbuiltin?: number; isBuiltIn?: number }>(
    "SELECT id, name, isBuiltIn FROM nutrition_ingredients WHERE id = $1 LIMIT 1",
    [id]
  );
  if (!ingredient) {
    return NextResponse.json({ error: "ingredient not found" }, { status: 404 });
  }

  const isBuiltIn = Number((ingredient as any).isbuiltin ?? (ingredient as any).isBuiltIn ?? 0) === 1;
  const name = String((ingredient as any).name ?? "").trim();
  const now = new Date().toISOString();

  if (isBuiltIn && name) {
    await dbQuery(
      `
      INSERT INTO nutrition_ingredient_hidden (name, hiddenAt)
      VALUES ($1, $2)
      ON CONFLICT(name) DO UPDATE SET hiddenAt = EXCLUDED.hiddenAt
      `,
      [name, now]
    );
  }

  await dbQuery("DELETE FROM nutrition_ingredient_favorites WHERE ingredientId = $1", [id]);
  await dbQuery("DELETE FROM nutrition_preferences WHERE ingredientId = $1", [id]);
  await dbQuery("DELETE FROM nutrition_pantry_items WHERE ingredientId = $1", [id]);
  await dbQuery("DELETE FROM nutrition_ingredients WHERE id = $1", [id]);

  return NextResponse.json({ ok: true, deletedId: id, hiddenBuiltIn: isBuiltIn });
}
