import {
  getAthleteProfile,
  getForecastFeedbackBetween,
  getForecastOverridesBetween,
  getRecovery,
  getRules,
  getWorkoutFeedbackForDate,
  getWorkoutsBetween,
  getWeeklyPlan,
  getWorkoutsSince
} from "@/lib/db";
import { addDaysISO, formatISODate } from "@/lib/date";
import type { Recommendation, ScoreSummary, Workout } from "@/lib/types";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

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
  if (!Number.isFinite(low) || !Number.isFinite(high) || high <= low) {
    return 0.5;
  }
  return clamp((value - low) / (high - low), 0, 1);
}

function classifyTrainingState(scores: {
  readinessScore: number;
  fatigueScore: number;
  fitnessScore: number;
  tsb: number;
}): Pick<ScoreSummary, "stateTag" | "stateLabel" | "stateHint"> {
  if (scores.fatigueScore >= 84 && scores.readinessScore <= 38) {
    return {
      stateTag: "overtraining_risk",
      stateLabel: "Overtraining Risk",
      stateHint: "עומס מצטבר גבוה מהיכולת להתאושש. כדאי להוריד עומס 24-48 שעות."
    };
  }

  if (scores.readinessScore >= 76 && scores.fatigueScore <= 62 && scores.fitnessScore >= 68 && scores.tsb >= -2) {
    return {
      stateTag: "peaking",
      stateLabel: "Peaking",
      stateHint: "חלון טוב לאימון איכות, כל עוד השינה והתחושה נשארות יציבות."
    };
  }

  if (scores.fitnessScore <= 52 && scores.readinessScore <= 52) {
    return {
      stateTag: "losing_momentum",
      stateLabel: "Losing Momentum",
      stateHint: "הכושר בירידה יחסית. שווה לחזור לרצף אימונים קל ועקבי."
    };
  }

  return {
    stateTag: "on_the_spot",
    stateLabel: "On The Spot",
    stateHint: "איזון טוב בין עומס להתאוששות. אפשר להתקדם באופן מדורג."
  };
}

function workoutFeedbackImpact(date: string) {
  const feedback = getWorkoutFeedbackForDate(date);
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

  return { fatigueBoost, readinessPenalty, count: feedback.length };
}

function weightedLoad(workout: Workout, crossTrainingWeight: number) {
  if (workout.sport === "run") return workout.tssLike;
  return workout.tssLike * crossTrainingWeight;
}

function mapRecoveryPenalty(date: string) {
  const recovery = getRecovery(date);
  const profile = getAthleteProfile();
  if (!recovery) return { penalty: 7, factors: ["אין צ'ק-אין יומי, ננקטת זהירות"] };

  let penalty = 0;
  const factors: string[] = [];

  if (recovery.sleepHours != null) {
    if (recovery.sleepHours < 6) {
      penalty += 10;
      factors.push("שינה קצרה מהיעד");
    } else if (recovery.sleepHours < 7) {
      penalty += 4;
      factors.push("שינה בינונית");
    }
  }

  if (recovery.sleepQuality != null && recovery.sleepQuality <= 2) {
    penalty += 8;
    factors.push("איכות שינה נמוכה");
  }

  const hrvLowThreshold = Math.max(20, Math.round((profile.hrvBaseline ?? 43) * 0.82));
  if (recovery.hrv != null && recovery.hrv < hrvLowThreshold) {
    penalty += 10;
    factors.push(`HRV נמוך מהבסיס (${hrvLowThreshold}-)`);
  }

  const restingHrHighThreshold = Math.round((profile.restingHrBaseline ?? 58) + 6);
  if (recovery.restingHr != null && recovery.restingHr >= restingHrHighThreshold) {
    penalty += 6;
    factors.push(`דופק מנוחה גבוה מהבסיס (${restingHrHighThreshold}+)`);
  }

  if (recovery.sorenessGlobal != null && recovery.sorenessGlobal >= 7) {
    penalty += 12;
    factors.push("כאב/שריריות גבוהה");
  }

  if (recovery.rpe >= 8) {
    penalty += 7;
    factors.push("תחושת מאמץ מצטברת גבוהה");
  }

  return { penalty, factors };
}

function explainIntensityZone(zone: string) {
  if (zone === "Z1-Z2") {
    return "Z1-Z2 = עצימות קלה עד אירובית נוחה. מתאימה להתאוששות, שיפור בסיס אירובי, ושמירה על עומס בטוח.";
  }
  if (zone === "Z2") {
    return "Z2 = עצימות אירובית יציבה שאפשר להחזיק לאורך זמן עם נשימה נשלטת. מתאימה לבניית כושר בסיס.";
  }
  if (zone === "Z3-Z4") {
    return "Z3-Z4 = עצימות בינונית-גבוהה עד סף. מיועדת לשיפור מהירות וסבולת מתקדמת ודורשת התאוששות טובה.";
  }
  return "Zone לא מוכר כרגע.";
}

function formatPace(minPerKm: number) {
  const safe = Math.max(3, Math.min(12, minPerKm));
  const minutes = Math.floor(safe);
  const seconds = Math.round((safe - minutes) * 60);
  return `${minutes}:${String(seconds).padStart(2, "0")} דק'/ק\"מ`;
}

