import { NextRequest, NextResponse } from "next/server";
import { formatISODate } from "@/lib/date";
import { buildDailyCoach } from "@/lib/smart-coach";
import { getNutritionMealsToday } from "@/lib/nutrition-engine";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date") ?? formatISODate();
  const { recommendation, source, aiError } = await buildDailyCoach(date);
  const nutritionMeals = getNutritionMealsToday(date);

  return NextResponse.json({
    source,
    aiError: aiError ?? null,
    workoutType: recommendation.workoutType,
    durationMin: recommendation.durationMin,
    intensityZone: recommendation.intensityZone,
    intensityExplanation: recommendation.intensityExplanation,
    alternatives: recommendation.alternatives,
    explanationFactors: recommendation.explanationFactors,
    confidence: recommendation.confidence,
    longExplanation: recommendation.longExplanation,
    rationaleDetails: recommendation.rationaleDetails,
    primarySession: recommendation.primarySession,
    alternativeSessions: recommendation.alternativeSessions,
    dayStatus: recommendation.dayStatus,
    dayStatusText: recommendation.dayStatusText,
    nutritionMeals
  });
}
