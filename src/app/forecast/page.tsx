"use client";

import { useEffect, useState } from "react";
import { Section } from "@/components/cards";
import { formatDisplayDate, formatISODate } from "@/lib/date";

type ComplianceState = "on_target" | "under" | "over" | "skipped" | "unplanned";

type Forecast = {
  days: Array<{
    date: string;
    dayName: string;
    plannedLoad: number;
    effectiveLoad: number;
    projectedFatigue: number;
    projectedReadiness: number;
    selectedOptionId: string;
    recommendation: string;
    executionFeedback: "light" | "as_planned" | "hard" | "skipped" | null;
    complianceState: ComplianceState;
    options: Array<{
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
    }>;
  }>;
  weeklyPlan: {
    profile: "free" | "balanced" | "busy" | "vacation";
    availability: "low" | "normal" | "high";
    targetWeekStart: string;
    lockedWeekStart: string | null;
    isLocked: boolean;
    canEdit: boolean;
  };
};

type NutritionDay = {
  date: string;
  carbsG: number;
  proteinG: number;
  fatG: number;
  hydrationMl: number;
  preWorkoutNote: string;
  postWorkoutNote: string;
};

type DayMode = "easy" | "normal" | "hard";

function sportLabel(sport: "run" | "bike" | "swim") {
  if (sport === "run") return "ריצה";
  if (sport === "bike") return "אופניים";
  return "שחייה";
}

function getModeOptions(
  options: Forecast["days"][number]["options"]
): Record<DayMode, Forecast["days"][number]["options"][number]> | null {
  if (!options.length) return null;
  const sorted = [...options].sort((a, b) => a.plannedLoad - b.plannedLoad);
  return {
    easy: sorted[0],
    normal: sorted[Math.floor(sorted.length / 2)],
    hard: sorted[sorted.length - 1]
  };
}

