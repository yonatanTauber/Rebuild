import { NextRequest, NextResponse } from "next/server";
import { computeScores } from "@/lib/engine";
import { addDaysISO, formatISODate } from "@/lib/date";
import { getWorkoutsBetween } from "@/lib/db";
import { buildDailyCoach } from "@/lib/smart-coach";
import { getNutritionDayBundle } from "@/lib/nutrition-engine";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date") ?? formatISODate();
  const scores = computeScores(date);
  const { recommendation, coachAgent, source, aiError } = await buildDailyCoach(date);
  const nutritionBundle = getNutritionDayBundle(date);
  const todayWorkouts = getWorkoutsBetween(`${date}T00:00:00.000Z`, `${addDaysISO(date, 1)}T00:00:00.000Z`).map((w) => ({
    id: w.id,
    sport: w.sport,
    startAt: w.startAt,
    durationSec: w.durationSec,
    distanceM: w.distanceM ?? null
  }));

  return NextResponse.json({
    source,
    aiError: aiError ?? null,
    readinessScore: scores.readinessScore,
    fatigueScore: scores.fatigueScore,
    fitnessScore: scores.fitnessScore,
    stateTag: scores.stateTag,
    stateLabel: scores.stateLabel,
    stateHint: scores.stateHint,
    recommendation: recommendation.workoutType,
    explanation: recommendation.explanationFactors.join("; "),
    explanationFactors: recommendation.explanationFactors,
    alerts: scores.readinessScore < 45 ? ["מומלץ להוריד עומס היום"] : [],
    todayWorkouts,
    coachAgent,
    recommendationPayload: recommendation,
    mealPlan: nutritionBundle.meals,
    nutritionTotals: nutritionBundle.totals
  });
}
