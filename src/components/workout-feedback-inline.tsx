"use client";

import { useEffect, useState } from "react";
import RunFeedbackForm, {
  defaultRunFeedbackValues,
  type RunFeedbackValues
} from "@/components/run-feedback-form";
import StrengthFeedbackForm, {
  defaultStrengthFeedbackValues,
  type StrengthFeedbackValues
} from "@/components/strength-feedback-form";
import UiSelect from "@/components/ui-select";

type Props = {
  workoutId: string;
  date: string;
  sport: "run" | "bike" | "swim" | "strength";
};

type Feedback = {
  perceivedEffort: "easy" | "moderate" | "hard" | "max";
  bodyFeel: "fresh" | "normal" | "heavy" | "pain";
  breathingFeel: "easy" | "steady" | "hard";
  rpeScore?: number | null;
  legsLoadScore?: number | null;
  painScore?: number | null;
  painArea?: string | null;
  addFiveKmScore?: number | null;
  recoveryScore?: number | null;
  breathingScore?: number | null;
  overallLoadScore?: number | null;
  preRunNutritionScore?: number | null;
  environmentScore?: number | null;
  satisfactionScore?: number | null;
  openNote?: string | null;
  fuelingSource?: "none" | "gel" | "date" | "other" | null;
  fuelingQuantity?: number | null;
  strengthTechniqueScore?: number | null;
  strengthFailureProximityScore?: number | null;
  strengthFocusArea?: "full_body" | "upper_body" | "lower_body" | "core" | null;
  updatedAt: string;
};

type CompactRunRow = {
  key:
    | "rpeScore"
    | "legsLoadScore"
    | "painScore"
    | "addFiveKmScore"
    | "recoveryScore"
    | "breathingScore"
    | "overallLoadScore"
    | "preRunNutritionScore"
    | "environmentScore"
    | "satisfactionScore";
  label: string;
  value: number;
  text: string;
};

const scoreMeta: Array<{
  key:
    | "rpeScore"
    | "legsLoadScore"
    | "painScore"
    | "addFiveKmScore"
    | "recoveryScore"
    | "breathingScore"
    | "overallLoadScore"
    | "preRunNutritionScore"
    | "environmentScore"
    | "satisfactionScore";
  label: string;
  options: [string, string, string, string, string];
}> = [
  { key: "rpeScore", label: "מאמץ כללי", options: ["קלה מאוד", "קלה", "בינונית", "קשה", "קשה מאוד"] },
  { key: "legsLoadScore", label: "עומס רגליים", options: ["קלילות מאוד", "קלילות", "בינוני", "כבדות", "כבדות מאוד"] },
  { key: "painScore", label: "כאב/רגישות", options: ["ללא כאב", "רגישות קלה", "כאב קל", "כאב מורגש", "כאב משמעותי"] },
  { key: "addFiveKmScore", label: "יכולת להוסיף 5 ק״מ", options: ["בקלות", "די בקלות", "אפשרי מאתגר", "קשה מאוד", "בלתי אפשרי"] },
  { key: "recoveryScore", label: "התאוששות אחרי", options: ["רענן מאוד", "רענן", "בסדר", "עייף", "מותש"] },
  { key: "breathingScore", label: "נשימה", options: ["חופשית", "מעט מאמץ", "בינוני", "קשה", "קשה מאוד"] },
  { key: "overallLoadScore", label: "עומס כללי", options: ["קל מאוד", "קל", "בינוני", "קשה", "קשה מאוד"] },
  { key: "preRunNutritionScore", label: "תזונה לפני", options: ["מצוינת", "טובה", "בסדר", "מעט חסר", "חסר משמעותי"] },
  { key: "environmentScore", label: "תנאי סביבה", options: ["מצוינים", "טובים", "בינוניים", "קשים", "קשים מאוד"] },
  { key: "satisfactionScore", label: "שביעות רצון", options: ["מצוין", "טוב מאוד", "טוב", "בינוני", "לא טוב"] }
];

