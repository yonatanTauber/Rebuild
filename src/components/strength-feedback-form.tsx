"use client";

import UiSelect from "@/components/ui-select";

export type StrengthFocusArea = "full_body" | "upper_body" | "lower_body" | "core";

export type StrengthFeedbackValues = {
  strengthEffortScore: 1 | 2 | 3 | 4 | 5;
  strengthMuscleLoadScore: 1 | 2 | 3 | 4 | 5;
  strengthTechniqueScore: 1 | 2 | 3 | 4 | 5;
  strengthFailureProximityScore: 1 | 2 | 3 | 4 | 5;
  strengthPainScore: 1 | 2 | 3 | 4 | 5;
  strengthRecoveryScore: 1 | 2 | 3 | 4 | 5;
  strengthFocusArea: StrengthFocusArea;
  strengthPainArea: string;
  strengthOpenNote: string;
};

type Props = {
  value: StrengthFeedbackValues;
  onChange: (next: StrengthFeedbackValues) => void;
  painAreas?: string[];
  compact?: boolean;
};

const scoreSets: Array<{
  key: keyof Pick<
    StrengthFeedbackValues,
    | "strengthEffortScore"
    | "strengthMuscleLoadScore"
    | "strengthTechniqueScore"
    | "strengthFailureProximityScore"
    | "strengthPainScore"
    | "strengthRecoveryScore"
  >;
  title: string;
  options: [string, string, string, string, string];
}> = [
  {
    key: "strengthEffortScore",
    title: "מאמץ כללי באימון",
    options: ["קל מאוד", "קל", "בינוני", "קשה", "קשה מאוד"]
  },
  {
    key: "strengthMuscleLoadScore",
    title: "עומס שרירי באימון",
    options: ["קל מאוד", "קל", "בינוני", "כבד", "כבד מאוד"]
  },
  {
    key: "strengthTechniqueScore",
    title: "איכות טכנית",
    options: ["נקייה מאוד", "נקייה", "סבירה", "יורדת", "מתפרקת"]
  },
  {
    key: "strengthFailureProximityScore",
    title: "קרבה לכשל",
    options: ["רחוק מכשל", "עוד מרווח", "בינוני", "קרוב לכשל", "כמעט כשל"]
  },
  {
    key: "strengthPainScore",
    title: "כאב/רגישות",
    options: ["ללא כאב", "רגישות קלה", "כאב קל", "כאב מורגש", "כאב משמעותי"]
  },
  {
    key: "strengthRecoveryScore",
    title: "תחושת התאוששות עכשיו",
    options: ["רענן מאוד", "רענן", "בסדר", "עייף", "מותש"]
  }
];

const focusOptions: Array<{ value: StrengthFocusArea; label: string }> = [
  { value: "full_body", label: "כל הגוף" },
  { value: "upper_body", label: "פלג גוף עליון" },
  { value: "lower_body", label: "פלג גוף תחתון" },
  { value: "core", label: "ליבה" }
];

export function defaultStrengthFeedbackValues(): StrengthFeedbackValues {
  return {
    strengthEffortScore: 3,
    strengthMuscleLoadScore: 3,
    strengthTechniqueScore: 2,
    strengthFailureProximityScore: 3,
    strengthPainScore: 1,
    strengthRecoveryScore: 3,
    strengthFocusArea: "full_body",
    strengthPainArea: "",
    strengthOpenNote: ""
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

export default function StrengthFeedbackForm({ value, onChange, painAreas = [], compact = false }: Props) {
  return (
    <div className={compact ? "run-feedback-form compact" : "run-feedback-form"}>
      <div className="run-feedback-grid">
        {scoreSets.map((item) =>
          scoreButtons(item.title, item.options, value[item.key], (score) => onChange({ ...value, [item.key]: score }))
        )}
      </div>

      <div className="journal-form-grid">
        <label className="field">
          פוקוס עיקרי
          <UiSelect
            value={value.strengthFocusArea}
            onChange={(nextValue) => onChange({ ...value, strengthFocusArea: nextValue as StrengthFocusArea })}
            options={focusOptions}
          />
        </label>
        {value.strengthPainScore >= 2 ? (
          <label className="field">
            אזור כאב (אם קיים)
            {painAreas.length > 0 ? (
              <UiSelect
                value={value.strengthPainArea}
                onChange={(nextValue) => onChange({ ...value, strengthPainArea: nextValue })}
                options={[{ value: "", label: "בחר אזור" }, ...painAreas.map((area) => ({ value: area, label: area }))]}
              />
            ) : (
              <input
                value={value.strengthPainArea}
                onChange={(event) => onChange({ ...value, strengthPainArea: event.target.value })}
                placeholder="למשל: כתף ימין"
              />
            )}
          </label>
        ) : null}
      </div>

      <label className="field">
        הערה חופשית (אופציונלי)
        <textarea
          rows={compact ? 2 : 3}
          value={value.strengthOpenNote}
          onChange={(event) => onChange({ ...value, strengthOpenNote: event.target.value })}
          placeholder="למשל: קטלבל 24 ק״ג, סטים כבדים, עייפות בידיים"
        />
      </label>
    </div>
  );
}
