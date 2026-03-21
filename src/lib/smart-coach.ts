import { z } from "zod";
import { addDaysISO, formatISODate } from "@/lib/date";
import { getRecovery, getWeeklyPlan, getWorkoutsBetween } from "@/lib/db";
import { buildCoachAgentReport, type CoachAgentReport } from "@/lib/coach-agent";
import { getNutritionDayBundle, getNutritionPantryBundle } from "@/lib/nutrition-engine";
import { computeScores, recommendToday } from "@/lib/engine";
import type { Recommendation, Sport } from "@/lib/types";

const aiSessionSchema = z.object({
  sport: z.enum(["run", "bike", "swim"]),
  sessionName: z.string().min(2),
  durationMin: z.number().int().min(20).max(180),
  intensityZone: z.string().min(2).max(40),
  target: z.string().min(2),
  structure: z.string().min(2),
  why: z.string().min(2)
});

const aiResponseSchema = z.object({
  narrative: z.string().min(10),
  reasoning: z.array(z.string().min(2)).min(2).max(8),
  adjustments: z.array(z.string().min(2)).max(8).optional().default([]),
  workout: aiSessionSchema,
  alternatives: z.array(aiSessionSchema).max(3).optional().default([]),
  dayStatus: z.enum(["target_done", "can_add_short", "more_possible"]).optional(),
  dayStatusText: z.string().optional(),
  confidence: z.number().min(0.4).max(0.99).optional(),
  nutrition: z
    .object({
      preWorkoutNote: z.string().optional(),
      postWorkoutNote: z.string().optional(),
      pantrySummary: z.string().optional(),
      meals: z
        .array(
          z.object({
            slot: z.enum(["breakfast", "lunch", "dinner", "snack"]),
            title: z.string().min(2),
            totalKcal: z.number().min(50).max(2000),
            proteinG: z.number().min(0).max(120),
            carbsG: z.number().min(0).max(250),
            fatG: z.number().min(0).max(120),
            items: z
              .array(
                z.object({
                  name: z.string().min(1),
                  quantity: z.number().min(0.1).max(2000),
                  unit: z.enum(["g", "ml", "unit", "tbsp", "tsp"])
                })
              )
              .min(1)
              .max(8)
          })
        )
        .max(4)
        .optional()
    })
    .optional()
});

type DailyCoachResult = {
  recommendation: Recommendation;
  coachAgent: CoachAgentReport;
  source: "rules" | "ai";
  aiError?: string;
};

function intensityExplanation(zone: string) {
  if (zone.includes("Z3") || zone.includes("Z4")) {
    return "עצימות בינונית-גבוהה לפיתוח סף/מהירות, רק כשיש מוכנות טובה.";
  }
  if (zone.includes("Z1")) {
    return "עצימות קלה להתאוששות ושימור תנועה.";
  }
  return "עצימות אירובית מבוקרת לבניית בסיס.";
}

function isRecoverySession(session: { sessionName: string; intensityZone?: string }, dayStatus?: Recommendation["dayStatus"]) {
  if (dayStatus === "target_done") return true;
  const label = `${session.sessionName} ${session.intensityZone ?? ""}`;
  return /התאוששות|שחרור|מוביליטי|הליכה/.test(label) || (session.intensityZone ?? "").includes("Z1");
}

function normalizeAiDuration(
  durationMin: number,
  session: { sessionName: string; intensityZone?: string },
  dayStatus?: Recommendation["dayStatus"]
) {
  const minDuration = isRecoverySession(session, dayStatus) ? 20 : 30;
  return Math.max(minDuration, Math.round(durationMin));
}

function summarizeWorkload(date: string) {
  const start = `${addDaysISO(date, -7)}T00:00:00.000Z`;
  const end = `${addDaysISO(date, 1)}T00:00:00.000Z`;
  const workouts = getWorkoutsBetween(start, end);
  const today = workouts.filter((w) => w.startAt.slice(0, 10) === date);
  const last7 = workouts.filter((w) => w.startAt.slice(0, 10) !== date);
  const todayLoad = today.reduce((sum, w) => sum + w.tssLike, 0);
  const todayMinutes = today.reduce((sum, w) => sum + w.durationSec / 60, 0);
  const last7Load = last7.reduce((sum, w) => sum + w.tssLike, 0);

  return {
    todayCount: today.length,
    todayLoad: Math.round(todayLoad),
    todayMinutes: Math.round(todayMinutes),
    last7Count: last7.length,
    last7Load: Math.round(last7Load),
    recent: workouts.slice(-12).map((w) => ({
      date: w.startAt.slice(0, 10),
      sport: w.sport,
      durationMin: Math.round(w.durationSec / 60),
      distanceKm: w.distanceM ? Math.round((w.distanceM / 1000) * 10) / 10 : null,
      load: Math.round(w.tssLike)
    }))
  };
}

function extractJson(text: string) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }
  return text.trim();
}

