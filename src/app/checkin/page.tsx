"use client";

import { useEffect, useState } from "react";
import { addDaysISO, formatISODate } from "@/lib/date";
import { Section } from "@/components/cards";

type Choice = { id: string; label: string };

type OptionsPayload = {
  options: {
    exertion: Choice[];
    sleep: Choice[];
    hrv: Choice[];
    restingHr: Choice[];
    mood: Choice[];
    sorenessLevel: Choice[];
  };
  painAreas: Array<{ id: string; name: string }>;
};

const labels = {
  exertion: "תחושת מאמץ כללית",
  sleep: "איך הייתה השינה",
  hrv: "סטטוס HRV",
  restingHr: "דופק מנוחה",
  mood: "מצב רוח",
  sorenessLevel: "רמת כאב/שריריות"
} as const;

export default function CheckinPage() {
  const [status, setStatus] = useState<string>("");
  const [options, setOptions] = useState<OptionsPayload | null>(null);
  const [newArea, setNewArea] = useState("");
  const [savedExists, setSavedExists] = useState(false);
  const [isEditing, setIsEditing] = useState(true);

  const [form, setForm] = useState({
    date: formatISODate(),
    exertion: "moderate",
    sleep: "good",
    hrv: "normal",
    restingHr: "normal",
    mood: "good",
    sorenessLevel: "light",
    painAreas: [] as string[],
    sleepHoursActual: "" as string,
    hrvActual: "" as string,
    restingHrActual: "" as string
  });

  function shiftDate(days: number) {
    const iso = addDaysISO(form.date, days);
    setForm((p) => ({ ...p, date: iso }));
    setStatus("");
  }

  useEffect(() => {
    void loadOptions();
  }, []);

  useEffect(() => {
    if (!options) return;
    void loadDaily(form.date);
  }, [options, form.date]);

  async function loadOptions() {
    const res = await fetch("/api/checkin/options");
    const data = (await res.json()) as OptionsPayload;
    setOptions(data);
  }

  function toChoiceIdFromRecovery(field: keyof OptionsPayload["options"], value: number | null | undefined) {
    if (value == null) return null;

    if (field === "exertion") {
      if (value <= 2.5) return "very_easy";
      if (value <= 4.5) return "easy";
      if (value <= 6.5) return "moderate";
      if (value <= 8.5) return "hard";
      return "max";
    }
    if (field === "sleep") {
      if (value < 6) return "poor";
      if (value < 7) return "ok";
      if (value < 8) return "good";
      return "great";
    }
    if (field === "hrv") {
      if (value < 40) return "low";
      if (value > 55) return "high";
      return "normal";
    }
    if (field === "restingHr") {
      if (value < 54) return "low";
      if (value > 62) return "high";
      return "normal";
    }
    if (field === "mood") {
      if (value <= 1.5) return "low";
      if (value <= 3.5) return "ok";
      if (value <= 4.5) return "good";
      return "great";
    }
    if (field === "sorenessLevel") {
      if (value <= 1.5) return "none";
      if (value <= 3.5) return "light";
      if (value <= 6.5) return "medium";
      return "high";
    }
    return null;
  }

  async function loadDaily(date: string) {
    const res = await fetch(`/api/checkin/daily?date=${date}`);
    const data = (await res.json()) as {
      exists: boolean;
      recovery?: {
        rpe?: number | null;
        sleepHours?: number | null;
        hrv?: number | null;
        restingHr?: number | null;
        mood?: number | null;
        sorenessGlobal?: number | null;
        sorenessByArea?: string | null;
      } | null;
    };

    setSavedExists(Boolean(data.exists));
    setIsEditing(!data.exists);

    if (!data.exists || !data.recovery) {
      return;
    }

    const recovery = data.recovery;
    let parsedAreas: string[] = [];
    if (recovery.sorenessByArea) {
      try {
        const arr = JSON.parse(recovery.sorenessByArea) as string[];
        if (Array.isArray(arr)) parsedAreas = arr;
      } catch {
        parsedAreas = [];
      }
    }

    setForm((prev) => ({
      ...prev,
      date,
      exertion: toChoiceIdFromRecovery("exertion", recovery.rpe) ?? prev.exertion,
      sleep: toChoiceIdFromRecovery("sleep", recovery.sleepHours) ?? prev.sleep,
      hrv: toChoiceIdFromRecovery("hrv", recovery.hrv) ?? prev.hrv,
      restingHr: toChoiceIdFromRecovery("restingHr", recovery.restingHr) ?? prev.restingHr,
      mood: toChoiceIdFromRecovery("mood", recovery.mood) ?? prev.mood,
      sorenessLevel: toChoiceIdFromRecovery("sorenessLevel", recovery.sorenessGlobal) ?? prev.sorenessLevel,
      painAreas: parsedAreas,
      sleepHoursActual: recovery.sleepHours != null ? String(recovery.sleepHours) : "",
      hrvActual: recovery.hrv != null ? String(recovery.hrv) : "",
      restingHrActual: recovery.restingHr != null ? String(recovery.restingHr) : ""
    }));
  }

  function togglePainArea(areaName: string) {
    setForm((prev) => ({
      ...prev,
      painAreas: prev.painAreas.includes(areaName) ? prev.painAreas.filter((x) => x !== areaName) : [...prev.painAreas, areaName]
    }));
  }

  async function addArea() {
    if (!newArea.trim()) return;

    const res = await fetch("/api/checkin/options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newArea })
    });

    if (!res.ok) {
      setStatus("לא הצלחנו להוסיף אזור חדש.");
      return;
    }

    const data = (await res.json()) as { painAreas: Array<{ id: string; name: string }> };
    setOptions((prev) => (prev ? { ...prev, painAreas: data.painAreas } : prev));
    setForm((prev) => ({ ...prev, painAreas: [...prev.painAreas, newArea.trim()] }));
    setNewArea("");
    setStatus("אזור נוסף ונשמר במערכת.");
  }

  async function submit() {
    const res = await fetch("/api/checkin/daily", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        sleepHoursActual: form.sleepHoursActual ? Number(form.sleepHoursActual) : null,
        hrvActual: form.hrvActual ? Number(form.hrvActual) : null,
        restingHrActual: form.restingHrActual ? Number(form.restingHrActual) : null
      })
    });

    if (res.ok) {
      setStatus("צ'ק-אין נשמר בהצלחה.");
      setSavedExists(true);
      setIsEditing(false);
      return;
    }

    const err = await res.json();
    setStatus(`שמירה נכשלה: ${JSON.stringify(err.error)}`);
  }

  function choiceGroup(field: keyof OptionsPayload["options"]) {
    const list = options?.options[field] ?? [];
    const selectedValue = form[field] as string;

    return (
      <div className="choice-group" key={field}>
        <p>{labels[field]}</p>
        <div className="choice-row">
          {list.map((choice) => {
            const selected = selectedValue === choice.id;
            return (
              <button
                key={choice.id}
                type="button"
                className={selected ? "choice-btn selected" : "choice-btn"}
                onClick={() => setForm((prev) => ({ ...prev, [field]: choice.id }))}
              >
                {choice.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function labelFor(field: keyof OptionsPayload["options"], id: string) {
    return options?.options[field].find((c) => c.id === id)?.label ?? id;
  }

  return (
    <>
      <header className="page-header">
        <h1>צ'ק-אין יומי</h1>
        <p>בחירה מהירה מתוך אפשרויות כדי לדייק את המלצת האימון.</p>
      </header>

      <Section title="מצב יומי" subtitle="ללא הזנת מספרים ידנית">
        <div className="row">
          <label className="field">
            תאריך
            <input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} />
          </label>
          <button type="button" className="choice-btn" onClick={() => shiftDate(-1)}>
            יום קודם
          </button>
          <button type="button" className="choice-btn" onClick={() => setForm((p) => ({ ...p, date: formatISODate() }))}>
            היום
          </button>
          <button type="button" className="choice-btn" onClick={() => shiftDate(1)}>
            יום הבא
          </button>
        </div>

        {!isEditing && savedExists ? (
          <div className="checkin-summary-card">
            <div className="checkin-summary-grid">
              <div><span>{labels.exertion}</span><strong>{labelFor("exertion", form.exertion)}</strong></div>
              <div><span>{labels.sleep}</span><strong>{labelFor("sleep", form.sleep)}</strong></div>
              <div><span>{labels.hrv}</span><strong>{labelFor("hrv", form.hrv)}</strong></div>
              <div><span>{labels.restingHr}</span><strong>{labelFor("restingHr", form.restingHr)}</strong></div>
              <div><span>{labels.mood}</span><strong>{labelFor("mood", form.mood)}</strong></div>
              <div><span>{labels.sorenessLevel}</span><strong>{labelFor("sorenessLevel", form.sorenessLevel)}</strong></div>
            </div>
            <p className="note">אזורי כאב: {form.painAreas.length ? form.painAreas.join(", ") : "ללא"}</p>
            <div className="row">
              <button type="button" className="choice-btn" onClick={() => setIsEditing(true)}>
                עריכה
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="checkin-compact-grid">
              {(["exertion", "sleep", "hrv", "restingHr", "mood", "sorenessLevel"] as const).map((field) => choiceGroup(field))}
            </div>

            <div className="choice-group">
              <p>אזורי כאב בגוף</p>
              <div className="choice-row">
                {(options?.painAreas ?? []).map((area) => {
                  const selected = form.painAreas.includes(area.name);
                  return (
                    <button
                      key={area.id}
                      type="button"
                      className={selected ? "choice-btn selected" : "choice-btn"}
                      onClick={() => togglePainArea(area.name)}
                    >
                      {area.name}
                    </button>
                  );
                })}
              </div>
              <div className="row">
                <label className="field">
                  הוסף אזור כאב חדש
                  <input value={newArea} onChange={(e) => setNewArea(e.target.value)} placeholder="למשל: כתף ימין" />
                </label>
                <button type="button" className="alt" onClick={addArea}>
                  הוסף אזור
                </button>
              </div>
            </div>

            <details className="expand-block">
              <summary>פרטים אופציונליים (אם יש לך נתון מדויק)</summary>
              <div className="row">
                <label className="field">
                  שעות שינה בפועל
                  <input
                    type="number"
                    step="0.1"
                    value={form.sleepHoursActual}
                    onChange={(e) => setForm((p) => ({ ...p, sleepHoursActual: e.target.value }))}
                    placeholder="למשל 7.4"
                  />
                </label>
                <label className="field">
                  HRV בפועל
                  <input
                    type="number"
                    value={form.hrvActual}
                    onChange={(e) => setForm((p) => ({ ...p, hrvActual: e.target.value }))}
                    placeholder="למשל 48"
                  />
                </label>
                <label className="field">
                  דופק מנוחה בפועל
                  <input
                    type="number"
                    value={form.restingHrActual}
                    onChange={(e) => setForm((p) => ({ ...p, restingHrActual: e.target.value }))}
                    placeholder="למשל 56"
                  />
                </label>
              </div>
            </details>

            <div className="row">
              <button onClick={submit}>שמור צ'ק-אין</button>
            </div>
          </>
        )}
        {status && <p className="note">{status}</p>}
      </Section>
    </>
  );
}
