import { NextResponse } from "next/server";
import { formatISODate } from "@/lib/date";
import { computeScores, forecast, recommendToday } from "@/lib/engine";
import { getNutritionToday } from "@/lib/nutrition-engine";
import { getPendingWorkoutFeedback, getWeeklyPlan } from "@/lib/db";
export const dynamic = "force-dynamic";

export async function GET() {
  const today = formatISODate();
  const scores = computeScores(today);
  const recommendation = recommendToday(today);
  const week = forecast(7, today);
  const nutrition = getNutritionToday(today);
  const pendingFeedback = getPendingWorkoutFeedback(5, 7);

  return NextResponse.json({
    product: "Rebuild",
    locale: "he-IL",
    dateFormat: "DD-MM-YY",
    generatedAt: new Date().toISOString(),
    today,
    scores: {
      readiness: scores.readinessScore,
      fatigue: scores.fatigueScore,
      fitness: scores.fitnessScore,
      stateTag: scores.stateTag,
      stateLabel: scores.stateLabel,
      stateHint: scores.stateHint
    },
    recommendation: {
      workoutType: recommendation.workoutType,
      durationMin: recommendation.durationMin,
      intensityZone: recommendation.intensityZone,
      confidence: recommendation.confidence,
      dayStatus: recommendation.dayStatus,
      dayStatusText: recommendation.dayStatusText
    },
    weeklyPlan: getWeeklyPlan(),
    forecast: week,
    nutrition,
    pendingFeedbackCount: pendingFeedback.length
  });
}
