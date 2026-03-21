import { formatISODate, addDaysISO } from "@/lib/date";
import { computeScores, recommendToday } from "@/lib/engine";
import { getRecovery, getWeeklyPlan, getWorkoutsBetween } from "@/lib/db";
import { getNutritionDayBundle, getNutritionPantryBundle } from "@/lib/nutrition-engine";
import { nutritionUnitLabel } from "@/lib/nutrition-units";
import type { Recommendation } from "@/lib/types";

function summarizeHistory(workouts: ReturnType<typeof getWorkoutsBetween>) {
  if (workouts.length === 0) return "אין אימונים בולטים ב־72 השעות האחרונות.";
  const top = workouts.slice(-3);
  return top
    .map((w) => {
      const dist = w.distanceM ? `${Math.round((w.distanceM / 1000) * 10) / 10} ק\"מ` : "מרחק לא ידוע";
      const sportLabel = w.sport === "run" ? "ריצה" : w.sport === "bike" ? "אופניים" : w.sport === "swim" ? "שחייה" : "כוח";
      return `${sportLabel} ${dist} · ${Math.round(w.tssLike)} TSS`;
    })
    .join(" · ");
}

export type CoachAgentReport = {
  dailyNarrative: string;
  reasoning: string[];
  adjustments: string[];
  priority: Recommendation;
  nutritionPlan: ReturnType<typeof getNutritionDayBundle>["plan"];
  pantrySummary: string;
};

export function buildCoachAgentReport(date = formatISODate()): CoachAgentReport {
  const scores = computeScores(date);
  const recommendation = recommendToday(date);
  const nutrition = getNutritionDayBundle(date);
  const pantry = getNutritionPantryBundle(date);
  const weeklyPlan = getWeeklyPlan();
  const recovery = getRecovery(date);
  const history = getWorkoutsBetween(`${addDaysISO(date, -3)}T00:00:00.000Z`, `${addDaysISO(date, 1)}T00:00:00.000Z`);

  const reasoning = [
    `פרופיל שבועי: ${weeklyPlan.profile} (${weeklyPlan.availability})`,
    `סטטוס צ׳ק-אין: ${recovery ? `RPE ${recovery.rpe}` : "אין נתונים"}`,
    `אימונים אחרונים: ${summarizeHistory(history)}`
  ];

  const adjustments: string[] = [];
  if (scores.fatigueScore >= 70) adjustments.push("עדיף עומס מתון + התאוששות אקטיבית.");
  if (scores.readinessScore >= 85) adjustments.push("אפשר לשקול אימון איכות לפי הספורט שנבחר היום.");
  if (weeklyPlan.profile === "vacation") adjustments.push("בשבוע חופשה: עדיף 2 אימונים קצרים איכותיים ולא נפח גבוה.");
  if (recovery?.sorenessGlobal && recovery.sorenessGlobal >= 6) adjustments.push("הוסף מוביליטי וחימום ארוך לפני כל אימון.");

  const pantrySummary =
    pantry.items.length > 0
      ? `מצרכים זמינים: ${pantry.items
          .map((item) => `${item.ingredientName} ${item.quantity}${nutritionUnitLabel(item.unit)}`)
          .join(", ")}`
      : "לא הוזנו מצרכים זמינים להיום.";

  const narrative = [
    `Rebuild Coach: ${recommendation.primarySession.sessionName} ב-${recommendation.intensityZone}.`,
    `מדדים נוכחיים: Readiness ${scores.readinessScore}, Fatigue ${scores.fatigueScore}, Fitness ${scores.fitnessScore}.`,
    "ההמלצה התזונתית מתעדכנת לפי עומס האימון ומלאי המצרכים."
  ].join(" ");

  return {
    dailyNarrative: narrative,
    reasoning,
    adjustments,
    priority: recommendation,
    nutritionPlan: nutrition.plan,
    pantrySummary
  };
}
