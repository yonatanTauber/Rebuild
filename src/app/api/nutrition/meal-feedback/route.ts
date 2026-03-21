import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { setMealFeedback } from "@/lib/nutrition-engine";
import { getDbProvider } from "@/lib/db-driver";
import { cloudSetNutritionMealFeedback } from "@/lib/nutrition-cloud-meals";

export const runtime = "nodejs";

const schema = z.object({
  mealId: z.string().min(1),
  accepted: z.boolean().nullable()
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (getDbProvider() === "postgres") {
    const result = await cloudSetNutritionMealFeedback(parsed.data.mealId, parsed.data.accepted);
    if (!result.ok) {
      return NextResponse.json({ error: "meal not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }
  const result = setMealFeedback(parsed.data.mealId, parsed.data.accepted);
  if (!result.ok) {
    return NextResponse.json({ error: "meal not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