function runFromLegacy(feedback: Feedback): RunFeedbackValues {
  const legacyEffort = feedback.perceivedEffort === "easy" ? 2 : feedback.perceivedEffort === "moderate" ? 3 : feedback.perceivedEffort === "hard" ? 4 : 5;
  const legacyBody = feedback.bodyFeel === "fresh" ? 2 : feedback.bodyFeel === "normal" ? 3 : feedback.bodyFeel === "heavy" ? 4 : 5;
  const legacyBreathing = feedback.breathingFeel === "easy" ? 2 : feedback.breathingFeel === "steady" ? 3 : 4;
  const defaults = defaultRunFeedbackValues();
  return {
    ...defaults,
    rpeScore: (feedback.rpeScore ?? legacyEffort) as RunFeedbackValues["rpeScore"],
    legsLoadScore: (feedback.legsLoadScore ?? legacyBody) as RunFeedbackValues["legsLoadScore"],
    painScore: (feedback.painScore ?? (feedback.bodyFeel === "pain" ? 4 : 1)) as RunFeedbackValues["painScore"],
    painArea: feedback.painArea ?? "",
    addFiveKmScore: (feedback.addFiveKmScore ?? legacyEffort) as RunFeedbackValues["addFiveKmScore"],
    recoveryScore: (feedback.recoveryScore ?? legacyBody) as RunFeedbackValues["recoveryScore"],
    breathingScore: (feedback.breathingScore ?? legacyBreathing) as RunFeedbackValues["breathingScore"],
    overallLoadScore: (feedback.overallLoadScore ?? legacyEffort) as RunFeedbackValues["overallLoadScore"],
    preRunNutritionScore: (feedback.preRunNutritionScore ?? 3) as RunFeedbackValues["preRunNutritionScore"],
    environmentScore: (feedback.environmentScore ?? 3) as RunFeedbackValues["environmentScore"],
    satisfactionScore: (feedback.satisfactionScore ?? 3) as RunFeedbackValues["satisfactionScore"],
    openNote: feedback.openNote ?? "",
    fuelingSource: (feedback.fuelingSource ?? "none") as RunFeedbackValues["fuelingSource"],
    fuelingQuantity: feedback.fuelingQuantity ?? 0
  };
}

function strengthFromFeedback(feedback: Feedback | null): StrengthFeedbackValues {
  if (!feedback) return defaultStrengthFeedbackValues();
  const legacyEffort = feedback.perceivedEffort === "easy" ? 2 : feedback.perceivedEffort === "moderate" ? 3 : feedback.perceivedEffort === "hard" ? 4 : 5;
  const legacyBody = feedback.bodyFeel === "fresh" ? 2 : feedback.bodyFeel === "normal" ? 3 : feedback.bodyFeel === "heavy" ? 4 : 5;
  const legacyBreathing = feedback.breathingFeel === "easy" ? 2 : feedback.breathingFeel === "steady" ? 3 : 4;
  return {
    strengthEffortScore: (feedback.rpeScore ?? legacyEffort) as StrengthFeedbackValues["strengthEffortScore"],
    strengthMuscleLoadScore: (feedback.legsLoadScore ?? legacyBody) as StrengthFeedbackValues["strengthMuscleLoadScore"],
    strengthTechniqueScore: (feedback.strengthTechniqueScore ?? feedback.breathingScore ?? legacyBreathing) as StrengthFeedbackValues["strengthTechniqueScore"],
    strengthFailureProximityScore: (feedback.strengthFailureProximityScore ?? feedback.overallLoadScore ?? legacyEffort) as StrengthFeedbackValues["strengthFailureProximityScore"],
    strengthPainScore: (feedback.painScore ?? (feedback.bodyFeel === "pain" ? 4 : 1)) as StrengthFeedbackValues["strengthPainScore"],
    strengthRecoveryScore: (feedback.recoveryScore ?? legacyBody) as StrengthFeedbackValues["strengthRecoveryScore"],
    strengthFocusArea: (feedback.strengthFocusArea ?? "full_body") as StrengthFeedbackValues["strengthFocusArea"],
    strengthPainArea: feedback.painArea ?? "",
    strengthOpenNote: feedback.openNote ?? ""
  };
}