function athleteRunProfile(date = formatISODate()) {
  const end = new Date(`${date}T23:59:59.999Z`);
  const start = new Date(end);
  start.setDate(start.getDate() - 56);
  const runs = getWorkoutsSince(start.toISOString())
    .filter((w) => w.sport === "run" && new Date(w.startAt) <= end && (w.distanceM ?? 0) >= 3000)
    .slice(0, 25);

  if (runs.length === 0) {
    return {
      easyPace: "6:15 דק'/ק\"מ",
      tempoPace: "5:20 דק'/ק\"מ",
      easyHr: "135-150",
      tempoHr: "155-170"
    };
  }

  const paceValues = runs
    .map((w) => ((w.durationSec / 60) / ((w.distanceM ?? 1) / 1000)))
    .filter((v) => Number.isFinite(v) && v > 0);
  const avgPace = paceValues.reduce((s, v) => s + v, 0) / Math.max(1, paceValues.length);
  const avgHr = runs.map((w) => w.avgHr ?? 0).filter((v) => v > 0).reduce((s, v, _, arr) => s + v / arr.length, 0) || 148;
  const maxHr = runs.map((w) => w.maxHr ?? 0).filter((v) => v > 0).reduce((m, v) => Math.max(m, v), 0) || avgHr + 20;

  const easyPace = formatPace(avgPace * 1.07);
  const tempoPace = formatPace(avgPace * 0.92);
  const easyHr = `${Math.max(115, Math.round(avgHr - 10))}-${Math.round(avgHr + 5)}`;
  const tempoHr = `${Math.round(avgHr + 8)}-${Math.max(Math.round(avgHr + 8), Math.round(maxHr - 5))}`;

  return { easyPace, tempoPace, easyHr, tempoHr };
}

function hebrewWeekday(dateIso: string) {
  const day = new Date(dateIso).getDay();
  const labels = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
  return labels[day] ?? "יום";
}

type ForecastOption = {
  id: string;
  sport: "run" | "bike" | "swim";
  workoutType: string;
  durationMin: number;
  intensityZone: string;
  target: string;
  structure: string;
  why: string;
  notes: string;
  plannedLoad: number;
};

function normalizeSuggestedDuration(durationMin: number, recoveryOnly = false) {
  return Math.max(recoveryOnly ? 20 : 30, Math.round(durationMin));
}

