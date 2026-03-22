type RunScoreSplit = { splitSec: number };

export type RunScoreFeedbackInput = {
  rpeScore?: number | null;
  legsLoadScore?: number | null;
  painScore?: number | null;
  recoveryScore?: number | null;
  breathingScore?: number | null;
  overallLoadScore?: number | null;
  preRunNutritionScore?: number | null;
  satisfactionScore?: number | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function splitPaceCv(splits: RunScoreSplit[]) {
  if (splits.length < 4) return null;
  const values = splits.map((split) => split.splitSec);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (!Number.isFinite(mean) || mean <= 0) return null;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

export function runScoreLabel(score: number) {
  if (score >= 85) return "מצוין";
  if (score >= 70) return "טוב";
  if (score >= 55) return "סביר";
  return "דורש התאוששות";
}

export function computeRunScore(args: {
  durationSec: number;
  avgHr: number | null | undefined;
  maxHr: number | null | undefined;
  movingDurationSec: number | null;
  splits: RunScoreSplit[];
  feedback?: RunScoreFeedbackInput | null;
}) {
  let score = 80;
  const reasons: string[] = [];
  let continuityDelta = 0;
  let stabilityDelta = 0;
  let loadDelta = 0;
  let feedbackDelta = 0;

  if (args.durationSec > 0 && args.movingDurationSec != null) {
    const movingRatio = args.movingDurationSec / args.durationSec;
    continuityDelta = clamp((movingRatio - 0.78) * 30, -6, 7);
    score += continuityDelta;
    if (movingRatio < 0.72) reasons.push("זמן עצירות גבוה יחסית");
    else if (movingRatio > 0.9) reasons.push("ריצה רציפה כמעט ללא עצירות");
  }

  const cv = splitPaceCv(args.splits);
  if (cv != null) {
    stabilityDelta = clamp((0.1 - cv) * 90, -8, 8);
    score += stabilityDelta;
    if (cv < 0.07) reasons.push("קצב יציב לאורך הקילומטרים");
    else if (cv > 0.12) reasons.push("שונות גבוהה בקצב");
  }

  if (args.avgHr != null && args.maxHr != null && args.maxHr > 0) {
    const hrRatio = args.avgHr / args.maxHr;
    loadDelta = clamp((0.9 - hrRatio) * 18, -4, 4);
    score += loadDelta;
  }

  if (args.feedback) {
    const satisfaction = args.feedback.satisfactionScore;
    const recovery = args.feedback.recoveryScore;
    const pain = args.feedback.painScore;
    const overall = args.feedback.overallLoadScore;
    const preFuel = args.feedback.preRunNutritionScore;
    const rpe = args.feedback.rpeScore;
    const legs = args.feedback.legsLoadScore;
    const breathing = args.feedback.breathingScore;
    const contributors: number[] = [];

    if (satisfaction != null) {
      contributors.push(6 - satisfaction);
      if (satisfaction <= 2) reasons.push("שביעות רצון גבוהה מהאימון");
      if (satisfaction >= 4) reasons.push("שביעות רצון נמוכה מהאימון");
    }
    if (recovery != null) contributors.push(6 - recovery);
    if (pain != null) {
      contributors.push(6 - pain);
      if (pain >= 3) reasons.push("כאב מורגש במהלך הריצה");
    }
    if (overall != null) contributors.push(6 - overall);
    if (rpe != null) contributors.push(6 - rpe);
    if (legs != null) contributors.push(6 - legs);
    if (breathing != null) contributors.push(6 - breathing);
    if (preFuel != null && preFuel >= 4) reasons.push("תחושת חוסר אנרגיה מהתזונה לפני הריצה");

    if (contributors.length > 0) {
      const avg = contributors.reduce((sum, value) => sum + value, 0) / contributors.length;
      // Personal feedback has a higher impact so the score better reflects how the workout felt.
      feedbackDelta = clamp((avg - 3) * 8, -18, 20);
      score += feedbackDelta;
    }
  }

  const finalScore = clamp(Math.round(score), 0, 100);
  return {
    score: finalScore,
    label: runScoreLabel(finalScore),
    reasons,
    breakdown: {
      continuity: Math.round(continuityDelta * 10) / 10,
      stability: Math.round(stabilityDelta * 10) / 10,
      load: Math.round(loadDelta * 10) / 10,
      feedback: Math.round(feedbackDelta * 10) / 10
    }
  };
}
