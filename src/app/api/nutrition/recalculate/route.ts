import { NextRequest, NextResponse } from "next/server";
import { recalculateNutritionFrom } from "@/lib/nutrition-engine";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { days?: number };
  const daysRaw = Number(body.days ?? 8);
  const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(21, Math.round(daysRaw))) : 8;
  const plans = recalculateNutritionFrom(undefined, days);
  return NextResponse.json({ ok: true, count: plans.length });
}