export default function ForecastPage() {
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [nutrition, setNutrition] = useState<NutritionDay[]>([]);
  const currentDate = formatISODate();

  useEffect(() => {
    void loadForecast();
  }, []);

  async function loadForecast() {
    const [f, n] = await Promise.all([
      fetch("/api/dashboard/forecast?days=7").then((res) => res.json()),
      fetch("/api/nutrition/forecast?days=7").then((res) => res.json())
    ]);
    setForecast(f as Forecast);
    setNutrition(((n as { days?: NutritionDay[] }).days ?? []) as NutritionDay[]);
  }

  async function reportExecution(dayDate: string, effort: "light" | "as_planned" | "hard" | "skipped") {
    await fetch("/api/dashboard/forecast/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: dayDate, effort })
    });
    await loadForecast();
  }

  async function applyDayOption(dayDate: string, option: Forecast["days"][number]["options"][number]) {
    await fetch("/api/dashboard/forecast/choice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: dayDate,
        optionId: option.id,
        option
      })
    });
    await loadForecast();
  }

  async function applyDayMode(day: Forecast["days"][number], mode: DayMode) {
    const modes = getModeOptions(day.options);
    if (!modes) return;
    await applyDayOption(day.date, modes[mode]);
  }

  async function setWeeklyPlan(profile: "free" | "balanced" | "busy" | "vacation") {
    await fetch("/api/dashboard/weekly-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile, date: currentDate })
    });
    await loadForecast();
  }

  async function unlockWeek() {
    await fetch("/api/dashboard/weekly-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unlock: true, date: currentDate })
    });
    await loadForecast();
  }

  function complianceLabel(state: ComplianceState) {
    if (state === "on_target") return "כמתוכנן";
    if (state === "under") return "מתחת לתכנון";
    if (state === "over") return "מעל התכנון";
    if (state === "skipped") return "דולג";
    return "לא מתוכנן";
  }

  const weekLoadPlanned = (forecast?.days ?? []).reduce((sum, day) => sum + day.plannedLoad, 0);
  const weekLoadEffective = (forecast?.days ?? []).reduce((sum, day) => sum + day.effectiveLoad, 0);

  return (
    <>
      <header className="page-header">
        <h1>תחזית 7 ימים</h1>
        <p>תוכנית שבועית מפורטת עם התאמה לפי הביצוע בפועל.</p>
      </header>

      <section className="today-hero">
        <div className="hero-grid">
          <article className="hero-main">
            <h3>מבט שבועי</h3>
            <p>
              עומס מתוכנן שבועי: {weekLoadPlanned} | עומס אפקטיבי שבועי: {weekLoadEffective}
            </p>
            <div className="forecast-lock-strip">
              <span className={forecast?.weeklyPlan.isLocked ? "compliance-badge on_target" : "compliance-badge unplanned"}>
                {forecast?.weeklyPlan.isLocked ? "השבוע נעול" : "השבוע פתוח"}
              </span>
              <span className="note">
                {forecast?.weeklyPlan.targetWeekStart
                  ? `חל על השבוע שמתחיל ב־${formatDisplayDate(forecast.weeklyPlan.targetWeekStart)}`
                  : "—"}
              </span>
            </div>
          </article>
          <article className="hero-side calm">
            <p>המלצת פתיחה לשבוע</p>
            <strong>{forecast?.days[0]?.recommendation ?? "טוען תחזית..."}</strong>
          </article>
        </div>
      </section>

      <Section title="תכנון שבוע" subtitle="סוג שבוע קובע את תקציב העומס">
        <div className="weekly-plan-controls">
          <div>
            <p>סוג שבוע</p>
            <div className="choice-row">
              {[
                { id: "free", label: "פנוי" },
                { id: "balanced", label: "מאוזן" },
                { id: "busy", label: "עמוס" },
                { id: "vacation", label: "חופשה" }
              ].map((p) => (
                <button
                  key={p.id}
                  className={forecast?.weeklyPlan.profile === p.id ? "choice-btn selected" : "choice-btn"}
                  disabled={Boolean(forecast?.weeklyPlan.isLocked)}
                  onClick={() => setWeeklyPlan(p.id as "free" | "balanced" | "busy" | "vacation")}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="weekly-lock-panel">
            <p>נעילת שבוע</p>
            <div className="weekly-lock-actions">
              <span className="note">
                {forecast?.weeklyPlan.isLocked
                  ? "אופי השבוע נקבע ונשאר קבוע עד שתפתח אותו."
                  : "בחר אופי שבוע פעם אחת והוא יינעל."}
              </span>
              <button className="choice-btn" onClick={unlockWeek} disabled={!forecast?.weeklyPlan.isLocked}>
                פתח את השבוע
              </button>
            </div>
          </div>
        </div>
      </Section>

      <Section title="התוכנית היומית" subtitle="תצוגה קומפקטית. פותחים יום רק כשצריך פירוט">
        <ul className="forecast forecast-grid">
          {forecast?.days.map((d) => (
            <li key={d.date}>
              <details className="expand-block">
                <summary>
                  <span className="forecast-day-head">
                    <strong>
                      {d.dayName} {formatDisplayDate(d.date)}
                    </strong>
                    <span className={`compliance-badge ${d.complianceState}`}>{complianceLabel(d.complianceState)}</span>
                  </span>
                  <span className="note">{d.recommendation}</span>
                </summary>
                <ul className="kv compact-kv">
                  <li>עומס מתוכנן: {d.plannedLoad}</li>
                  <li>עומס אפקטיבי: {d.effectiveLoad}</li>
                  <li>מוכנות חזויה: {d.projectedReadiness}</li>
                  <li>עייפות חזויה: {d.projectedFatigue}</li>
                </ul>
                {(() => {
                  const selected = d.options.find((option) => option.id === d.selectedOptionId) ?? d.options[0];
                  const alternatives = d.options.filter((option) => option.id !== selected?.id).slice(0, 3);
                  return selected ? (
                    <div className="forecast-day-layout">
                      <article className="forecast-feature-card">
                        <div className="forecast-feature-head">
                          <span className={`sport-tag ${selected.sport}`}>{sportLabel(selected.sport)}</span>
                          <strong>{selected.workoutType}</strong>
                        </div>
                        <p className="note">{selected.durationMin} דק׳ · {selected.intensityZone} · עומס {selected.plannedLoad}</p>
                        <ul className="kv compact-kv">
                          <li>מטרה: {selected.target}</li>
                          <li>מבנה: {selected.structure}</li>
                          <li>למה: {selected.why}</li>
                        </ul>
                        <div className="choice-row">
                          <button className="choice-btn" onClick={() => applyDayMode(d, "easy")}>קל יותר</button>
                          <button className="choice-btn" onClick={() => applyDayMode(d, "normal")}>איזון</button>
                          <button className="choice-btn" onClick={() => applyDayMode(d, "hard")}>חד יותר</button>
                        </div>
                      </article>
                      {alternatives.length > 0 && (
                        <div className="forecast-alt-list">
                          {alternatives.map((option) => (
                            <button key={option.id} className="forecast-alt-card" onClick={() => applyDayOption(d.date, option)}>
                              <span className={`sport-tag ${option.sport}`}>{sportLabel(option.sport)}</span>
                              <strong>{option.workoutType}</strong>
                              <small>{option.durationMin} דק׳ · {option.intensityZone}</small>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null;
                })()}
                <div className="forecast-feedback-row">
                  <span>דיווח אחרי ביצוע:</span>
                  {[
                    { id: "light", label: "היה קל" },
                    { id: "as_planned", label: "כמתוכנן" },
                    { id: "hard", label: "היה קשה" },
                    { id: "skipped", label: "דילגתי" }
                  ].map((f) => (
                    <button
                      key={`${d.date}-${f.id}`}
                      className={d.executionFeedback === f.id ? "forecast-feedback-btn selected" : "forecast-feedback-btn"}
                      onClick={() => reportExecution(d.date, f.id as "light" | "as_planned" | "hard" | "skipped")}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </details>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="תזונה לשבוע הקרוב" subtitle="מתעדכן אוטומטית לפי עומס האימונים שנקלט">
        <ul className="forecast forecast-grid">
          {nutrition.map((day) => (
            <li key={`nutrition-${day.date}`}>
              <div className="forecast-day-head">
                <strong>{formatDisplayDate(day.date)}</strong>
                <span className="compliance-badge under">Nutrition</span>
              </div>
              <ul className="kv compact-kv">
                <li>פחמימות: {day.carbsG} גרם</li>
                <li>חלבון: {day.proteinG} גרם</li>
                <li>שומן: {day.fatG} גרם</li>
                <li>נוזלים: {day.hydrationMl} מ"ל</li>
              </ul>
              <details className="expand-block">
                <summary>הנחיות לפני/אחרי אימון</summary>
                <p>{day.preWorkoutNote}</p>
                <p>{day.postWorkoutNote}</p>
              </details>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
