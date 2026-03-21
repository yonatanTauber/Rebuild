import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getWorkoutFeedback,
  replaceWorkoutFueling,
  upsertWorkoutFeedback
} from "@/lib/db";
import { cloudEnabled, cloudGetWorkoutFeedback, cloudUpsertWorkoutFeedback } from "@/lib/cloud-db";
export const dynamic = "force-dynamic";

export const runtime = "nodejs";

const legacyPerceivedEnum = z.enum(["easy", "moderate", "hard", "max"]);
const legacyBodyEnum = z.enum(["fresh", "normal", "heavy", "pain"]);
const legacyBreathingEnum = z.enum(["easy", "steady", "hard"]);
const runFuelingSourceEnum = z.enum(["none", "gel", "date", "other"]);
const strengthFocusEnum = z.enum(["full_body", "upper_body", "lower_body", "core"]);

const schema = z.object({
  workoutId: z.string().min(1),
  date: z.string().min(8),
  sport: z.enum(["run", "bike", "swim", "strength"]),
  perceivedEffort: legacyPerceivedEnum.optional(),
  bodyFeel: legacyBodyEnum.optional(),
  breathingFeel: legacyBreathingEnum.optional(),
  rpeScore: z.number().int().min(1).max(5).optional(),
  legsLoadScore: z.number().int().min(1).max(5).optional(),
  painScore: z.number().int().min(1).max(5).optional(),
  painArea: z.string().max(120).optional(),
  addFiveKmScore: z.number().int().min(1).max(5).optional(),
  recoveryScore: z.number().int().min(1).max(5).optional(),
  breathingScore: z.number().int().min(1).max(5).optional(),
  overallLoadScore: z.number().int().min(1).max(5).optional(),
  preRunNutritionScore: z.number().int().min(1).max(5).optional(),
  environmentScore: z.number().int().min(1).max(5).optional(),
  satisfactionScore: z.number().int().min(1).max(5).optional(),
  openNote: z.string().max(1000).optional(),
  fuelingSource: runFuelingSourceEnum.optional(),
  fuelingQuantity: z.number().min(0).optional(),
  strengthEffortScore: z.number().int().min(1).max(5).optional(),
  strengthMuscleLoadScore: z.number().int().min(1).max(5).optional(),
  strengthTechniqueScore: z.number().int().min(1).max(5).optional(),
  strengthFailureProximityScore: z.number().int().min(1).max(5).optional(),
  strengthPainScore: z.number().int().min(1).max(5).optional(),
  strengthRecoveryScore: z.number().int().min(1).max(5).optional(),
  strengthFocusArea: strengthFocusEnum.optional(),
  strengthPainArea: z.string().max(120).optional(),
  strengthOpenNote: z.string().max(1000).optional()
});

function legacyFromRunScores(input: {
  rpeScore: number;
  legsLoadScore: number;
  painScore: number;
  recoveryScore: number;
  breathingScore: number;
  overallLoadScore: number;
}) {
  const effortPivot = Math.max(input.rpeScore, input.overallLoadScore);
  const perceivedEffort: z.infer<typeof legacyPerceivedEnum> =
    effortPivot <= 2 ? "easy" : effortPivot <= 3 ? "moderate" : effortPivot === 4 ? "hard" : "max";

  let bodyFeel: z.infer<typeof legacyBodyEnum> = "normal";
  if (input.painScore >= 3) {
    bodyFeel = "pain";
  } else {
    const bodyPivot = Math.max(input.legsLoadScore, input.recoveryScore);
    if (bodyPivot <= 2) {
      bodyFeel = "fresh";
    } else if (bodyPivot >= 4) {
      bodyFeel = "heavy";
    }
  }

  const breathingFeel: z.infer<typeof legacyBreathingEnum> =
    input.breathingScore <= 2 ? "easy" : input.breathingScore <= 3 ? "steady" : "hard";

  return { perceivedEffort, bodyFeel, breathingFeel };
}

function runScoresFromLegacy(input: {
  perceivedEffort: z.infer<typeof legacyPerceivedEnum>;
  bodyFeel: z.infer<typeof legacyBodyEnum>;
  breathingFeel: z.infer<typeof legacyBreathingEnum>;
}) {
  const effortScore = input.perceivedEffort === "easy" ? 2 : input.perceivedEffort === "moderate" ? 3 : input.perceivedEffort === "hard" ? 4 : 5;
  const legsLoadScore = input.bodyFeel === "fresh" ? 2 : input.bodyFeel === "normal" ? 3 : input.bodyFeel === "heavy" ? 4 : 5;
  const painScore = input.bodyFeel === "pain" ? 4 : 1;
  const breathingScore = input.breathingFeel === "easy" ? 2 : input.breathingFeel === "steady" ? 3 : 4;
  return {
    rpeScore: effortScore,
    legsLoadScore,
    painScore,
    addFiveKmScore: effortScore,
    recoveryScore: input.bodyFeel === "fresh" ? 2 : input.bodyFeel === "normal" ? 3 : 4,
    breathingScore,
    overallLoadScore: effortScore,
    preRunNutritionScore: 3,
    environmentScore: 3,
    satisfactionScore: input.perceivedEffort === "max" ? 4 : 3
  };
}