async function callSmartModel(payload: unknown) {
  const apiKey = process.env.REBUILD_AI_API_KEY?.trim();
  if (!apiKey) return null;

  const model = process.env.REBUILD_AI_MODEL?.trim() || "gpt-4o-mini";
  const baseUrl = (process.env.REBUILD_AI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, "");
  const timeoutMs = Number(process.env.REBUILD_AI_TIMEOUT_MS ?? 15000);
  const systemPrompt =
    process.env.REBUILD_AI_SYSTEM_PROMPT?.trim() ||
    "אתה מאמן ריצה ותזונת ספורט מקצועי. תחזיר JSON בלבד. עדיפות ענפים: ריצה > שחייה > אופניים. אם Fatigue > 65 אל תציע פעילות בכלל: מנוחה בלבד. אם בוצע אימון משמעותי היום - אל תציע אימון איכות נוסף, תציע התאוששות או משלים קל. אימון של 20 דקות מותר רק בהתאוששות אמיתית; בשגרה אימונים צריכים להיות 30 דקות ומעלה. שמור היגיון ארוחות לפי slot (לא פסטה בבוקר כברירת מחדל אם יש חלופות).";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: JSON.stringify(payload)
          }
        ]
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`AI_HTTP_${response.status}: ${text.slice(0, 200)}`);
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("AI_EMPTY_CONTENT");

    const parsedJson = JSON.parse(extractJson(content));
    const parsed = aiResponseSchema.safeParse(parsedJson);
    if (!parsed.success) {
      throw new Error(`AI_SCHEMA_INVALID: ${parsed.error.issues[0]?.message ?? "unknown"}`);
    }
    return parsed.data;
  } finally {
    clearTimeout(timeout);
  }
}

function applyAiToRecommendation(base: Recommendation, ai: z.infer<typeof aiResponseSchema>): Recommendation {
  const normalizedPrimaryDuration = normalizeAiDuration(ai.workout.durationMin, ai.workout, ai.dayStatus ?? base.dayStatus);
  const primary = {
    sport: ai.workout.sport,
    sessionName: ai.workout.sessionName,
    durationMin: normalizedPrimaryDuration,
    target: ai.workout.target,
    structure: ai.workout.structure,
    why: ai.workout.why
  } as Recommendation["primarySession"];

  const alternatives = (ai.alternatives || []).map((alt) => ({
    sport: alt.sport,
    sessionName: alt.sessionName,
    durationMin: normalizeAiDuration(alt.durationMin, alt, ai.dayStatus ?? base.dayStatus),
    target: alt.target,
    structure: alt.structure,
    why: alt.why
  })) as Recommendation["alternativeSessions"];

  return {
    ...base,
    workoutType: primary.sessionName,
    durationMin: primary.durationMin,
    intensityZone: ai.workout.intensityZone,
    intensityExplanation: intensityExplanation(ai.workout.intensityZone),
    alternatives: alternatives.map((a) => `${a.sessionName} (${a.durationMin} דק')`),
    explanationFactors: ai.reasoning.length ? ai.reasoning : base.explanationFactors,
    confidence: ai.confidence ?? base.confidence,
    longExplanation: ai.narrative,
    rationaleDetails: ai.reasoning.length ? ai.reasoning : base.rationaleDetails,
    primarySession: primary,
    alternativeSessions: alternatives.length ? alternatives : base.alternativeSessions,
    dayStatus: ai.dayStatus ?? base.dayStatus,
    dayStatusText: ai.dayStatusText ?? base.dayStatusText
  };
}

function applyAiToCoach(base: CoachAgentReport, recommendation: Recommendation, ai: z.infer<typeof aiResponseSchema>) {
  const pantrySummary = ai.nutrition?.pantrySummary ?? base.pantrySummary;

  return {
    ...base,
    dailyNarrative: ai.narrative,
    reasoning: ai.reasoning.length ? ai.reasoning : base.reasoning,
    adjustments: ai.adjustments.length ? ai.adjustments : base.adjustments,
    priority: recommendation,
    pantrySummary,
    nutritionPlan: {
      ...base.nutritionPlan,
      preWorkoutNote: ai.nutrition?.preWorkoutNote ?? base.nutritionPlan.preWorkoutNote,
      postWorkoutNote: ai.nutrition?.postWorkoutNote ?? base.nutritionPlan.postWorkoutNote
    }
  } satisfies CoachAgentReport;
}

