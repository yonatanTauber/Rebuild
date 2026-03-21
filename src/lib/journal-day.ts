import { addDaysISO, formatISODate } from "@/lib/date";
import { computeScores } from "@/lib/engine";
import { computeRunScore } from "@/lib/run-score";
import { buildDailyCoach } from "@/lib/smart-coach";
import { getNutritionDayBundle } from "@/lib/nutrition-engine";
import { getRecovery, getWorkoutFeedbackForDate, getWorkoutsBetween } from "@/lib/db";
import { getWorkoutDetailData } from "@/lib/workout-detail";
import {
  cloudEnabled,
  cloudGetAthleteProfile,
  cloudGetRecovery,
  cloudGetWorkoutFeedbackForDate,
  cloudGetWorkoutsBetween,
  cloudGetWorkoutsSince
} from "@/lib/cloud-db";
import { cloudGetMealsByDate, cloudGetNutritionPlan } from "@/lib/nutrition-cloud-meals";
import type { CoachAgentReport } from "@/lib/coach-agent";
import type { Recommendation } from "@/lib/types";

type TargetStatus = "under" | "on_target" | "over";

export type JournalEnergyBattery = {
  start: number;
  current: number;
  end: number;
  isEstimated: boolean;
  inputs: {
    workloadPenalty: number;
    nutritionDelta: number;
    recoveryDelta: number;
  };
};

export type JournalDailyScoreComponent = {
  key: "morning" | "training" | "nutrition" | "recovery";
  label: string;
  score: number | null;
  weight: number;
  used: boolean;
};

export type JournalDailyScore = {
  value: number;
  label: string;
  confidence: number;
  partial: boolean;
  breakdown: JournalDailyScoreComponent[];
};

