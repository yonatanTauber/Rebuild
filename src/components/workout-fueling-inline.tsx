"use client";

import { useEffect, useMemo, useState } from "react";
import type { WorkoutFuelingEntry } from "@/lib/types";

type FuelRow = {
  itemName: string;
  quantity: number;
  unitLabel: string;
  carbsG: number;
  kcal: string;
  caffeineMg: string;
  notes: string;
};

function emptyRow(): FuelRow {
  return {
    itemName: "",
    quantity: 1,
    unitLabel: "יח׳",
    carbsG: 25,
    kcal: "",
    caffeineMg: "",
    notes: ""
  };
}

export default function WorkoutFuelingInline({ workoutId }: { workoutId: string }) {
  const [rows, setRows] = useState<FuelRow[]>([]);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    void fetch(`/api/workouts/${workoutId}/fueling`)
      .then((res) => res.json())
      .then((payload) => {
        const items = ((payload.items ?? []) as WorkoutFuelingEntry[]).map((item) => ({
          itemName: item.itemName,
          quantity: Number(item.quantity),
          unitLabel: item.unitLabel,
          carbsG: Number(item.carbsG),
          kcal: item.kcal == null ? "" : String(item.kcal),
          caffeineMg: item.caffeineMg == null ? "" : String(item.caffeineMg),
          notes: item.notes ?? ""
        }));
        setRows(items);
        setEditing(items.length > 0);
      });
  }, [workoutId]);

  const totalCarbs = useMemo(() => rows.reduce((sum, row) => sum + (Number.isFinite(row.carbsG) ? row.carbsG : 0), 0), [rows]);
  const totalKcal = useMemo(
    () => rows.reduce((sum, row) => sum + (row.kcal.trim() ? Number(row.kcal) || 0 : 0), 0),
    [rows]
  );

  function updateRow(index: number, patch: Partial<FuelRow>) {
    setRows((prev) => prev.map((row, idx) => (idx === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setEditing(true);
    setRows((prev) => [...prev, emptyRow()]);
  }

  function removeRow(index: number) {
    setRows((prev) => {
      const next = prev.filter((_, idx) => idx !== index);
      if (next.length === 0) {
        setEditing(false);
      }
      return next;
    });
  }

  async function save() {
    const items = rows
      .map((row) => ({
        itemName: row.itemName.trim(),
        quantity: Number(row.quantity),
        unitLabel: row.unitLabel.trim() || "יח׳",
        carbsG: Number(row.carbsG),
        kcal: row.kcal.trim() ? Number(row.kcal) : null,
        caffeineMg: row.caffeineMg.trim() ? Number(row.caffeineMg) : null,
        notes: row.notes.trim() || null
      }))
      .filter((row) => row.itemName && Number.isFinite(row.quantity) && row.quantity > 0 && Number.isFinite(row.carbsG));

    setSaving(true);
    try {
      const res = await fetch(`/api/workouts/${workoutId}/fueling`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items })
      });
      if (!res.ok) {
        setStatus("שמירת תזונת האימון נכשלה.");
        return;
      }
      const payload = (await res.json()) as { items?: WorkoutFuelingEntry[] };
      const savedRows = ((payload.items ?? []) as WorkoutFuelingEntry[]).map((item) => ({
        itemName: item.itemName,
        quantity: Number(item.quantity),
        unitLabel: item.unitLabel,
        carbsG: Number(item.carbsG),
        kcal: item.kcal == null ? "" : String(item.kcal),
        caffeineMg: item.caffeineMg == null ? "" : String(item.caffeineMg),
        notes: item.notes ?? ""
      }));
      setRows(savedRows);
      setEditing(savedRows.length > 0);
      setStatus(savedRows.length > 0 ? "תזונת האימון נשמרה." : "אין תזונה מתועדת לאימון הזה.");
    } finally {
      setSaving(false);
      setTimeout(() => setStatus(""), 2200);
    }
  }

  function startEditing() {
    setEditing(true);
    if (rows.length === 0) {
      setRows([emptyRow()]);
    }
  }

  return (
    <div className="workout-fueling-box">
      <div className="workout-fueling-head">
        <strong>תזונה תוך כדי</strong>
        <span className="note">סה״כ {Math.round(totalCarbs)}ג׳ פחמימה{totalKcal > 0 ? ` · ${Math.round(totalKcal)} קק״ל` : ""}</span>
      </div>
      {!editing && rows.length === 0 ? (
        <div className="workout-fueling-empty">
          <p className="note">אין תזונה מתועדת לאימון הזה.</p>
          <button className="choice-btn" onClick={startEditing}>הוסף תזונה באימון</button>
        </div>
      ) : (
        <>
          <div className="workout-fueling-list">
            {rows.map((row, index) => (
              <div key={`fuel-${index}`} className="workout-fueling-row">
                <input
                  value={row.itemName}
                  onChange={(event) => updateRow(index, { itemName: event.target.value })}
                  placeholder="למשל ג׳ל / איזוטוני / תמר"
                />
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={row.quantity}
                  onChange={(event) => updateRow(index, { quantity: Number(event.target.value) })}
                  placeholder="כמות"
                />
                <input
                  value={row.unitLabel}
                  onChange={(event) => updateRow(index, { unitLabel: event.target.value })}
                  placeholder="יח׳ / מ״ל"
                />
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={row.carbsG}
                  onChange={(event) => updateRow(index, { carbsG: Number(event.target.value) })}
                  placeholder="פחמימה"
                />
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={row.kcal}
                  onChange={(event) => updateRow(index, { kcal: event.target.value })}
                  placeholder="קק״ל"
                />
                <button className="icon-btn" onClick={() => removeRow(index)} aria-label="הסר רכיב תזונה" title="הסר רכיב תזונה">
                  ✕
                </button>
              </div>
            ))}
          </div>
          <div className="row">
            <button className="icon-btn" onClick={addRow} aria-label="הוסף רכיב תזונה" title="הוסף רכיב תזונה">
              ＋
            </button>
            <button className="choice-btn" onClick={() => void save()} disabled={saving}>
              {saving ? "שומר..." : "שמור תזונת אימון"}
            </button>
          </div>
        </>
      )}
      {status && <p className="note">{status}</p>}
    </div>
  );
}