function validateAiNutrition(
  ai: z.infer<typeof aiResponseSchema>,
  localNutrition: ReturnType<typeof getNutritionDayBundle>,
  pantry: ReturnType<typeof getNutritionPantryBundle>
) {
  const meals = ai.nutrition?.meals;
  if (!meals || meals.length === 0) return true;

  const uniqueSlots = new Set(meals.map((meal) => meal.slot));
  if (uniqueSlots.size !== meals.length) {
    return { ok: false, reason: "AI_INVALID_DUPLICATE_SLOTS" as const };
  }

  const totalKcal = meals.reduce((sum, meal) => sum + meal.totalKcal, 0);
  const totalProtein = meals.reduce((sum, meal) => sum + meal.proteinG, 0);
  const totalCarbs = meals.reduce((sum, meal) => sum + meal.carbsG, 0);
  const totalFat = meals.reduce((sum, meal) => sum + meal.fatG, 0);
  const local = localNutrition.totals;

  const kcalRatio = local.kcal > 0 ? totalKcal / local.kcal : 1;
  const proteinRatio = local.proteinG > 0 ? totalProtein / local.proteinG : 1;
  const carbsRatio = local.carbsG > 0 ? totalCarbs / local.carbsG : 1;
  const fatRatio = local.fatG > 0 ? totalFat / local.fatG : 1;

  const ratioOutOfBounds = [kcalRatio, proteinRatio, carbsRatio, fatRatio].some((ratio) => ratio < 0.6 || ratio > 1.4);
  if (ratioOutOfBounds) {
    return { ok: false, reason: "AI_INVALID_MACRO_MISMATCH" as const };
  }

  const breakfast = meals.find((meal) => meal.slot === "breakfast");
  if (breakfast) {
    const breakfastText = breakfast.items.map((item) => item.name).join(" ");
    const hasHeavyBreakfast = breakfastText.includes("פסטה") || breakfastText.includes("אורז");
    const hasAlternativeInPantry = pantry.items.some(
      (item) =>
        (item.ingredientCategory === "dairy" ||
          item.ingredientCategory === "protein" ||
          item.ingredientCategory === "fruit") &&
        !item.ingredientName.includes("פסטה") &&
        !item.ingredientName.includes("אורז")
    );
    if (hasHeavyBreakfast && hasAlternativeInPantry) {
      return { ok: false, reason: "AI_INVALID_BREAKFAST_SLOT" as const };
    }
  }

  return { ok: true as const };
}

export async function buildDailyCoach(date = formatISODate()): Promise<DailyCoachResult> {
  const baseRecommendation = recommendToday(date);
  const baseCoach = buildCoachAgentReport(date);
  const apiKey = process.env.REBUILD_AI_API_KEY?.trim();

  if (!apiKey) {
    return {
      recommendation: baseRecommendation,
      coachAgent: baseCoach,
      source: "rules"
    };
  }

  const scores = computeScores(date);
  const recovery = getRecovery(date);
  const weeklyPlan = getWeeklyPlan();
  const workload = summarizeWorkload(date);
  const nutrition = getNutritionDayBundle(date);
  const pantry = getNutritionPantryBundle(date);

  const payload = {
    locale: "he-IL",
    athleteProfile: "runner-first",
    rules: {
      priority: ["run", "swim", "bike"] as Sport[],
      noSecondHardSessionSameDay: true,
      keepAdvicePractical: true
    },
    date,
    scores,
    recovery: recovery ?? null,
    weeklyPlan,
    workload,
    nutrition,
    pantry: pantry.items.map((item) => ({
      ingredientName: item.ingredientName,
      category: item.ingredientCategory,
      quantity: item.quantity,
      unit: item.unit,
      gramsEffective: item.gramsEffective
    })),
    baseRecommendation: {
      workoutType: baseRecommendation.workoutType,
      durationMin: baseRecommendation.durationMin,
      intensityZone: baseRecommendation.intensityZone,
      dayStatus: baseRecommendation.dayStatus,
      dayStatusText: baseRecommendation.dayStatusText,
      primarySession: baseRecommendation.primarySession,
      alternatives: baseRecommendation.alternativeSessions
    },
    outputContract:
      "JSON בלבד עם שדות narrative, reasoning[], adjustments[], workout{sport,sessionName,durationMin,intensityZone,target,structure,why}, alternatives[], dayStatus, dayStatusText, confidence, nutrition{preWorkoutNote,postWorkoutNote,pantrySummary, meals[{slot,title,totalKcal,proteinG,carbsG,fatG,items[{name,quantity,unit}]}]}"
  };

  try {
    const ai = await callSmartModel(payload);
    if (!ai) {
      return { recommendation: baseRecommendation, coachAgent: baseCoach, source: "rules" };
    }

    const nutritionValidation = validateAiNutrition(ai, nutrition, pantry);
    if (nutritionValidation !== true && !nutritionValidation.ok) {
      return {
        recommendation: baseRecommendation,
        coachAgent: baseCoach,
        source: "rules",
        aiError: nutritionValidation.reason
      };
    }

    const recommendation = applyAiToRecommendation(baseRecommendation, ai);
    const coachAgent = applyAiToCoach(baseCoach, recommendation, ai);

    return {
      recommendation,
      coachAgent,
      source: "ai"
    };
  } catch (error) {
    return {
      recommendation: baseRecommendation,
      coachAgent: baseCoach,
      source: "rules",
      aiError: error instanceof Error ? error.message : "AI_ERROR"
    };
  }
}
