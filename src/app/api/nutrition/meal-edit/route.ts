import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { editNutritionMeal } from "@/lib/nutrition-engine";
import { getDbProvider } from "@/lib/db-driver";
import { cloudEditNutritionMeal } from "@/lib/nutrition-cloud-meals";
export const dynamic = "force-dynamic";

export const runtime = "nodejs";

const schema = z.object({
  mealId: z.string().min(1),
  items: z
    .array(
      z.object({
        ingredientId: z.string().min(1),
        quantity: z.number().positive(),
        unit: z.enum(["g", "ml", "unit", "tbsp", "tsp"])
      })
    )
    .min(1)
    .max(12)
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (getDbProvider() === "postgres") {
    const result = await cloudEditNutritionMeal(parsed.data.mealId, parsed.data.items);
    if (!result.ok || !result.meal) {
      return NextResponse.json({ error: "meal not found or invalid items" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, meal: result.meal });
  }

  const updated = editNutritionMeal(parsed.data.mealId, parsed.data.items);
  if (!updated) {
    return NextResponse.json({ error: "meal not found or invalid items" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, ...updated });
}
