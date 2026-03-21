import { NextRequest, NextResponse } from "next/server";
import { getNutritionForecast } from "@/lib/nutrition-engine";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const daysRaw = Number(request.nextUrl.searchParams.get("days") ?? "7");
  const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(14, Math.round(daysRaw))) : 7;
  return NextResponse.json({ days: getNutritionForecast(undefined, days) });
}