function missingRunFields(input: z.infer<typeof schema>) {
  const required: Array<keyof z.infer<typeof schema>> = [
    "rpeScore",
    "legsLoadScore",
    "painScore",
    "addFiveKmScore",
    "recoveryScore",
    "breathingScore",
    "overallLoadScore",
    "preRunNutritionScore",
    "environmentScore",
    "satisfactionScore"
  ];

  return required.filter((field) => input[field] == null);
}

function missingStrengthFields(input: z.infer<typeof schema>) {
  const required: Array<keyof z.infer<typeof schema>> = [
    "strengthEffortScore",
    "strengthMuscleLoadScore",
    "strengthTechniqueScore",
    "strengthFailureProximityScore",
    "strengthPainScore",
    "strengthRecoveryScore",
    "strengthFocusArea"
  ];
  return required.filter((field) => input[field] == null);
}

function strengthFromLegacy(input: {
  perceivedEffort: z.infer<typeof legacyPerceivedEnum>;
  bodyFeel: z.infer<typeof legacyBodyEnum>;
  breathingFeel: z.infer<typeof legacyBreathingEnum>;
}) {
  const effort = input.perceivedEffort === "easy" ? 2 : input.perceivedEffort === "moderate" ? 3 : input.perceivedEffort === "hard" ? 4 : 5;
  const muscleLoad = input.bodyFeel === "fresh" ? 2 : input.bodyFeel === "normal" ? 3 : 4;
  const technique = input.breathingFeel === "easy" ? 2 : input.breathingFeel === "steady" ? 3 : 4;
  const pain = input.bodyFeel === "pain" ? 4 : 1;
  const recovery = input.bodyFeel === "fresh" ? 2 : input.bodyFeel === "normal" ? 3 : input.bodyFeel === "heavy" ? 4 : 5;
  return {
    strengthEffortScore: effort,
    strengthMuscleLoadScore: muscleLoad,
    strengthTechniqueScore: technique,
    strengthFailureProximityScore: effort,
    strengthPainScore: pain,
    strengthRecoveryScore: recovery,
    strengthFocusArea: "full_body" as const
  };
}

