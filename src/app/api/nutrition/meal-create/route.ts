import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { formatISODate } from "@/lib/date";
import { createNutritionMealForSlot } from "@/lib/nutrition-engine";
import { getDbProvider } from "@/lib/db-driver";
import { cloudCreateNutritionMealForSlot } from "@/lib/nutrition-cloud-meals";

export const runtime = "nodejs";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(formatISODate()),
  slot: z.enum(["breakfast", "pre_run", "lunch", "dinner", "snack", "drinks"])
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (getDbProvider() === "postgres") {
    const meal = await cloudCreateNutritionMealForSlot(parsed.data.date, parsed.data.slot);
    if (!meal) {
      return NextResponse.json({ error: "failed to create meal" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, meal });
  }

  const meal = createNutritionMealForSlot(parsed.data.date, parsed.data.slot);
  if (!meal) {
    return NextResponse.json({ error: "failed to create meal" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, meal });
}
