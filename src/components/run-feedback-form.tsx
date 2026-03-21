"use client";

import UiSelect from "@/components/ui-select";

export type RunFuelingSource = "none" | "gel" | "date" | "other";

export type RunFeedbackValues = {
  rpeScore: 1 | 2 | 3 | 4 | 5;
  legsLoadScore: 1 | 2 | 3 | 4 | 5;
  painScore: 1 | 2 | 3 | 4 | 5;
  painArea: string;
  addFiveKmScore: 1 | 2 | 3 | 4 | 5;
  recoveryScore: 1 | 2 | 3 | 4 | 5;
  breathingScore: 1 | 2 | 3 | 4 | 5;
  overallLoadScore: 1 | 2 | 3 | 4 | 5;
  preRunNutritionScore: 1 | 2 | 3 | 4 | 5;
  environmentScore: 1 | 2 | 3 | 4 | 5;
  satisfactionScore: 1 | 2 | 3 | 4 | 5;
  fuelingSource: RunFuelingSource;
  fuelingQuantity: number;
  openNote: string;
};

type Props = {
  value: RunFeedbackValues;
  onChange: (next: RunFeedbackValues) => void;
  painAreas?: string[];
  compact?: boolean;
};

const scoreSets: Array<{
  key: keyof Omit<
    RunFeedbackValues,
    "painArea" | "fuelingSource" | "fuelingQuantity" | "openNote"
  >;
  title: string;
  options: [string, string, string, string, string];
}> = [
  {
    key: "rpeScore",
    title: "תחושת מאמץ כללית (RPE) — כמה קשה הריצה הרגישה?",
    options: ["קלה מאוד", "קלה", "בינונית", "קשה", "קשה מאוד"]
  },
  {
    key: "legsLoadScore",
    title: "עומס על הרגליים — כמה עומס הרגשת במהלך הריצה?",
    options: ["קלילות מאוד", "קלילות", "בינוני", "כבדות", "כבדות מאוד"]
  },
  {
    key: "painScore",
    title: "כאב או רגישות — כמה כאב/רגישות הופיעו במהלך הריצה?",
    options: ["ללא כאב", "רגישות קלה", "כאב קל", "כאב מורגש", "כאב משמעותי"]
  },
  {
    key: "addFiveKmScore",
    title: "יכולת להמשיך — כמה קשה היה להוסיף עוד 5 ק״מ בסיום?",
    options: ["בקלות", "די בקלות", "אפשרי מאתגר", "קשה מאוד", "בלתי אפשרי"]
  },
  {
    key: "recoveryScore",
    title: "התאוששות אחרי הריצה — איך הגוף מרגיש עכשיו?",
    options: ["רענן מאוד", "רענן", "בסדר", "עייף", "מותש"]
  },
  {
    key: "breathingScore",
    title: "נשימה — כמה הנשימה הייתה מגבילה במהלך הריצה?",
    options: ["חופשית", "מעט מאמץ", "בינוני", "קשה", "קשה מאוד"]
  },
  {
    key: "overallLoadScore",
    title: "עומס כללי — כמה האימון הרגיש עמוס לגוף?",
    options: ["קל מאוד", "קל", "בינוני", "קשה", "קשה מאוד"]
  },
  {
    key: "preRunNutritionScore",
    title: "תזונה לפני הריצה — כמה האנרגיה מהאוכל הספיקה?",
    options: ["מצוינת", "טובה", "בסדר", "מעט חסר", "חסר משמעותי"]
  },
  {
    key: "environmentScore",
    title: "תנאי סביבה — כמה התנאים הקשו על הריצה?",
    options: ["מצוינים", "טובים", "בינוניים", "קשים", "קשים מאוד"]
  },
  {
    key: "satisfactionScore",
    title: "שביעות רצון מהאימון — כמה אתה מרוצה מהאימון?",
    options: ["מצוין", "טוב מאוד", "טוב", "בינוני", "לא טוב"]
  }
];

export function defaultRunFeedbackValues(): RunFeedbackValues {
  return {
    rpeScore: 3,
    legsLoadScore: 3,
    painScore: 1,
    painArea: "",
    addFiveKmScore: 3,
    recoveryScore: 3,
    breathingScore: 3,
    overallLoadScore: 3,
    preRunNutritionScore: 3,
    environmentScore: 3,
    satisfactionScore: 3,
    fuelingSource: "none",
    fuelingQuantity: 0,
    openNote: ""
  };
}

function scoreButtons(
  title: string,
  labels: [string, string, string, string, string],
  value: 1 | 2 | 3 | 4 | 5,
  onPick: (score: 1 | 2 | 3 | 4 | 5) => void
) {
  return (
    <article className="run-feedback-question" key={title}>
      <p>{title}</p>
      <div className="run-score-row">
        {labels.map((label, index) => {
          const score = (index + 1) as 1 | 2 | 3 | 4 | 5;
          return (
            <button
              key={label}
              type="button"
              className={value === score ? "run-option-btn selected" : "run-option-btn"}
              onClick={() => onPick(score)}
            >
              {label}
            </button>
          );
        })}
      </div>
    </article>
  );
}

export default function RunFeedbackForm({ value, onChange, painAreas = [], compact = false }: Props) {
  return (
    <div className={compact ? "run-feedback-form compact" : "run-feedback-form"}>
      <div className="run-feedback-grid">
        {scoreSets.map((item) =>
          scoreButtons(item.title, item.options, value[item.key], (score) =>
            onChange({ ...value, [item.key]: score })
          )
        )}
      </div>

      {value.painScore >= 2 && (
        <label className="field">
          איפה בגוף הופיע כאב/רגישות?
          {painAreas.length > 0 ? (
            <UiSelect
              value={value.painArea}
              onChange={(nextValue) => onChange({ ...value, painArea: nextValue })}
              options={[
                { value: "", label: "בחר אזור" },
                ...painAreas.map((area) => ({ value: area, label: area }))
              ]}
            />
          ) : (
            <input
              value={value.painArea}
              onChange={(event) => onChange({ ...value, painArea: event.target.value })}
              placeholder="לדוגמה: ברך ימין / שוק שמאל"
            />
          )}
        </label>
      )}

      <article className="run-feedback-question">
        <p>תזונה באימון (תוך כדי ריצה)</p>
        <div className="choice-row">
          {[
            { id: "none", label: "ללא" },
            { id: "gel", label: "ג׳ל" },
            { id: "date", label: "תמר" },
            { id: "other", label: "אחר" }
          ].map((option) => (
            <button
              key={option.id}
              type="button"
              className={value.fuelingSource === option.id ? "run-option-btn selected" : "run-option-btn"}
              onClick={() => onChange({ ...value, fuelingSource: option.id as RunFuelingSource })}
            >
              {option.label}
            </button>
          ))}
        </div>
        {value.fuelingSource !== "none" && (
          <label className="field">
            כמות
            <input
              type="number"
              min={0}
              step={0.5}
              value={value.fuelingQuantity}
              onChange={(event) =>
                onChange({
                  ...value,
                  fuelingQuantity: Number(event.target.value)
                })
              }
            />
          </label>
        )}
      </article>

      <label className="field">
        יש משהו חשוב שקרה במהלך הריצה שכדאי לתעד?
        <textarea
          rows={3}
          value={value.openNote}
          onChange={(event) => onChange({ ...value, openNote: event.target.value })}
          placeholder="כאב, שינוי קצב, מזג אוויר, תזונה, תחושה מיוחדת וכו׳"
        />
      </label>
    </div>
  );
}