function syncFuelingFromRunFeedback(
  workoutId: string,
  source: z.infer<typeof runFuelingSourceEnum> | undefined,
  quantity: number | undefined
) {
  if (source == null || source === "none" || quantity == null || !Number.isFinite(quantity) || quantity <= 0) {
    replaceWorkoutFueling(workoutId, []);
    return;
  }
  const unitLabel = "יח׳";
  const normalizedQty = Math.round(quantity * 10) / 10;

  if (source === "gel") {
    replaceWorkoutFueling(workoutId, [
      {
        itemName: "ג׳ל",
        quantity: normalizedQty,
        unitLabel,
        carbsG: Math.round(normalizedQty * 25 * 10) / 10,
        kcal: Math.round(normalizedQty * 100),
        notes: "נשמר ממשוב ריצה"
      }
    ]);
    return;
  }

  if (source === "date") {
    replaceWorkoutFueling(workoutId, [
      {
        itemName: "תמר",
        quantity: normalizedQty,
        unitLabel,
        carbsG: Math.round(normalizedQty * 18 * 10) / 10,
        kcal: Math.round(normalizedQty * 66),
        notes: "נשמר ממשוב ריצה"
      }
    ]);
    return;
  }

  replaceWorkoutFueling(workoutId, [
    {
      itemName: "תדלוק אחר",
      quantity: normalizedQty,
      unitLabel,
      carbsG: 0,
      kcal: null,
      notes: "נשמר ממשוב ריצה"
    }
  ]);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const payload = parsed.data;
  let perceivedEffort = payload.perceivedEffort;
  let bodyFeel = payload.bodyFeel;
  let breathingFeel = payload.breathingFeel;

  if (payload.sport === "run") {
    const hasRunFields =
      payload.rpeScore != null ||
      payload.legsLoadScore != null ||
      payload.painScore != null ||
      payload.addFiveKmScore != null ||
      payload.recoveryScore != null ||
      payload.breathingScore != null ||
      payload.overallLoadScore != null ||
      payload.preRunNutritionScore != null ||
      payload.environmentScore != null ||
      payload.satisfactionScore != null ||
      payload.openNote != null ||
      payload.fuelingSource != null ||
      payload.fuelingQuantity != null;

    if (!hasRunFields && (!perceivedEffort || !bodyFeel || !breathingFeel)) {
      return NextResponse.json({ error: "חסרים נתוני משוב ריצה" }, { status: 400 });
    }

    if (hasRunFields) {
      const missing = missingRunFields(payload);
      if (missing.length > 0) {
        return NextResponse.json({ error: `שדות חסרים: ${missing.join(", ")}` }, { status: 400 });
      }
      const legacy = legacyFromRunScores({
        rpeScore: payload.rpeScore as number,
        legsLoadScore: payload.legsLoadScore as number,
        painScore: payload.painScore as number,
        recoveryScore: payload.recoveryScore as number,
        breathingScore: payload.breathingScore as number,
        overallLoadScore: payload.overallLoadScore as number
      });
      perceivedEffort = legacy.perceivedEffort;
      bodyFeel = legacy.bodyFeel;
      breathingFeel = legacy.breathingFeel;
    } else if (perceivedEffort && bodyFeel && breathingFeel) {
      const runDerived = runScoresFromLegacy({
        perceivedEffort,
        bodyFeel,
        breathingFeel
      });
      payload.rpeScore = runDerived.rpeScore;
      payload.legsLoadScore = runDerived.legsLoadScore;
      payload.painScore = runDerived.painScore;
      payload.addFiveKmScore = runDerived.addFiveKmScore;
      payload.recoveryScore = runDerived.recoveryScore;
      payload.breathingScore = runDerived.breathingScore;
      payload.overallLoadScore = runDerived.overallLoadScore;
      payload.preRunNutritionScore = runDerived.preRunNutritionScore;
      payload.environmentScore = runDerived.environmentScore;
      payload.satisfactionScore = runDerived.satisfactionScore;
      payload.fuelingSource = payload.fuelingSource ?? "none";
      payload.fuelingQuantity = payload.fuelingQuantity ?? 0;
    }
  } else if (payload.sport === "strength") {
    const hasStrengthFields =
      payload.strengthEffortScore != null ||
      payload.strengthMuscleLoadScore != null ||
      payload.strengthTechniqueScore != null ||
      payload.strengthFailureProximityScore != null ||
      payload.strengthPainScore != null ||
      payload.strengthRecoveryScore != null ||
      payload.strengthFocusArea != null ||
      payload.strengthPainArea != null ||
      payload.strengthOpenNote != null;

    if (!hasStrengthFields && (!perceivedEffort || !bodyFeel || !breathingFeel)) {
      return NextResponse.json({ error: "חסרים נתוני משוב כוח" }, { status: 400 });
    }

    if (hasStrengthFields) {
      const missing = missingStrengthFields(payload);
      if (missing.length > 0) {
        return NextResponse.json({ error: `שדות חסרים: ${missing.join(", ")}` }, { status: 400 });
      }
      const effort = payload.strengthEffortScore as number;
      const muscleLoad = payload.strengthMuscleLoadScore as number;
      const technique = payload.strengthTechniqueScore as number;
      const failure = payload.strengthFailureProximityScore as number;
      const pain = payload.strengthPainScore as number;
      const recovery = payload.strengthRecoveryScore as number;

      perceivedEffort = effort <= 2 ? "easy" : effort <= 3 ? "moderate" : effort === 4 ? "hard" : "max";
      bodyFeel = pain >= 3 ? "pain" : muscleLoad >= 4 || recovery >= 4 ? "heavy" : recovery <= 2 ? "fresh" : "normal";
      breathingFeel = technique <= 2 ? "easy" : technique <= 3 ? "steady" : "hard";

      payload.rpeScore = effort;
      payload.legsLoadScore = muscleLoad;
      payload.breathingScore = technique;
      payload.overallLoadScore = failure;
      payload.painScore = pain;
      payload.recoveryScore = recovery;
      payload.painArea = payload.strengthPainArea ?? "";
      payload.openNote = payload.strengthOpenNote ?? payload.openNote ?? "";
    } else if (perceivedEffort && bodyFeel && breathingFeel) {
      const derived = strengthFromLegacy({ perceivedEffort, bodyFeel, breathingFeel });
      payload.strengthEffortScore = derived.strengthEffortScore;
      payload.strengthMuscleLoadScore = derived.strengthMuscleLoadScore;
      payload.strengthTechniqueScore = derived.strengthTechniqueScore;
      payload.strengthFailureProximityScore = derived.strengthFailureProximityScore;
      payload.strengthPainScore = derived.strengthPainScore;
      payload.strengthRecoveryScore = derived.strengthRecoveryScore;
      payload.strengthFocusArea = derived.strengthFocusArea;
      payload.rpeScore = derived.strengthEffortScore;
      payload.legsLoadScore = derived.strengthMuscleLoadScore;
      payload.breathingScore = derived.strengthTechniqueScore;
      payload.overallLoadScore = derived.strengthFailureProximityScore;
      payload.painScore = derived.strengthPainScore;
      payload.recoveryScore = derived.strengthRecoveryScore;
    }
  } else if (!perceivedEffort || !bodyFeel || !breathingFeel) {
    return NextResponse.json({ error: "חסרים נתוני משוב לאימון" }, { status: 400 });
  }

  const toSave = {
    workoutId: payload.workoutId,
    date: payload.date,
    sport: payload.sport,
    perceivedEffort: perceivedEffort as z.infer<typeof legacyPerceivedEnum>,
    bodyFeel: bodyFeel as z.infer<typeof legacyBodyEnum>,
    breathingFeel: breathingFeel as z.infer<typeof legacyBreathingEnum>,
    rpeScore: payload.rpeScore ?? null,
    legsLoadScore: payload.legsLoadScore ?? null,
    painScore: payload.painScore ?? null,
    painArea: payload.painArea ?? null,
    addFiveKmScore: payload.addFiveKmScore ?? null,
    recoveryScore: payload.recoveryScore ?? null,
    breathingScore: payload.breathingScore ?? null,
    overallLoadScore: payload.overallLoadScore ?? null,
    preRunNutritionScore: payload.preRunNutritionScore ?? null,
    environmentScore: payload.environmentScore ?? null,
    satisfactionScore: payload.satisfactionScore ?? null,
    strengthTechniqueScore: payload.sport === "strength" ? payload.strengthTechniqueScore ?? null : null,
    strengthFailureProximityScore: payload.sport === "strength" ? payload.strengthFailureProximityScore ?? null : null,
    strengthFocusArea: payload.sport === "strength" ? payload.strengthFocusArea ?? null : null,
    openNote: payload.sport === "strength" ? payload.strengthOpenNote ?? payload.openNote ?? null : payload.openNote ?? null,
    fuelingSource: payload.fuelingSource ?? null,
    fuelingQuantity: payload.fuelingQuantity ?? null
  } as const;

  if (cloudEnabled()) {
    await cloudUpsertWorkoutFeedback({
      ...toSave,
      rpeScore: toSave.rpeScore ?? null,
      legsLoadScore: toSave.legsLoadScore ?? null,
      painScore: toSave.painScore ?? null,
      painArea: toSave.painArea ?? null,
      addFiveKmScore: toSave.addFiveKmScore ?? null,
      recoveryScore: toSave.recoveryScore ?? null,
      breathingScore: toSave.breathingScore ?? null,
      overallLoadScore: toSave.overallLoadScore ?? null,
      preRunNutritionScore: toSave.preRunNutritionScore ?? null,
      environmentScore: toSave.environmentScore ?? null,
      satisfactionScore: toSave.satisfactionScore ?? null,
      strengthTechniqueScore: toSave.strengthTechniqueScore ?? null,
      strengthFailureProximityScore: toSave.strengthFailureProximityScore ?? null,
      strengthFocusArea: toSave.strengthFocusArea ?? null,
      strengthEffortScore: payload.sport === "strength" ? payload.strengthEffortScore ?? null : null,
      strengthMuscleLoadScore: payload.sport === "strength" ? payload.strengthMuscleLoadScore ?? null : null,
      strengthPainScore: payload.sport === "strength" ? payload.strengthPainScore ?? null : null,
      strengthRecoveryScore: payload.sport === "strength" ? payload.strengthRecoveryScore ?? null : null,
      strengthPainArea: payload.sport === "strength" ? payload.strengthPainArea ?? null : null,
      strengthOpenNote: payload.sport === "strength" ? payload.strengthOpenNote ?? null : null
    });
  } else {
    upsertWorkoutFeedback(toSave);
  }

  if (!cloudEnabled() && payload.sport === "run") {
    syncFuelingFromRunFeedback(
      payload.workoutId,
      payload.fuelingSource,
      payload.fuelingQuantity
    );
  }

  return NextResponse.json({ saved: true });
}

export async function GET(request: NextRequest) {
  const workoutId = request.nextUrl.searchParams.get("workoutId");
  if (!workoutId) {
    return NextResponse.json({ error: "workoutId required" }, { status: 400 });
  }
  if (cloudEnabled()) {
    return NextResponse.json({ feedback: (await cloudGetWorkoutFeedback(workoutId)) ?? null });
  }
  return NextResponse.json({ feedback: getWorkoutFeedback(workoutId) ?? null });
}
