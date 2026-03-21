import { NextResponse } from "next/server";
import { getNutritionDayBundle } from "@/lib/nutrition-engine";

export async function GET() {
  return NextResponse.json(getNutritionDayBundle());
}