function plannedWorkoutForDay(
  dateIso: string,
  projectedReadiness: number,
  projectedFatigue: number
): ForecastOption[] {
  const day = new Date(dateIso).getDay(); // 0=Sunday

  if (projectedFatigue >= 75 || projectedReadiness < 45) {
    return [
      {
        id: "recovery-run",
        sport: "run",
        workoutType: "ריצת התאוששות",
        durationMin: 30,
        intensityZone: "Z1-Z2",
        target: "נשימה נוחה מאוד, שיחה מלאה, דופק קל",
        structure: "8 דק' הליכה/ג'וג קל + 18 דק' ריצה קלה מאוד + 4 דק' שחרור והליכה",
        why: "משמר רציפות ריצה עם עומס נמוך.",
        notes: "אם הרגליים כבדות במיוחד אפשר להפוך חלק מהאימון להליכה",
        plannedLoad: 26
      },
      {
        id: "easy-swim",
        sport: "swim",
        workoutType: "שחייה קלה",
        durationMin: 30,
        intensityZone: "Z1-Z2",
        target: "חתירה קלה, נשימה מסודרת, ללא מאבק",
        structure: "200 קל + 4x50 תרגיל חתירה / 20 שנ' + 4x100 חתירה קלה / 15 שנ' + 100 שחרור",
        why: "מוריד עומס מפרקים תוך שמירה אירובית.",
        notes: "אם העייפות גבוהה אפשר לשלב חזה קל במקום חלק מהסטים",
        plannedLoad: 24
      },
      {
        id: "easy-bike",
        sport: "bike",
        workoutType: "אופניים קלים",
        durationMin: 40,
        intensityZone: "Z1-Z2",
        target: "קדנס 85-95, התנגדות נמוכה",
        structure: "10 דק' פתיחה קלה + 25 דק' רכיבה רציפה קלה + 5 דק' שחרור",
        why: "שחרור רגליים בלי עומס ריצה נוסף.",
        notes: "אפשר להוסיף 4 פתיחות של 20 שנ' לקדנס גבוה בלי עומס",
        plannedLoad: 28
      }
    ];
  }

  // Tue + Thu quality only when recovery window is acceptable.
  if ((day === 2 || day === 4) && projectedReadiness >= 65 && projectedFatigue < 65) {
    return [
      {
        id: "quality-run",
        sport: "run",
        workoutType: "אימון איכות ריצה",
        durationMin: 50,
        intensityZone: "Z3-Z4",
        target: "קטעי עבודה באזור סף, נשלט אבל מאתגר",
        structure: "15 דק' חימום + 4 האצות 20 שנ' + 5x4 דק' ב-Z3-Z4 / 2 דק' קל + 10 דק' שחרור",
        why: "משפר סף ומהירות בריצה - ענף בעדיפות ראשונה.",
        notes: "הקטעים המהירים צריכים להיות יציבים, לא ספרינט",
        plannedLoad: 62
      },
      {
        id: "tempo-bike",
        sport: "bike",
        workoutType: "אופניים טמפו",
        durationMin: 55,
        intensityZone: "Z3",
        target: "בלוק רציף בקצב טמפו",
        structure: "15 דק' קל + 3x8 דק' טמפו ישיבה חזקה / 3 דק' קל + 10 דק' שחרור",
        why: "חלופה פחות אימפקטית לעומס איכות.",
        notes: "קדנס יעד 85-95, בלי לפתוח חזק מדי בבלוק הראשון",
        plannedLoad: 54
      },
      {
        id: "steady-swim",
        sport: "swim",
        workoutType: "שחייה רציפה",
        durationMin: 45,
        intensityZone: "Z2-Z3",
        target: "חתירה רציפה בקצב עבודה יציב",
        structure: "300 קל + 4x50 טכני + 8x100 חתירה ב-Z2-Z3 / 15 שנ' + 200 שחרור",
        why: "חלופה אירובית איכותית עם עומס מפרקי נמוך.",
        notes: "אם צריך אפשר להחליף כל סט רביעי בחזה קל להתאפסות",
        plannedLoad: 46
      }
    ];
  }

  // Saturday longer aerobic session.
  if (day === 6 && projectedReadiness >= 55) {
    return [
      {
        id: "long-run",
        sport: "run",
        workoutType: "ריצה ארוכה אירובית",
        durationMin: 75,
        intensityZone: "Z2",
        target: "קצב יציב אירובי ללא מאבק נשימתי",
        structure: "15 דק' פתיחה רגועה + 50 דק' Z2 יציב + 10 דק' אחרונות מעט אסופות אם התחושה טובה",
        why: "אבן יסוד לשיפור סבולת ריצה.",
        notes: "לקחת שתייה או ג׳ל אם האימון מתקרב ל-80 דק׳ ומעלה",
        plannedLoad: 70
      },
      {
        id: "long-bike",
        sport: "bike",
        workoutType: "רכיבה ארוכה",
        durationMin: 95,
        intensityZone: "Z2",
        target: "קדנס יציב, מאמץ מתון",
        structure: "20 דק' קל + 3x20 דק' Z2 יציב / 5 דק' קל + 10 דק' שחרור",
        why: "מגדיל נפח אירובי עם פחות עומס מכני.",
        notes: "לשמור תדלוק ושתייה לאורך הרכיבה",
        plannedLoad: 64
      },
      {
        id: "mixed-day",
        sport: "swim",
        workoutType: "שחייה טכנית + מוביליטי",
        durationMin: 40,
        intensityZone: "Z1-Z2",
        target: "טכניקה, נשימה ושליטה",
        structure: "200 קל + 6x50 טכני + 4x100 קל + 10-15 דק' מוביליטי",
        why: "שומר רציפות ומפחית עומס מצטבר.",
        notes: "יום טוב להורדת עומס בלי לנוח לחלוטין",
        plannedLoad: 32
      }
    ];
  }

  // Midweek cross-training slot.
  if (day === 3 && projectedFatigue >= 60) {
    return [
      {
        id: "cross-swim",
        sport: "swim",
        workoutType: "שחייה קלה",
        durationMin: 40,
        intensityZone: "Z1-Z2",
        target: "טכניקה + אירובי עדין",
        structure: "300 קל + 6x100 חתירה קלה / 15 שנ' + 4x50 גב/חזה קל + 100 שחרור",
        why: "תומך התאוששות ביום עייפות בינונית.",
        notes: "לשמור דגש על טכניקה, לא על מהירות",
        plannedLoad: 30
      },
      {
        id: "cross-bike",
        sport: "bike",
        workoutType: "אופניים קלים",
        durationMin: 45,
        intensityZone: "Z1-Z2",
        target: "קצב נוח, עומס נמוך",
        structure: "10 דק' קל + 5x3 דק' קדנס גבוה / 2 דק' קל + 10 דק' שחרור",
        why: "שומר נפח בלי מכה לרגליים.",
        notes: "הדגש הוא זרימה ברגליים ולא כוח",
        plannedLoad: 34
      },
      {
        id: "easy-run",
        sport: "run",
        workoutType: "ריצה קלה",
        durationMin: 35,
        intensityZone: "Z1-Z2",
        target: "ריצה רגועה מאוד",
        structure: "8 דק' פתיחה רגועה + 22 דק' קל + 5 דק' שחרור",
        why: "שומר עדיפות ריצה אם התחושה טובה.",
        notes: "אם יש כבדות ברגליים עדיף לעבור לשחייה/אופניים",
        plannedLoad: 32
      }
    ];
  }

  if (day === 0) {
    return [
      {
        id: "steady-run-strides",
        sport: "run",
        workoutType: "ריצה קלה עם האצות",
        durationMin: 42,
        intensityZone: "Z2",
        target: "נפח קל עם סיום מעט חד יותר",
        structure: "10 דק' קל + 24 דק' Z2 + 6x20 שנ' האצה / 60 שנ' קל + 6 דק' שחרור",
        why: "פותח שבוע בצורה חיה בלי להעמיס מוקדם מדי.",
        notes: "ההאצות נשלטות, לא ספרינט.",
        plannedLoad: 44
      },
      {
        id: "endurance-bike-spinups",
        sport: "bike",
        workoutType: "אופניים Z2 עם ספין-אפים",
        durationMin: 48,
        intensityZone: "Z2",
        target: "רכיבה רציפה עם עבודת קדנס קלה",
        structure: "12 דק' קל + 4x2 דק' קדנס גבוה / 3 דק' קל + 22 דק' Z2 + 8 דק' שחרור",
        why: "בונה אירובי בלי עומס מכני גבוה.",
        notes: "להשאיר התנגדות נמוכה בקטעי הקדנס.",
        plannedLoad: 40
      },
      {
        id: "swim-reset",
        sport: "swim",
        workoutType: "שחיית פתיחת שבוע",
        durationMin: 38,
        intensityZone: "Z1-Z2",
        target: "חתירה נינוחה עם דגש טכני",
        structure: "200 קל + 6x50 טכני + 6x75 חתירה קלה / 15 שנ' + 100 שחרור",
        why: "משאיר את השבוע גמיש ומרענן.",
        notes: "אם יש עייפות, להפוך חלק מהסטים לגב.",
        plannedLoad: 28
      }
    ];
  }

  if (day === 1) {
    return [
      {
        id: "aerobic-run-progression",
        sport: "run",
        workoutType: "ריצה אירובית מדורגת",
        durationMin: 47,
        intensityZone: "Z2-Z3",
        target: "פתיחה קלה וסיום מעט אסוף",
        structure: "12 דק' קל + 20 דק' Z2 + 10 דק' Z2 גבוה / Z3 נמוך + 5 דק' שחרור",
        why: "בונה איכות עדינה בלי להפוך ליום קשה.",
        notes: "אם יש כבדות, להישאר ב-Z2 בלבד.",
        plannedLoad: 48
      },
      {
        id: "bike-sweetspot-lite",
        sport: "bike",
        workoutType: "אופניים sweet spot קל",
        durationMin: 50,
        intensityZone: "Z2-Z3",
        target: "בלוקים מתונים סביב סף אירובי",
        structure: "12 דק' קל + 2x8 דק' sweet spot / 4 דק' קל + 10 דק' שחרור",
        why: "חלופה מתונה עם עבודה קצת יותר עשירה.",
        notes: "לא להיכנס לזון 4.",
        plannedLoad: 45
      },
      {
        id: "swim-aerobic-build",
        sport: "swim",
        workoutType: "שחייה אירובית בנויה",
        durationMin: 42,
        intensityZone: "Z2",
        target: "חתירה רציפה בקצב נוח",
        structure: "300 קל + 4x50 תרגיל + 5x150 חתירה / 20 שנ' + 100 שחרור",
        why: "אימון יציב שמרחיב נפח בלי חדות.",
        notes: "אפשר לשלב pull buoy בסט האמצעי.",
        plannedLoad: 34
      }
    ];
  }

  if (day === 5) {
    return [
      {
        id: "pre-long-run-prime",
        sport: "run",
        workoutType: "ריצה קלה לפני סוף שבוע",
        durationMin: 38,
        intensityZone: "Z1-Z2",
        target: "לשמור רעננות לקראת הנפח של שבת",
        structure: "8 דק' קל + 24 דק' ריצה קלה + 6 דק' שחרור",
        why: "מכין את הגוף לנפח בלי לצבור חוב עייפות.",
        notes: "אם יש עומס, לקצר ל-30 דק'.",
        plannedLoad: 32
      },
      {
        id: "bike-openers",
        sport: "bike",
        workoutType: "אופניים פתיחה קלה",
        durationMin: 40,
        intensityZone: "Z1-Z2",
        target: "תנועה וניקוי רגליים",
        structure: "10 דק' קל + 4x1 דק' פתיחה קלה / 2 דק' קל + 18 דק' רציף + 6 דק' שחרור",
        why: "חלופה טובה אם הרגליים עייפות לפני שבת.",
        notes: "לא למשוך את הפתיחות מעבר לשליטה.",
        plannedLoad: 30
      },
      {
        id: "swim-loosen",
        sport: "swim",
        workoutType: "שחיית שחרור",
        durationMin: 32,
        intensityZone: "Z1-Z2",
        target: "תחושה זורמת ורכה",
        structure: "200 קל + 8x50 קל / 15 שנ' + 100 שחרור",
        why: "מוריד עומס לפני יום ארוך.",
        notes: "מתאים במיוחד אם יש עומס מכני בריצה.",
        plannedLoad: 22
      }
    ];
  }

  return [
    {
      id: "aerobic-run",
      sport: "run",
      workoutType: "ריצה אירובית",
      durationMin: 45,
      intensityZone: "Z2",
      target: "קצב אירובי יציב",
      structure: "10 דק' קל + 30 דק' Z2 יציב + 5 דק' שחרור",
      why: "אימון ברירת מחדל מיטבי לשיפור עקבי.",
      notes: "אפשר להוסיף 4 האצות קצרות בסיום אם התחושה טובה",
      plannedLoad: 45
    },
    {
      id: "easy-bike",
      sport: "bike",
      workoutType: "אופניים קלים",
      durationMin: 50,
      intensityZone: "Z2",
      target: "קדנס גבוה התנגדות נמוכה",
      structure: "12 דק' קל + 30 דק' Z2 יציב + 8 דק' שחרור",
      why: "חלופה להפחתת עומס מכני לריצה.",
      notes: "שומר עבודה אירובית בלי מכה לרגליים",
      plannedLoad: 42
    },
    {
      id: "tech-swim",
      sport: "swim",
      workoutType: "שחייה טכנית",
      durationMin: 35,
      intensityZone: "Z1-Z2",
      target: "שליטה טכנית ונשימה",
      structure: "200 קל + 4x50 תרגיל + 4x100 חתירה טכנית / 15 שנ' + 100 שחרור",
      why: "שומר כושר תוך הורדת סטרס מערכתי.",
      notes: "מומלץ יום טכני אם יש הצטברות עומס ריצה",
      plannedLoad: 30
    }
  ];
}

