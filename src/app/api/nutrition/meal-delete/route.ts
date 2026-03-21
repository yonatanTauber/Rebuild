import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { deleteNutritionMeal } from "@/lib/nutrition-engine";
import { getDbProvider } from "@/lib/db-driver";
import { cloudDeleteNutritionMeal } from "@/lib/nutrition-cloud-meals";
export const dynamic = "force-dynamic";

export const runtime = "nodejs";

const schema = z.object({
  mealId: z.string().min(1)
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (getDbProvider() === "postgres") {
    const result = await cloudDeleteNutritionMeal(parsed.data.mealId);
    if (!result.ok) {
      return NextResponse.json({ error: "meal not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }

  const updated = deleteNutritionMeal(parsed.data.mealId);
  if (!updated) {
    return NextResponse.json({ error: "meal not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, ...updated });
}