function scoreVisual(score: number) {
  return (
    <span className="feedback-score-visual" aria-hidden>
      {[1, 2, 3, 4, 5].map((point) => (
        <i key={point} className={point <= score ? "on" : ""} />
      ))}
    </span>
  );
}

export default function FeedbackInline({ workoutId, date, sport }: Props) {
  const [form, setForm] = useState<{
    perceivedEffort: "easy" | "moderate" | "hard" | "max";
    bodyFeel: "fresh" | "normal" | "heavy" | "pain";
    breathingFeel: "easy" | "steady" | "hard";
  }>({
    perceivedEffort: "moderate",
    bodyFeel: "normal",
    breathingFeel: "steady"
  });
  const [rawFeedback, setRawFeedback] = useState<Feedback | null>(null);
  const [runForm, setRunForm] = useState<RunFeedbackValues>(defaultRunFeedbackValues());
  const [strengthForm, setStrengthForm] = useState<StrengthFeedbackValues>(defaultStrengthFeedbackValues());
  const [painAreas, setPainAreas] = useState<string[]>([]);
  const [editing, setEditing] = useState(sport === "run");
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState("");

  async function loadFeedback() {
    const [feedbackRes, optionsRes] = await Promise.all([
      fetch(`/api/checkin/workout-feedback?workoutId=${workoutId}`).then((r) => r.json()),
      sport === "run" ? fetch("/api/checkin/options").then((r) => r.json()) : Promise.resolve(null)
    ]);
    const feedback = (feedbackRes.feedback ?? null) as Feedback | null;
    setRawFeedback(feedback);
    if (feedback) {
      setForm({
        perceivedEffort: feedback.perceivedEffort,
        bodyFeel: feedback.bodyFeel,
        breathingFeel: feedback.breathingFeel
      });
      if (sport === "run") {
        setRunForm(runFromLegacy(feedback));
      } else if (sport === "strength") {
        setStrengthForm(strengthFromFeedback(feedback));
      }
    } else if (sport === "run") {
      setRunForm(defaultRunFeedbackValues());
    } else if (sport === "strength") {
      setStrengthForm(defaultStrengthFeedbackValues());
    }
    if (sport === "run" && optionsRes) {
      setPainAreas(
        (((optionsRes as { painAreas?: Array<{ name: string }> }).painAreas ?? []) as Array<{ name: string }>).map(
          (item) => item.name
        )
      );
    }
    setEditing(!feedback && (sport === "run" || sport === "strength"));
    setLoaded(true);
  }

  useEffect(() => {
    void loadFeedback();
  }, [workoutId, sport]);

  async function save() {
    const body =
      sport === "run"
        ? {
            workoutId,
            date,
            sport,
            ...runForm,
            painArea: runForm.painScore >= 2 ? runForm.painArea : ""
          }
        : sport === "strength"
          ? {
              workoutId,
              date,
              sport,
              ...strengthForm
            }
          : {
            workoutId,
            date,
            sport,
            ...form
          };
    const res = await fetch("/api/checkin/workout-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      setStatus("שמירה נכשלה.");
      return;
    }
    await loadFeedback();
    setEditing(false);
    setStatus("נשמר.");
  }

  if (sport === "run") {
    const compactRows: CompactRunRow[] = rawFeedback
      ? scoreMeta
          .map((item) => {
            const value = rawFeedback[item.key];
            if (value == null || value < 1 || value > 5) {
              return null;
            }
            const text = item.options[value - 1];
            if (!text) {
              return null;
            }
            return {
              key: item.key,
              label: item.label,
              value,
              text
            } satisfies CompactRunRow;
          })
          .filter((row): row is CompactRunRow => row != null)
      : [];

    return (
      <div className="run-feedback-shell">
        {!loaded ? (
          <p className="note">טוען משוב...</p>
        ) : editing ? (
          <>
            <RunFeedbackForm value={runForm} onChange={setRunForm} painAreas={painAreas} compact />
            <div className="row">
              <button onClick={save}>שמור משוב ריצה</button>
              {rawFeedback && <button className="choice-btn" onClick={() => setEditing(false)}>סגור עריכה</button>}
              {status && <p className="note">{status}</p>}
            </div>
          </>
        ) : rawFeedback ? (
          <article className="run-feedback-summary-card">
            <div className="run-feedback-summary-head">
              <strong>סיכום משוב ריצה</strong>
              <button className="choice-btn" onClick={() => setEditing(true)}>ערוך</button>
            </div>
            {compactRows.length > 0 ? (
              <div className="run-feedback-summary-grid">
                {compactRows.map((row) => (
                  <div key={row.key} className="run-feedback-summary-row">
                    <span className="run-feedback-summary-label">{row.label}</span>
                    <span className="run-feedback-summary-text">{row.text}</span>
                    {scoreVisual(row.value)}
                  </div>
                ))}
              </div>
            ) : (
              <p className="note">אין תשובות מפורטות שמורות עדיין.</p>
            )}
            {(rawFeedback.painArea || (rawFeedback.fuelingSource && rawFeedback.fuelingSource !== "none") || rawFeedback.openNote) && (
              <details className="expand-block">
                <summary>פרטים נוספים</summary>
                <ul className="kv compact-kv">
                  {rawFeedback.painArea ? <li>אזור כאב: {rawFeedback.painArea}</li> : null}
                  {rawFeedback.fuelingSource && rawFeedback.fuelingSource !== "none" ? (
                    <li>
                      תזונה באימון: {rawFeedback.fuelingSource === "gel" ? "ג׳ל" : rawFeedback.fuelingSource === "date" ? "תמר" : "אחר"}
                      {rawFeedback.fuelingQuantity ? ` · כמות ${rawFeedback.fuelingQuantity}` : ""}
                    </li>
                  ) : null}
                  {rawFeedback.openNote ? <li>הערה: {rawFeedback.openNote}</li> : null}
                </ul>
              </details>
            )}
            {status && <p className="note">{status}</p>}
          </article>
        ) : (
          <div className="row">
            <button onClick={() => setEditing(true)}>הוסף משוב ריצה</button>
            {status && <p className="note">{status}</p>}
          </div>
        )}
      </div>
    );
  }

  if (sport === "strength") {
    const strengthRows: Array<{ key: string; label: string; value: number; text: string }> = rawFeedback
      ? [
          {
            key: "strengthEffortScore",
            label: "מאמץ כללי",
            value: rawFeedback.rpeScore ?? 3,
            text: ["קל מאוד", "קל", "בינוני", "קשה", "קשה מאוד"][(rawFeedback.rpeScore ?? 3) - 1] ?? "בינוני"
          },
          {
            key: "strengthMuscleLoadScore",
            label: "עומס שרירי",
            value: rawFeedback.legsLoadScore ?? 3,
            text: ["קל מאוד", "קל", "בינוני", "כבד", "כבד מאוד"][(rawFeedback.legsLoadScore ?? 3) - 1] ?? "בינוני"
          },
          {
            key: "strengthTechniqueScore",
            label: "איכות טכנית",
            value: rawFeedback.strengthTechniqueScore ?? rawFeedback.breathingScore ?? 3,
            text:
              ["נקייה מאוד", "נקייה", "סבירה", "יורדת", "מתפרקת"][
                (rawFeedback.strengthTechniqueScore ?? rawFeedback.breathingScore ?? 3) - 1
              ] ?? "סבירה"
          },
          {
            key: "strengthFailureProximityScore",
            label: "קרבה לכשל",
            value: rawFeedback.strengthFailureProximityScore ?? rawFeedback.overallLoadScore ?? 3,
            text:
              ["רחוק מכשל", "עוד מרווח", "בינוני", "קרוב לכשל", "כמעט כשל"][
                (rawFeedback.strengthFailureProximityScore ?? rawFeedback.overallLoadScore ?? 3) - 1
              ] ?? "בינוני"
          },
          {
            key: "strengthPainScore",
            label: "כאב/רגישות",
            value: rawFeedback.painScore ?? 1,
            text: ["ללא כאב", "רגישות קלה", "כאב קל", "כאב מורגש", "כאב משמעותי"][(rawFeedback.painScore ?? 1) - 1] ?? "ללא כאב"
          },
          {
            key: "strengthRecoveryScore",
            label: "התאוששות",
            value: rawFeedback.recoveryScore ?? 3,
            text: ["רענן מאוד", "רענן", "בסדר", "עייף", "מותש"][(rawFeedback.recoveryScore ?? 3) - 1] ?? "בסדר"
          }
        ]
      : [];

    const focusLabel =
      rawFeedback?.strengthFocusArea === "upper_body"
        ? "פלג גוף עליון"
        : rawFeedback?.strengthFocusArea === "lower_body"
          ? "פלג גוף תחתון"
          : rawFeedback?.strengthFocusArea === "core"
            ? "ליבה"
            : "כל הגוף";

    return (
      <div className="run-feedback-shell">
        {!loaded ? (
          <p className="note">טוען משוב...</p>
        ) : editing ? (
          <>
            <StrengthFeedbackForm value={strengthForm} onChange={setStrengthForm} painAreas={painAreas} compact />
            <div className="row">
              <button onClick={save}>שמור משוב כוח</button>
              {rawFeedback && (
                <button className="choice-btn" onClick={() => setEditing(false)}>
                  סגור עריכה
                </button>
              )}
              {status && <p className="note">{status}</p>}
            </div>
          </>
        ) : rawFeedback ? (
          <article className="run-feedback-summary-card">
            <div className="run-feedback-summary-head">
              <strong>סיכום משוב כוח</strong>
              <button className="choice-btn" onClick={() => setEditing(true)}>
                ערוך
              </button>
            </div>
            {strengthRows.length > 0 ? (
              <div className="run-feedback-summary-grid">
                {strengthRows.map((row) => (
                  <div key={row.key} className="run-feedback-summary-row">
                    <span className="run-feedback-summary-label">{row.label}</span>
                    <span className="run-feedback-summary-text">{row.text}</span>
                    {scoreVisual(row.value)}
                  </div>
                ))}
              </div>
            ) : (
              <p className="note">אין תשובות שמורות עדיין.</p>
            )}
            <ul className="kv compact-kv">
              <li>פוקוס: {focusLabel}</li>
              {rawFeedback.painArea ? <li>אזור כאב: {rawFeedback.painArea}</li> : null}
              {rawFeedback.openNote ? <li>הערה: {rawFeedback.openNote}</li> : null}
            </ul>
            {status && <p className="note">{status}</p>}
          </article>
        ) : (
          <div className="row">
            <button onClick={() => setEditing(true)}>הוסף משוב כוח</button>
            {status && <p className="note">{status}</p>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="row">
      <label className="field">
        תחושת מאמץ
        <UiSelect
          value={form.perceivedEffort}
          onChange={(nextValue) => setForm((p) => ({ ...p, perceivedEffort: nextValue as typeof p.perceivedEffort }))}
          options={[
            { value: "easy", label: "קל" },
            { value: "moderate", label: "בינוני" },
            { value: "hard", label: "קשה" },
            { value: "max", label: "מקסימלי" }
          ]}
        />
      </label>
      <label className="field">
        תחושת שרירים
        <UiSelect
          value={form.bodyFeel}
          onChange={(nextValue) => setForm((p) => ({ ...p, bodyFeel: nextValue as typeof p.bodyFeel }))}
          options={[
            { value: "fresh", label: "רענן" },
            { value: "normal", label: "רגיל" },
            { value: "heavy", label: "כבד" },
            { value: "pain", label: "כאב" }
          ]}
        />
      </label>
      <label className="field">
        תחושת נשימה
        <UiSelect
          value={form.breathingFeel}
          onChange={(nextValue) => setForm((p) => ({ ...p, breathingFeel: nextValue as typeof p.breathingFeel }))}
          options={[
            { value: "easy", label: "נוחה" },
            { value: "steady", label: "יציבה" },
            { value: "hard", label: "מאומצת" }
          ]}
        />
      </label>
      <button onClick={save}>שמור משוב</button>
      {status && <p className="note">{status}</p>}
    </div>
  );
}