function isKeySession(option: ForecastOption) {
  return option.sport === "run" && (option.intensityZone.includes("Z3") || option.intensityZone.includes("Z4") || option.plannedLoad >= 50);
}

function carryoverOption(option: ForecastOption, nextDate: string): ForecastOption {
  return {
    ...option,
    id: `${option.id}-carry-${nextDate}`,
    workoutType: `${option.workoutType} · נדחה`,
    why: `${option.why} האימון נדחה מהיום הקודם כדי לשמור את מבנה השבוע.`,
    notes: `${option.notes} · נדחה מהיום הקודם לאחר שלא בוצע.`,
    plannedLoad: Math.max(18, Math.round(option.plannedLoad * 0.96))
  };
}

function loadFromSession(sport: "run" | "bike" | "swim", durationMin: number, intensityZone: string) {
  const sportFactor = sport === "run" ? 1 : sport === "swim" ? 0.78 : 0.86;
  const intensityFactor = intensityZone.includes("Z3-Z4")
    ? 1.22
    : intensityZone.includes("Z2-Z3")
      ? 1.08
      : intensityZone.includes("Z2")
        ? 0.95
        : 0.72;
  return Math.max(18, Math.round(durationMin * sportFactor * intensityFactor));
}

function todayOptionsFromRecommendation(date: string): ForecastOption[] {
  const rec = recommendToday(date);
  const primary: ForecastOption = {
    id: `today-primary-${rec.primarySession.sport}`,
    sport: rec.primarySession.sport,
    workoutType: rec.primarySession.sessionName,
    durationMin: rec.primarySession.durationMin,
    intensityZone: rec.intensityZone,
    target: rec.primarySession.target,
    structure: rec.primarySession.structure,
    why: rec.primarySession.why,
    notes: "נגזר מהמלצת היום",
    plannedLoad: loadFromSession(rec.primarySession.sport, rec.primarySession.durationMin, rec.intensityZone)
  };

  const alternatives = rec.alternativeSessions.map((alt, idx) => ({
    id: `today-alt-${idx + 1}-${alt.sport}`,
    sport: alt.sport,
    workoutType: alt.sessionName,
    durationMin: alt.durationMin,
    intensityZone: idx === 0 ? "Z1-Z2" : "Z2",
    target: alt.target,
    structure: alt.structure,
    why: alt.why,
    notes: "חלופה להמלצת היום",
    plannedLoad: loadFromSession(alt.sport, alt.durationMin, idx === 0 ? "Z1-Z2" : "Z2")
  }));

  return [primary, ...alternatives];
}

