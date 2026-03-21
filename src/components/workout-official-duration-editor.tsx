"use client";

import { useMemo, useState } from "react";

function formatClock(sec: number) {
  const rounded = Math.max(0, Math.round(sec));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function parseClockInput(value: string) {
  const parts = value
    .trim()
    .split(":")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2 || parts.length > 3) return null;
  const nums = parts.map((part) => Number(part));
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null;
  if (parts.length === 2) {
    const [m, s] = nums;
    return Math.round(m * 60 + s);
  }
  const [h, m, s] = nums;
  return Math.round(h * 3600 + m * 60 + s);
}

export default function WorkoutOfficialDurationEditor({
  workoutId,
  currentOfficialDurationSec
}: {
  workoutId: string;
  currentOfficialDurationSec: number;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(formatClock(currentOfficialDurationSec));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const parsed = useMemo(() => parseClockInput(value), [value]);

  async function save() {
    if (parsed == null || parsed < 60) {
      setError("פורמט זמן לא תקין. לדוגמה: 48:42 או 1:12:05");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/workouts/${workoutId}/official-duration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ officialDurationSec: parsed })
      });
      if (!res.ok) {
        setError("שמירת זמן רשמי נכשלה.");
        return;
      }
      setEditing(false);
      window.location.reload();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="official-time-inline">
      {!editing ? (
        <button type="button" className="choice-btn compact" onClick={() => setEditing(true)}>
          ערוך זמן רשמי
        </button>
      ) : (
        <div className="official-time-edit">
          <input value={value} onChange={(event) => setValue(event.target.value)} placeholder="דוגמה: 48:42" />
          <button type="button" className="choice-btn compact selected" onClick={save} disabled={saving}>
            {saving ? "שומר..." : "שמור"}
          </button>
          <button
            type="button"
            className="choice-btn compact"
            onClick={() => {
              setEditing(false);
              setError("");
              setValue(formatClock(currentOfficialDurationSec));
            }}
          >
            סגור
          </button>
        </div>
      )}
      {error ? <small className="note">{error}</small> : null}
    </div>
  );
}