export type JournalDayBundle = {
  date: string;
  scores: {
    readinessScore: number;
    fatigueScore: number;
    fitnessScore: number;
    stateTag?: "overtraining_risk" | "on_the_spot" | "peaking" | "losing_momentum";
    stateLabel?: string;
    stateHint?: string;
  };
  recommendation: Recommendation | null;
  coachAgent: CoachAgentReport | null;
  source?: "rules" | "ai";
  aiError?: string | null;
  recovery: ReturnType<typeof getRecovery>;
  nutrition: ReturnType<typeof getNutritionDayBundle> & {
    target: {
      kcal: number;
      proteinG: number;
      carbsG: number;
      fatG: number;
    };
    deltaToTarget: {
      kcal: number;
      proteinG: number;
      carbsG: number;
      fatG: number;
    };
    status: {
      kcal: TargetStatus;
      protein: TargetStatus;
      kcalLabel: string;
      proteinLabel: string;
      noInput: boolean;
    };
  };
  workouts: Array<{
    id: string;
    sport: "run" | "bike" | "swim" | "strength";
    startAt: string;
    durationSec: number;
    durationForPaceSec: number;
    movingDurationSec: number | null;
    pauseDurationSec: number | null;
    distanceM: number | null;
    distanceRawKm: number | null;
    distanceOfficialKm: number | null;
    distanceDisplayKm: number | null;
    paceDisplayMinPerKm: number | null;
    avgHr: number | null;
    elevationM: number | null;
    tssLike: number;
    shoeId: string | null;
    shoeName: string | null;
    runScore: number | null;
    runScoreLabel: string | null;
  }>;
  workoutFeedback: ReturnType<typeof getWorkoutFeedbackForDate>;
  dayStatus: {
    label: string;
    hasWorkout: boolean;
  };
  energyBattery: JournalEnergyBattery;
  dailyScore: JournalDailyScore;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function percentile(values: number[], p: number, fallback: number) {
  if (!values.length) return fallback;
  const sorted = [...values].sort((a, b) => a - b);
  const safeP = clamp(p, 0, 1);
  const index = (sorted.length - 1) * safeP;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  if (low === high) return sorted[low];
  const ratio = index - low;
  return sorted[low] + (sorted[high] - sorted[low]) * ratio;
}

function normalizeRange(value: number, low: number, high: number) {
  if (!Number.isFinite(low) || !Number.isFinite(high) || high <= low) return 0.5;
  return clamp((value - low) / (high - low), 0, 1);
}

function isoDateInTimeZone(iso: string, timeZone: string) {
  const d = new Date(iso);
  // en-CA yields YYYY-MM-DD
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${day}`;
}

function parseTargetBundle(
  rationaleJson: string | null | undefined,
  fallback: { kcal: number; proteinG: number; carbsG: number; fatG: number }
) {
  try {
    const parsed = JSON.parse(rationaleJson || "{}") as {
      targetKcal?: number;
      targetProteinG?: number;
      targetCarbsG?: number;
      targetFatG?: number;
    };
    return {
      kcal: Number(parsed.targetKcal ?? fallback.kcal),
      proteinG: Number(parsed.targetProteinG ?? fallback.proteinG),
      carbsG: Number(parsed.targetCarbsG ?? fallback.carbsG),
      fatG: Number(parsed.targetFatG ?? fallback.fatG)
    };
  } catch {
    return fallback;
  }
}

function statusForDelta(delta: number, tolerance: number): TargetStatus {
  if (delta > tolerance) return "over";
  if (delta < -tolerance) return "under";
  return "on_target";
}

function statusLabel(status: TargetStatus, under: string, onTarget: string, over: string) {
  if (status === "under") return under;
  if (status === "over") return over;
  return onTarget;
}

function toMorningScore(recovery: ReturnType<typeof getRecovery>) {
  if (!recovery) return null;
  const sleepHoursScore = recovery.sleepHours != null ? clamp((recovery.sleepHours / 8) * 100, 20, 100) : null;
  const moodScore = recovery.mood != null ? clamp((recovery.mood / 5) * 100, 10, 100) : null;
  const rpeScore = recovery.rpe != null ? clamp(((11 - recovery.rpe) / 10) * 100, 10, 100) : null;
  const hrvScore = recovery.hrv != null ? clamp((recovery.hrv / 80) * 100, 10, 100) : null;
  const restHrScore = recovery.restingHr != null ? clamp(100 - (recovery.restingHr - 48) * 2.4, 10, 100) : null;
  const sorenessScore =
    recovery.sorenessGlobal != null ? clamp(((11 - recovery.sorenessGlobal) / 10) * 100, 10, 100) : null;

  const parts = [sleepHoursScore, moodScore, rpeScore, hrvScore, restHrScore, sorenessScore].filter(
    (value): value is number => value != null && Number.isFinite(value)
  );
  if (!parts.length) return null;
  return Math.round(parts.reduce((sum, value) => sum + value, 0) / parts.length);
}

function computeEnergyBattery(input: {
  date: string;
  scores: { readinessScore: number };
  nutrition: JournalDayBundle["nutrition"];
  workouts: JournalDayBundle["workouts"];
  workoutFeedback: JournalDayBundle["workoutFeedback"];
  recovery: ReturnType<typeof getRecovery>;
}) {
  const todayIso = formatISODate();
  const isToday = input.date === todayIso;
  const morningScore = toMorningScore(input.recovery);
  const isEstimated = morningScore == null;
  const start = clamp(morningScore ?? Math.round(input.scores.readinessScore * 0.7 + 25), 8, 98);

  const totalLoad = input.workouts.reduce((sum, item) => sum + item.tssLike, 0);
  const workoutMinutes = input.workouts.reduce((sum, item) => sum + item.durationSec / 60, 0);
  const workloadPenalty = clamp(totalLoad * 0.26 + workoutMinutes * 0.08, 0, 55);

  const noNutritionInput = input.nutrition.status.noInput;
  const kcalDelta = input.nutrition.deltaToTarget.kcal;
  const proteinDelta = input.nutrition.deltaToTarget.proteinG;
  const kcalAdj = noNutritionInput ? -8 : clamp(8 - Math.abs(kcalDelta) / 28, -12, 9);
  const proteinAdj = noNutritionInput ? -4 : clamp(7 - Math.abs(proteinDelta) * 0.65, -10, 8);
  const nutritionDelta = clamp(kcalAdj + proteinAdj, -20, 15);

  const feedbackParts = input.workoutFeedback.flatMap((item) => {
    const list: number[] = [];
    if (item.recoveryScore != null) list.push((6 - item.recoveryScore) * 7);
    if (item.satisfactionScore != null) list.push((6 - item.satisfactionScore) * 5);
    if (item.painScore != null) list.push(-item.painScore * 6);
    if (item.overallLoadScore != null) list.push(-item.overallLoadScore * 4);
    return list;
  });
  const recoveryDelta = clamp(
    feedbackParts.length ? feedbackParts.reduce((sum, value) => sum + value, 0) / feedbackParts.length : 0,
    -18,
    12
  );

  const end = clamp(Math.round(start - workloadPenalty + nutritionDelta + recoveryDelta), 0, 100);
  const progress = isToday ? clamp((new Date().getHours() + new Date().getMinutes() / 60) / 24, 0, 1) : 1;
  const current = clamp(Math.round(start + (end - start) * progress), 0, 100);

  return {
    start,
    current,
    end,
    isEstimated,
    inputs: {
      workloadPenalty: Math.round(workloadPenalty),
      nutritionDelta: Math.round(nutritionDelta),
      recoveryDelta: Math.round(recoveryDelta)
    }
  } satisfies JournalEnergyBattery;
}

function computeTrainingScore(workouts: JournalDayBundle["workouts"], feedback: JournalDayBundle["workoutFeedback"]) {
  if (!workouts.length) return 72;
  const runScores = workouts
    .map((workout) => workout.runScore)
    .filter((value): value is number => value != null && Number.isFinite(value));
  if (runScores.length) {
    return clamp(Math.round(runScores.reduce((sum, value) => sum + value, 0) / runScores.length), 35, 100);
  }
  const load = workouts.reduce((sum, item) => sum + item.tssLike, 0);
  const loadScore = clamp(90 - Math.max(0, load - 45) * 0.48, 25, 92);
  const penalty =
    feedback.reduce((sum, item) => {
      let local = 0;
      if (item.painScore != null) local += item.painScore * 2.5;
      if (item.breathingScore != null) local += item.breathingScore * 1.6;
      if (item.overallLoadScore != null) local += item.overallLoadScore * 1.6;
      return sum + local;
    }, 0) / Math.max(1, feedback.length);
  return clamp(Math.round(loadScore - penalty), 15, 95);
}

function computeNutritionScore(nutrition: JournalDayBundle["nutrition"]) {
  if (nutrition.status.noInput) return null;
  const kcalPart = clamp(100 - Math.abs(nutrition.deltaToTarget.kcal) / 9, 0, 100);
  const proteinPart = clamp(100 - Math.abs(nutrition.deltaToTarget.proteinG) * 2.5, 0, 100);
  const carbsPart = clamp(100 - Math.abs(nutrition.deltaToTarget.carbsG) * 1.25, 0, 100);
  const fatPart = clamp(100 - Math.abs(nutrition.deltaToTarget.fatG) * 2, 0, 100);
  return Math.round(kcalPart * 0.35 + proteinPart * 0.35 + carbsPart * 0.15 + fatPart * 0.15);
}

function computeRecoveryScore(feedback: JournalDayBundle["workoutFeedback"], recovery: ReturnType<typeof getRecovery>) {
  const pieces: number[] = [];
  if (recovery?.sorenessGlobal != null) pieces.push(clamp((11 - recovery.sorenessGlobal) * 10, 0, 100));
  if (recovery?.rpe != null) pieces.push(clamp((11 - recovery.rpe) * 10, 0, 100));
  for (const item of feedback) {
    if (item.recoveryScore != null) pieces.push(clamp((6 - item.recoveryScore) * 20, 0, 100));
    if (item.painScore != null) pieces.push(clamp((6 - item.painScore) * 20, 0, 100));
    if (item.satisfactionScore != null) pieces.push(clamp((6 - item.satisfactionScore) * 20, 0, 100));
  }
  if (!pieces.length) return null;
  return Math.round(pieces.reduce((sum, value) => sum + value, 0) / pieces.length);
}

function labelForDailyScore(score: number) {
  if (score >= 85) return "יום חזק";
  if (score >= 70) return "יום טוב";
  if (score >= 55) return "יום בינוני";
  return "יום מאתגר";
}

function computeDailyScore(input: {
  morningScore: number | null;
  trainingScore: number | null;
  nutritionScore: number | null;
  recoveryScore: number | null;
}) {
  const breakdown: JournalDailyScoreComponent[] = [
    { key: "morning", label: "בוקר", score: input.morningScore, weight: 35, used: input.morningScore != null },
    { key: "training", label: "אימון", score: input.trainingScore, weight: 30, used: input.trainingScore != null },
    { key: "nutrition", label: "תזונה", score: input.nutritionScore, weight: 25, used: input.nutritionScore != null },
    { key: "recovery", label: "התאוששות/משוב", score: input.recoveryScore, weight: 10, used: input.recoveryScore != null }
  ];

  const used = breakdown.filter((item) => item.used && item.score != null);
  const usedWeight = used.reduce((sum, item) => sum + item.weight, 0);
  const value =
    usedWeight > 0
      ? Math.round(
          used.reduce((sum, item) => sum + ((item.score ?? 0) * item.weight) / usedWeight, 0)
        )
      : 50;
  const confidence = clamp(Math.round((usedWeight / 100) * 100), 0, 100);

  return {
    value,
    label: labelForDailyScore(value),
    confidence,
    partial: usedWeight < 100,
    breakdown
  } satisfies JournalDailyScore;
}

export async function buildJournalDayBundle(
  date: string,
  options: { includeCoach?: boolean } = {}
): Promise<JournalDayBundle> {
  const useCloud = cloudEnabled();
  const timeZone = process.env.REBUILD_TIMEZONE?.trim() || "Asia/Jerusalem";

  const nutritionRaw = useCloud
    ? (() => {
        // Filled below (async); keep a placeholder to satisfy TS.
        return null as unknown as ReturnType<typeof getNutritionDayBundle>;
      })()
    : getNutritionDayBundle(date);

  const coach = !useCloud && options.includeCoach ? await buildDailyCoach(date) : null;

  // In cloud mode we compute lightweight scores from the workouts history (no rules/feedback).
  const scores = useCloud ? null : computeScores(date);

  const clampLocal = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

  async function computeCloudScores() {
    // Port of `computeScores()` to cloud mode: same idea (CTL/ATL/TSB + recovery + feedback),
    // but based on Postgres-backed workouts/recovery/feedback.
    const historyDays = 89;
    const startIso = `${addDaysISO(date, -historyDays)}T00:00:00.000Z`;
    const workouts = await cloudGetWorkoutsSince(startIso);

    const crossTrainingWeight = 1.15; // cloud default (until rules are cloud-backed)
    const loadsByDate = new Map<string, number>();
    for (const w of workouts) {
      const day = isoDateInTimeZone(String(w.startAt), timeZone);
      const base = Number(w.tssLike ?? 0);
      const weighted = w.sport === "run" ? base : base * crossTrainingWeight;
      loadsByDate.set(day, (loadsByDate.get(day) ?? 0) + weighted);
    }

    const alpha7 = 2 / (7 + 1);
    const alpha42 = 2 / (42 + 1);
    let atl7 = 0;
    let ctl42 = 0;
    const atlSeries: number[] = [];
    const ctlSeries: number[] = [];
    const tsbSeries: number[] = [];

    for (let i = historyDays; i >= 0; i -= 1) {
      const d = addDaysISO(date, -i);
      const dayLoad = loadsByDate.get(d) ?? 0;
      atl7 = atl7 + alpha7 * (dayLoad - atl7);
      ctl42 = ctl42 + alpha42 * (dayLoad - ctl42);
      atlSeries.push(atl7);
      ctlSeries.push(ctl42);
      tsbSeries.push(ctl42 - atl7);
    }

    const tsb = ctl42 - atl7;
    const atlP10 = percentile(atlSeries, 0.1, Math.max(12, atl7 * 0.6));
    const atlP90 = percentile(atlSeries, 0.9, Math.max(atlP10 + 18, atl7 * 1.1));
    const ctlP10 = percentile(ctlSeries, 0.1, Math.max(8, ctl42 * 0.55));
    const ctlP90 = percentile(ctlSeries, 0.9, Math.max(ctlP10 + 15, ctl42 * 1.08));
    const tsbP10 = percentile(tsbSeries, 0.1, -18);
    const tsbP90 = percentile(tsbSeries, 0.9, 10);

    const atlNorm = normalizeRange(atl7, atlP10, atlP90);
    const ctlNorm = normalizeRange(ctl42, ctlP10, ctlP90);
    const freshnessNorm = normalizeRange(tsb, tsbP10, tsbP90);

    const feedback = await cloudGetWorkoutFeedbackForDate(date);
    let fatigueBoost = 0;
    let readinessPenalty = 0;
    for (const item of feedback) {
      if (item.perceivedEffort === "hard") {
        fatigueBoost += 4;
        readinessPenalty += 4;
      }
      if (item.perceivedEffort === "max") {
        fatigueBoost += 8;
        readinessPenalty += 8;
      }
      if (item.bodyFeel === "heavy") {
        fatigueBoost += 4;
        readinessPenalty += 5;
      }
      if (item.bodyFeel === "pain") {
        fatigueBoost += 7;
        readinessPenalty += 9;
      }
      if (item.breathingFeel === "hard") {
        fatigueBoost += 3;
        readinessPenalty += 3;
      }
    }

    const recovery = await cloudGetRecovery(date);
    const profile = await cloudGetAthleteProfile();
    let penalty = 0;
    if (!recovery) {
      penalty = 7;
    } else {
      if (recovery.sleepHours != null) {
        if (recovery.sleepHours < 6) penalty += 10;
        else if (recovery.sleepHours < 7) penalty += 4;
      }
      if (recovery.sleepQuality != null && recovery.sleepQuality <= 2) penalty += 8;
      const hrvLowThreshold = Math.max(20, Math.round((profile.hrvBaseline ?? 43) * 0.82));
      if (recovery.hrv != null && recovery.hrv < hrvLowThreshold) penalty += 10;
      const restingHrHighThreshold = Math.round((profile.restingHrBaseline ?? 58) + 6);
      if (recovery.restingHr != null && recovery.restingHr >= restingHrHighThreshold) penalty += 6;
      if (recovery.sorenessGlobal != null && recovery.sorenessGlobal >= 7) penalty += 12;
      if (recovery.rpe >= 8) penalty += 7;
    }

    const fatigueRaw = 26 + atlNorm * 50 + Math.max(0, atl7 - ctl42) * 0.12 + fatigueBoost * 0.45;
    const fatigueScore = clampLocal(Math.round(fatigueRaw), 8, 98);

    const fitnessRaw = 28 + ctlNorm * 54;
    const fitnessScore = clampLocal(Math.round(fitnessRaw), 10, 98);

    const todayLoad = loadsByDate.get(date) ?? 0;
    const freshnessScore = 24 + freshnessNorm * 62;
    const recoveryReserve = 100 - fatigueScore;
    const readinessBase = freshnessScore * 0.58 + fitnessScore * 0.24 + recoveryReserve * 0.18;
    const sameDayLoadPenalty =
      todayLoad >= 100 ? 6 :
      todayLoad >= 75 ? 4 :
      todayLoad >= 45 ? 2 :
      0;
    const readinessRaw = readinessBase - penalty * 0.6 - readinessPenalty * 0.45 - sameDayLoadPenalty;
    const readinessCap =
      todayLoad >= 100 ? 82 :
      todayLoad >= 75 ? 86 :
      todayLoad >= 50 ? 90 :
      todayLoad >= 30 ? 94 :
      todayLoad > 0 ? 90 :
      100;
    const severeFlag = penalty >= 28 || readinessPenalty >= 18;
    const readinessFloor = severeFlag ? 4 : 12;
    const readinessScore = clampLocal(Math.min(Math.round(readinessRaw), readinessCap), readinessFloor, 100);

    return { readinessScore, fatigueScore, fitnessScore };
  }

  const cloudScores = useCloud ? await computeCloudScores() : null;

  const cloudNutritionRaw = useCloud
    ? await (async () => {
        const plan = await cloudGetNutritionPlan(date);
        const meals = await cloudGetMealsByDate(date);
        const totals = meals
          .filter((meal) => meal.accepted === true)
          .reduce(
            (acc, meal) => {
              acc.kcal += meal.totalKcal;
              acc.proteinG += meal.proteinG;
              acc.carbsG += meal.carbsG;
              acc.fatG += meal.fatG;
              return acc;
            },
            { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }
          );
        return {
          date,
          plan,
          meals,
          totals: {
            kcal: Math.round(totals.kcal),
            proteinG: Math.round(totals.proteinG * 10) / 10,
            carbsG: Math.round(totals.carbsG * 10) / 10,
            fatG: Math.round(totals.fatG * 10) / 10
          },
          suggestedBySlot: {}
        } as ReturnType<typeof getNutritionDayBundle>;
      })()
    : null;

  const nutritionRawResolved = useCloud ? cloudNutritionRaw! : nutritionRaw;

  const target = parseTargetBundle(nutritionRawResolved.plan.rationaleJson, {
    kcal:
      typeof (nutritionRawResolved.plan as any).totalKcal === "number"
        ? (nutritionRawResolved.plan as any).totalKcal
        : Math.round(
            nutritionRawResolved.plan.proteinG * 4 +
              nutritionRawResolved.plan.carbsG * 4 +
              nutritionRawResolved.plan.fatG * 9
          ),
    proteinG: nutritionRawResolved.plan.proteinG,
    carbsG: nutritionRawResolved.plan.carbsG,
    fatG: nutritionRawResolved.plan.fatG
  });

  const deltaToTarget = {
    kcal: Math.round(nutritionRawResolved.totals.kcal - target.kcal),
    proteinG: Math.round((nutritionRawResolved.totals.proteinG - target.proteinG) * 10) / 10,
    carbsG: Math.round((nutritionRawResolved.totals.carbsG - target.carbsG) * 10) / 10,
    fatG: Math.round((nutritionRawResolved.totals.fatG - target.fatG) * 10) / 10
  };

  const noNutritionInput = !nutritionRawResolved.meals.some((meal) => meal.accepted === true || meal.accepted === false);
  const kcalStatus = statusForDelta(deltaToTarget.kcal, 120);
  const proteinStatus = statusForDelta(deltaToTarget.proteinG, 10);
  const kcalLabel = noNutritionInput ? "לא הוזן" : statusLabel(kcalStatus, "גרעון", "בטווח", "עודף");
  const proteinLabel = noNutritionInput ? "לא הוזן" : statusLabel(proteinStatus, "חסר", "עמדת", "מעל");

  const nutrition = {
    ...nutritionRawResolved,
    target,
    deltaToTarget,
    status: {
      kcal: noNutritionInput ? ("on_target" as const) : kcalStatus,
      protein: noNutritionInput ? ("on_target" as const) : proteinStatus,
      kcalLabel,
      proteinLabel,
      noInput: noNutritionInput
    }
  };

  const feedback = useCloud ? await cloudGetWorkoutFeedbackForDate(date) : getWorkoutFeedbackForDate(date);
  const feedbackByWorkoutId = new Map(feedback.map((item) => [item.workoutId, item]));

  const workoutsSource = useCloud
    ? (await cloudGetWorkoutsBetween(`${addDaysISO(date, -1)}T00:00:00.000Z`, `${addDaysISO(date, 2)}T00:00:00.000Z`))
        // Strava `start_date` is UTC; we treat "day" as local (Asia/Jerusalem) for the user.
        .filter((w) => isoDateInTimeZone(String(w.startAt), timeZone) === date)
    : getWorkoutsBetween(`${date}T00:00:00.000Z`, `${addDaysISO(date, 1)}T00:00:00.000Z`);

  const workouts = workoutsSource.map((workout) => {
    const detail = workout.sport === "run" ? getWorkoutDetailData(workout) : null;
    const avgHrFromTrack = detail?.avgHrFromTrack ?? null;
    const maxHrFromTrack = detail?.maxHrFromTrack ?? null;
    const effectiveAvgHr = avgHrFromTrack ?? workout.avgHr ?? null;
    const effectiveMaxHr = maxHrFromTrack ?? workout.maxHr ?? null;
    const rawDistanceKm =
      workout.distanceM != null && Number.isFinite(workout.distanceM) ? Math.max(0, workout.distanceM / 1000) : null;
    const distanceRawKm = detail?.distanceRawKm ?? rawDistanceKm;
    const distanceOfficialKm = detail?.distanceOfficialKm ?? null;
    const distanceDisplayKm = distanceOfficialKm ?? distanceRawKm;
    const movingDurationSec = detail?.movingDurationSec ?? null;
    const pauseDurationSec = detail?.pauseDurationSec ?? null;
    const durationForPaceSec =
      movingDurationSec != null && movingDurationSec > 0 ? movingDurationSec : workout.durationSec;
    const paceDisplayMinPerKm =
      distanceDisplayKm != null && distanceDisplayKm > 0 && durationForPaceSec > 0
        ? durationForPaceSec / 60 / distanceDisplayKm
        : null;
    const runFeedback = feedbackByWorkoutId.get(workout.id);
    const runScore =
      workout.sport === "run"
        ? computeRunScore({
            durationSec: workout.durationSec,
            avgHr: effectiveAvgHr,
            maxHr: effectiveMaxHr,
            movingDurationSec,
            splits: detail?.splits ?? [],
            feedback: runFeedback
              ? {
                  rpeScore: runFeedback.rpeScore,
                  legsLoadScore: runFeedback.legsLoadScore,
                  painScore: runFeedback.painScore,
                  recoveryScore: runFeedback.recoveryScore,
                  breathingScore: runFeedback.breathingScore,
                  overallLoadScore: runFeedback.overallLoadScore,
                  preRunNutritionScore: runFeedback.preRunNutritionScore,
                  satisfactionScore: runFeedback.satisfactionScore
                }
              : null
          })
        : null;

    return {
      id: workout.id,
      sport: workout.sport,
      startAt: workout.startAt,
      durationSec: workout.durationSec,
      durationForPaceSec,
      movingDurationSec,
      pauseDurationSec,
      distanceM: workout.distanceM ?? null,
      distanceRawKm,
      distanceOfficialKm,
      distanceDisplayKm,
      paceDisplayMinPerKm,
      avgHr: effectiveAvgHr,
      elevationM: workout.elevationM ?? null,
      tssLike: workout.tssLike,
      shoeId: workout.shoeId ?? null,
      shoeName: workout.shoeName ?? null,
      runScore: runScore?.score ?? null,
      runScoreLabel: runScore?.label ?? null
    };
  });

  // Match the log ordering: newest first.
  workouts.sort((a, b) => String(b.startAt).localeCompare(String(a.startAt)));

  const recovery = useCloud ? await cloudGetRecovery(date) : getRecovery(date);
  const dayStatus = noNutritionInput
    ? "לא הוזן אוכל"
    : kcalStatus === "on_target" && proteinStatus === "on_target"
      ? "על היעד"
      : kcalStatus === "over" || proteinStatus === "over"
        ? "מעל היעד"
        : "מתחת ליעד";

  const morningScore = toMorningScore(recovery);
  const trainingScore = computeTrainingScore(workouts, feedback);
  const nutritionScore = computeNutritionScore(nutrition);
  const recoveryScore = computeRecoveryScore(feedback, recovery);
  const dailyScore = computeDailyScore({
    morningScore,
    trainingScore,
    nutritionScore,
    recoveryScore
  });

  const energyBattery = computeEnergyBattery({
    date,
    scores: { readinessScore: useCloud ? cloudScores!.readinessScore : scores!.readinessScore },
    nutrition,
    workouts,
    workoutFeedback: feedback,
    recovery
  });

  return {
    date,
    scores: {
      readinessScore: useCloud ? cloudScores!.readinessScore : scores!.readinessScore,
      fatigueScore: useCloud ? cloudScores!.fatigueScore : scores!.fatigueScore,
      fitnessScore: useCloud ? cloudScores!.fitnessScore : scores!.fitnessScore,
      stateTag: useCloud ? undefined : scores!.stateTag,
      stateLabel: useCloud ? undefined : scores!.stateLabel,
      stateHint: useCloud ? undefined : scores!.stateHint
    },
    recommendation: coach?.recommendation ?? null,
    coachAgent: coach?.coachAgent ?? null,
    source: coach?.source,
    aiError: coach?.aiError ?? null,
    recovery,
    nutrition,
    workouts,
    workoutFeedback: feedback,
    dayStatus: {
      label: dayStatus,
      hasWorkout: workouts.length > 0
    },
    energyBattery,
    dailyScore
  };
}