function withDayCompletionStatus(rec: Recommendation, date: string): Recommendation {
  const dayStart = `${date}T00:00:00.000Z`;
  const dayEnd = `${addDaysISO(date, 1)}T00:00:00.000Z`;
  const workouts = getWorkoutsBetween(dayStart, dayEnd);
  const totalLoad = workouts.reduce((sum, w) => sum + w.tssLike, 0);
  const runMinutes = workouts.filter((w) => w.sport === "run").reduce((sum, w) => sum + w.durationSec / 60, 0);
  const feedback = getWorkoutFeedbackForDate(date);

  let subjectivePenalty = 0;
  for (const item of feedback) {
    if (item.perceivedEffort === "hard") subjectivePenalty += 8;
    if (item.perceivedEffort === "max") subjectivePenalty += 14;
    if (item.bodyFeel === "heavy") subjectivePenalty += 8;
    if (item.bodyFeel === "pain") subjectivePenalty += 14;
    if (item.breathingFeel === "hard") subjectivePenalty += 8;
  }

  if (totalLoad >= 55 || runMinutes >= 45 || subjectivePenalty >= 14) {
    return {
      ...rec,
      workoutType: "היום הושלם · התאוששות בלבד",
      durationMin: 20,
      intensityZone: "Z1-Z2",
      primarySession: {
        sport: "swim",
        sessionName: "התאוששות / מוביליטי",
        durationMin: 20,
        target: "שחרור עדין ונשימה נוחה",
        structure: "10 דק' הליכה קלה + 10 דק' מוביליטי / מתיחות דינמיות",
        why: "כבר בוצע עומס מספק היום, עדיף לא להוסיף אימון משמעותי."
      },
      dayStatus: "target_done",
      dayStatusText: "עמדת ביעד להיום. עדיף להתמקד בהתאוששות."
    };
  }

  if (totalLoad >= 30 || runMinutes >= 25 || subjectivePenalty >= 8) {
    return {
      ...rec,
      workoutType: "אימון משלים קצר (אופציונלי)",
      durationMin: 30,
      intensityZone: "Z1-Z2",
      primarySession: {
        sport: "run",
        sessionName: "ריצה קלה משלימה",
        durationMin: 30,
        target: "קצב קל מאוד, ללא מאבק נשימתי",
        structure: "5 דק' הליכה/ג'וג + 20 דק' קל + 5 דק' שחרור",
        why: "בוצע כבר אימון היום, ואם התחושה טובה אפשר רק השלמה קלה ולא יותר."
      },
      dayStatus: "can_add_short",
      dayStatusText: "אפשר לשקול עוד אימון קל קצר של כ-30 דק׳ אם התחושה טובה."
    };
  }

  return {
    ...rec,
    dayStatus: "more_possible",
    dayStatusText: "עדיין לא הושלם יעד היום. אפשר לבצע את האימון המומלץ."
  };
}

