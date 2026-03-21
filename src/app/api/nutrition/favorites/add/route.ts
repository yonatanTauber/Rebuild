import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { formatISODate } from "@/lib/date";
import { addFavoriteToNutritionDay } from "@/lib/nutrition-engine";
import { getDbProvider } from "@/lib/db-driver";
import { cloudAddFavoriteToNutritionDay } from "@/lib/nutrition-cloud-meals";
export const dynamic = "force-dynamic";

export const runtime = "nodejs";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(formatISODate()),
  favoriteId: z.string().min(1),
  slot: z.enum(["breakfast", "pre_run", "lunch", "dinner", "snack", "drinks"]).optional(),
  quantity: z.number().positive().optional(),
  unit: z.enum(["g", "ml", "unit", "tbsp", "tsp"]).optional()
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const added =
    getDbProvider() === "postgres"
      ? await cloudAddFavoriteToNutritionDay(parsed.data.date, parsed.data.favoriteId, parsed.data.slot, {
          quantity: parsed.data.quantity,
          unit: parsed.data.unit
        })
      : addFavoriteToNutritionDay(parsed.data.date, parsed.data.favoriteId, parsed.data.slot, {
          quantity: parsed.data.quantity,
          unit: parsed.data.unit
        });
  if (!added) {
    return NextResponse.json({ error: "failed to add favorite" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, ...added });
}