export function computeScores(date = formatISODate()): ScoreSummary {
  const rules = getRules();
  const end = new Date(`${date}T23:59:59.999Z`);
  const start = new Date(end);
  start.setDate(start.getDate() - 89);
  const workouts = getWorkoutsSince(start.toISOString()).filter((w) => new Date(w.startAt) <= end);

  const loadsByDate = new Map<string, number>();
  for (const workout of workouts) {
    const day = workout.startAt.slice(0, 10);
    const current = loadsByDate.get(day) ?? 0;
    loadsByDate.set(day, current + weightedLoad(workout, rules.crossTrainingWeight));
  }

  const alpha7 = 2 / (7 + 1);
  const alpha42 = 2 / (42 + 1);
  let atl7 = 0;
  let ctl42 = 0;
  const atlSeries: number[] = [];
  const ctlSeries: number[] = [];
  const tsbSeries: number[] = [];

  for (let i = 89; i >= 0; i -= 1) {
    const day = addDaysISO(date, -i);
    const dayLoad = loadsByDate.get(day) ?? 0;
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

  const feedbackImpact = workoutFeedbackImpact(date);
  const fatigueRaw =
    26 +
    atlNorm * 50 +
    Math.max(0, atl7 - ctl42) * 0.12 +
    feedbackImpact.fatigueBoost * 0.45;
  const fatigueScore = clamp(Math.round(fatigueRaw), 8, 98);

  const fitnessRaw = 28 + ctlNorm * 54;
  const fitnessScore = clamp(Math.round(fitnessRaw), 10, 98);

  const { penalty } = mapRecoveryPenalty(date);
  const todayLoad = loadsByDate.get(date) ?? 0;
  const freshnessScore = 24 + freshnessNorm * 62;
  const recoveryReserve = 100 - fatigueScore;
  const readinessBase = freshnessScore * 0.58 + fitnessScore * 0.24 + recoveryReserve * 0.18;
  const sameDayLoadPenalty =
    todayLoad >= 100 ? 6 :
    todayLoad >= 75 ? 4 :
    todayLoad >= 45 ? 2 :
    0;
  const readinessRaw =
    readinessBase -
    penalty * 0.6 -
    feedbackImpact.readinessPenalty * 0.45 -
    sameDayLoadPenalty;
  const readinessCap =
    todayLoad >= 100 ? 82 :
    todayLoad >= 75 ? 86 :
    todayLoad >= 50 ? 90 :
    todayLoad >= 30 ? 94 :
    todayLoad > 0 ? 90 :
    100;
  const severeFlag = penalty >= 28 || feedbackImpact.readinessPenalty >= 18;
  const readinessFloor = severeFlag ? 4 : 12;
  const readinessScore = clamp(Math.min(Math.round(readinessRaw), readinessCap), readinessFloor, 100);
  const state = classifyTrainingState({ readinessScore, fatigueScore, fitnessScore, tsb });

  return {
    fitnessScore,
    fatigueScore,
    readinessScore,
    atl7: Math.round(atl7 * 10) / 10,
    ctl42: Math.round(ctl42 * 10) / 10,
    tsb: Math.round(tsb * 10) / 10,
    stateTag: state.stateTag,
    stateLabel: state.stateLabel,
    stateHint: state.stateHint
  };
}

export function recommendToday(date = formatISODate()): Recommendation {
  const rules = getRules();
  const scores = computeScores(date);
  const { factors } = mapRecoveryPenalty(date);
  const feedbackImpact = workoutFeedbackImpact(date);
  const profile = athleteRunProfile(date);
  const explanationFactors = [...factors];
  if (feedbackImpact.count > 0) {
    explanationFactors.push(`עודכן משוב ${feedbackImpact.count} אימון/ים היום וההמלצה הותאמה בהתאם`);
  }

  if (scores.fatigueScore > 65) {
    explanationFactors.push("Fatigue גבוה: מומלצת מנוחה מלאה ללא פעילות כדי לצמצם סיכון לעומס יתר");
    return withDayCompletionStatus({
      workoutType: "מנוחה מלאה",
      durationMin: 0,
      intensityZone: "-",
      intensityExplanation: "היום המטרה היא התאוששות מלאה: מנוחה, שינה ותזונה.",
      alternatives: [],
      explanationFactors,
      confidence: 0.92,
      longExplanation:
        "Fatigue גבוה אומר שהגוף בעומס מצטבר. היום עדיף לא לבצע פעילות, ולהשקיע בהתאוששות: שינה, נוזלים, חלבון ותנועה יומיומית קלה בלבד (ללא אימון).",
      rationaleDetails: [
        `Fatigue נוכחי: ${scores.fatigueScore} (גבוה)`,
        `Readiness נוכחי: ${scores.readinessScore}`,
        "מיקוד: הורדת עומס, התאוששות ושמירה על רצף בריא לאורך השבוע."
      ],
      primarySession: {
        sport: "run",
        sessionName: "מנוחה מלאה",
        durationMin: 0,
        target: "ללא אימון",
        structure:
          "שינה/מנוחה + נוזלים + ארוחה מאוזנת. אפשר הליכה יומיומית קצרה בלבד אם מרגישים צורך, אבל לא כאימון.",
        why: "ב־Fatigue גבוה, העדיפות היא התאוששות ולא הוספת עומס."
      },
      alternativeSessions: []
    }, date);
  }

  if (scores.readinessScore < rules.noHardIfLowReadiness) {
    explanationFactors.push("מוכנות נמוכה מהסף שהוגדר ללוגיקה האישית");
    return withDayCompletionStatus({
      workoutType: "ריצת התאוששות",
      durationMin: 35,
      intensityZone: "Z1-Z2",
      intensityExplanation: explainIntensityZone("Z1-Z2"),
      alternatives: ["הליכה מהירה 45 דק'", "שחייה קלה 30 דק'"],
      explanationFactors,
      confidence: 0.86,
      longExplanation:
        "הגוף עדיין לא מוכן לאימון עצים. עדיף אימון קל שיניע דם ויקדם התאוששות, במקום אימון שמעמיק את העייפות.",
      rationaleDetails: [
        `Readiness נוכחי: ${scores.readinessScore} (מתחת לסף ${rules.noHardIfLowReadiness})`,
        `Fatigue נוכחי: ${scores.fatigueScore}`,
        "מיקוד: החזרת מוכנות ליומיים הקרובים."
      ],
      primarySession: {
        sport: "run",
        sessionName: "ריצת התאוששות",
        durationMin: 35,
        target: `קצב ${profile.easyPace} או דופק ${profile.easyHr}`,
        structure: "10 דק' קל + 20 דק' ריצה קלה יציבה + 5 דק' שחרור",
        why: "שומרת רציפות בענף העיקרי בלי להכביד."
      },
      alternativeSessions: [
        {
          sport: "swim",
          sessionName: "שחייה קלה",
          durationMin: 30,
          target: "סטים קצרים ונינוחים",
          structure: "200 קל + 8x50 קל / 15 שנ' + 100 שחרור",
          why: "מייצר התאוששות אקטיבית."
        },
        {
          sport: "bike",
          sessionName: "אופניים קלים",
          durationMin: 45,
          target: "דופק נמוך/בינוני נמוך",
          structure: "10 דק' קל + 30 דק' רכיבה רציפה קלה + 5 דק' שחרור",
          why: "חלופה ידידותית לעומס."
        }
      ]
    }, date);
  }

  if (scores.tsb > 5 && scores.readinessScore >= 70) {
    explanationFactors.push("איזון עומס חיובי מאפשר איכות");
    return withDayCompletionStatus({
      workoutType: "אימון איכות",
      durationMin: 55,
      intensityZone: "Z3-Z4",
      intensityExplanation: explainIntensityZone("Z3-Z4"),
      alternatives: ["טמפו 30 דק'", "אינטרוולים 6x3 דק'"],
      explanationFactors,
      confidence: 0.82,
      longExplanation:
        "זה חלון טוב לדחוף אימון איכות. המטרה היא לשפר סף ומהירות, תוך שמירה על מסגרת עצימה אבל מבוקרת.",
      rationaleDetails: [
        `TSB נוכחי: ${scores.tsb} (חיובי)`,
        `Readiness נוכחי: ${scores.readinessScore}`,
        `Fatigue נוכחי: ${scores.fatigueScore} (לא חוסם איכות)`
      ],
      primarySession: {
        sport: "run",
        sessionName: "אינטרוולים סף",
        durationMin: 55,
        target: `קטעי עבודה בקצב ${profile.tempoPace} או דופק ${profile.tempoHr}`,
        structure: "15 דק' חימום + 4 האצות 20 שנ' + 5x4 דק' בקצב סף / 2 דק' קל + 10 דק' שחרור",
        why: "עדיפות ריצה: זה האימון עם התרומה הגבוהה ביותר למטרת הכושר שלך."
      },
      alternativeSessions: [
        {
          sport: "swim",
          sessionName: "שחייה בינונית-עצימה",
          durationMin: 45,
          target: "סטים בקצב Z2-Z3",
          structure: "300 קל + 8x100 חתירה בקצב עבודה / 15 שנ' + 200 קל",
          why: "חלופה איכותית עם עומס מכני נמוך יותר."
        },
        {
          sport: "bike",
          sessionName: "טמפו אופניים",
          durationMin: 55,
          target: "בלוקי טמפו רציפים",
          structure: "15 דק' קל + 3x8 דק' טמפו / 3 דק' קל + 10 דק' שחרור",
          why: "חלופה טובה אם יש מגבלה בריצה."
        }
      ]
    }, date);
  }

  explanationFactors.push("מומלץ לשמר עומס אירובי רציף");
  return withDayCompletionStatus({
    workoutType: "ריצה אירובית",
    durationMin: 45,
    intensityZone: "Z2",
    intensityExplanation: explainIntensityZone("Z2"),
    alternatives: ["אופניים קלים 50 דק'", "שחייה טכנית 35 דק'"],
    explanationFactors,
    confidence: 0.78,
    longExplanation:
      "היעד היום הוא לבנות בסיס אירובי יציב. זה סוג האימון שמקדם כושר בצורה עקבית לאורך זמן עם סיכון נמוך יחסית לעומס יתר.",
    rationaleDetails: [
      `Readiness נוכחי: ${scores.readinessScore}`,
      `Fatigue נוכחי: ${scores.fatigueScore}`,
      "אין אינדיקציה לאיכות עצימה או לצורך בהתאוששות בלבד."
    ],
    primarySession: {
      sport: "run",
      sessionName: "ריצה אירובית יציבה",
      durationMin: 45,
      target: `קצב ${profile.easyPace} או דופק ${profile.easyHr}`,
      structure: "10 דק' קל + 30 דק' Z2 יציב + 5 דק' שחרור",
      why: "בחירה ראשונה לריצה בעומס יעיל ליום רגיל."
    },
    alternativeSessions: [
      {
        sport: "swim",
        sessionName: "שחייה טכנית",
        durationMin: 35,
        target: "שליטה טכנית ונשימה",
        structure: "200 קל + 4x50 תרגיל + 4x100 חתירה טכנית / 15 שנ' + 100 קל",
        why: "חלופה לשמירה על כושר עם פחות אימפקט."
      },
      {
        sport: "bike",
        sessionName: "אופניים קלים-בינוניים",
        durationMin: 50,
        target: "Z2 רציף",
        structure: "12 דק' קל + 30 דק' Z2 רציף + 8 דק' שחרור",
        why: "חלופה אירובית מתונה."
      }
    ]
  }, date);
}

export function forecast(days = 7, date = formatISODate()) {
  const base = computeScores(date);
  const weeklyPlan = getWeeklyPlan(date);
  let rollingFatigue = base.fatigueScore;
  let rollingReadiness = base.readinessScore;
  let deferredKeySession: ForecastOption | null = null;
  const endDate = addDaysISO(date, Math.max(0, days - 1));
  const feedbackRows = getForecastFeedbackBetween(date, endDate);
  const overrideRows = getForecastOverridesBetween(date, endDate);
  const feedbackMap = new Map<string, { effort: "light" | "as_planned" | "hard" | "skipped"; loadAdjust: number }>();
  const overrideMap = new Map<string, { optionId: string; optionJson: string }>();
  for (const row of feedbackRows) {
    feedbackMap.set(row.date, row);
  }
  for (const row of overrideRows) {
    overrideMap.set(row.date, { optionId: row.optionId, optionJson: row.optionJson });
  }

  const profileFactor =
    weeklyPlan.profile === "vacation" ? 0.46 :
    weeklyPlan.profile === "busy" ? 0.78 :
    weeklyPlan.profile === "free" ? 1.18 :
    1;
  const availabilityFactor = weeklyPlan.availability === "low" ? 0.82 : weeklyPlan.availability === "high" ? 1.12 : 1;
  const combinedFactor = Math.max(0.42, Math.min(1.34, profileFactor * availabilityFactor));

  const historyFrom = `${addDaysISO(date, -28)}T00:00:00.000Z`;
  const historyTo = `${date}T00:00:00.000Z`;
  const historyLoads = getWorkoutsBetween(historyFrom, historyTo).reduce((sum, w) => sum + w.tssLike, 0);
  const recentDailyAvg = historyLoads / 28;
  const targetDailyByMode =
    weeklyPlan.profile === "vacation" ? 18 :
    weeklyPlan.profile === "busy" ? 30 :
    weeklyPlan.profile === "free" ? 52 :
    40;
  const historyGap = targetDailyByMode - recentDailyAvg;
  const historyAdaptive = clamp(Math.round(historyGap * 0.45), -12, 12);

  return Array.from({ length: days }).map((_, idx) => {
    const dateIso = addDaysISO(date, idx);
    const optionsRaw = idx === 0 ? todayOptionsFromRecommendation(dateIso) : plannedWorkoutForDay(dateIso, rollingReadiness, rollingFatigue);
    const options = optionsRaw.map((opt) => ({
      ...opt,
      durationMin: normalizeSuggestedDuration(opt.durationMin * combinedFactor),
      plannedLoad: Math.max(16, Math.round(opt.plannedLoad * combinedFactor))
    }));
    if (deferredKeySession) {
      options.unshift(deferredKeySession);
    }
    const override = overrideMap.get(dateIso);
    let selected = options[0];
    if (override) {
      const existing = options.find((opt) => opt.id === override.optionId);
      if (existing) {
        selected = existing;
      } else {
        try {
          const parsed = JSON.parse(override.optionJson) as typeof options[number];
          if (parsed?.id && parsed.sport && parsed.workoutType) {
            options.unshift(parsed);
            selected = parsed;
          }
        } catch {
          // ignore malformed override and keep default
        }
      }
    }
    if (!override && deferredKeySession) {
      selected = deferredKeySession;
    }
    const feedback = feedbackMap.get(dateIso);
    const readinessAdaptive =
      rollingReadiness >= 74 && rollingFatigue <= 58 ? 6 :
      rollingFatigue >= 74 ? -10 :
      rollingReadiness <= 46 ? -8 :
      0;
    const feedbackAdjust = feedback?.loadAdjust ?? 0;
    const effectiveLoad = Math.max(8, Math.round(selected.plannedLoad + historyAdaptive + readinessAdaptive + feedbackAdjust));
    const loadDelta = effectiveLoad - selected.plannedLoad;
    const complianceState =
      feedback?.effort === "skipped"
        ? "skipped"
        : selected.plannedLoad <= 0 && effectiveLoad > 0
          ? "unplanned"
          : loadDelta >= 10
            ? "over"
            : loadDelta <= -8
              ? "under"
              : "on_target";

    rollingFatigue = clamp(Math.round(rollingFatigue + effectiveLoad / 20 - 1.4), 0, 100);
    rollingReadiness = clamp(Math.round(rollingReadiness - effectiveLoad / 35 + 1.6), 0, 100);
    deferredKeySession =
      feedback?.effort === "skipped" && isKeySession(selected) && idx < days - 1
        ? carryoverOption(selected, addDaysISO(dateIso, 1))
        : null;

    return {
      date: dateIso,
      dayName: hebrewWeekday(dateIso),
      plannedLoad: selected.plannedLoad,
      effectiveLoad,
      projectedFatigue: rollingFatigue,
      projectedReadiness: rollingReadiness,
      selectedOptionId: selected.id,
      recommendation: `${selected.workoutType} (${selected.sport}) · ${selected.durationMin} דק' · ${selected.intensityZone}`,
      options,
      executionFeedback: feedback?.effort ?? null,
      complianceState
    };
  });
}
