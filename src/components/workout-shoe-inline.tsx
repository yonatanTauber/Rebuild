"use client";

import { useEffect, useState } from "react";
import UiSelect from "@/components/ui-select";

type Shoe = {
  id: string;
  name: string;
  brand: string;
  isDefault: boolean;
  totalKm?: number;
  targetKm?: number;
};

export default function WorkoutShoeInline({
  workoutId,
  currentShoeId,
  compact = false
}: {
  workoutId: string;
  currentShoeId?: string | null;
  compact?: boolean;
}) {
  const [shoes, setShoes] = useState<Shoe[]>([]);
  const [selected, setSelected] = useState<string>(currentShoeId ?? "");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  function showStatus(message: string) {
    setStatus(message);
    setTimeout(() => setStatus(""), 2200);
  }

  async function loadShoes(nextSelected?: string) {
    const response = await fetch("/api/shoes");
    const data = (await response.json()) as { shoes?: Shoe[] };
    const list = (data.shoes ?? []) as Shoe[];
    setShoes(list);
    if (typeof nextSelected === "string") {
      setSelected(nextSelected);
    } else {
      setSelected(currentShoeId ?? "");
    }
  }

  useEffect(() => {
    let active = true;
    void fetch("/api/shoes")
      .then((r) => r.json())
      .then((data) => {
        if (!active) return;
        const list = (data.shoes ?? []) as Shoe[];
        setShoes(list);
        setSelected(currentShoeId ?? "");
      });
    return () => {
      active = false;
    };
  }, [currentShoeId]);

  async function saveSelection(value: string) {
    setSaving(true);
    try {
      const response = await fetch("/api/shoes/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workoutId, shoeId: value || null })
      });
      if (!response.ok) {
        showStatus("שיוך הנעל נכשל.");
        return;
      }
      const result = (await response.json()) as { saved?: boolean; shoeKmAtAssign?: number | null };
      await loadShoes(value);
      if (value) {
        const snapshotLabel =
          typeof result.shoeKmAtAssign === "number" ? ` · ${result.shoeKmAtAssign.toFixed(1)} ק״מ באימון` : "";
        showStatus(`שיוך הנעל נשמר${snapshotLabel}.`);
      } else {
        showStatus("שיוך הנעל הוסר.");
      }
    } finally {
      setSaving(false);
    }
  }

  function handleSelect(value: string) {
    setSelected(value);
    void saveSelection(value);
  }

  const selectedShoe = shoes.find((shoe) => shoe.id === selected);
  const totalKm = selectedShoe?.totalKm ?? 0;
  const targetKm = selectedShoe?.targetKm ?? 0;
  const progressPct = targetKm > 0 ? Math.max(0, Math.min(100, (totalKm / targetKm) * 100)) : 0;

  const renderSelect = () => (
    <UiSelect
      value={selected}
      onChange={handleSelect}
      disabled={saving}
      options={[
        { value: "", label: "-" },
        ...shoes.map((shoe) => ({
          value: shoe.id,
          label: `${shoe.name} · ${shoe.brand}${shoe.isDefault ? " (ברירת מחדל)" : ""}`
        }))
      ]}
    />
  );

  return (
    <div className={compact ? "compact-shoe-editor" : "row"}>
      {renderSelect()}
      {selectedShoe && targetKm > 0 && (
        <div className="shoe-usage-mini">
          <span
            className="shoe-usage-pie"
            style={{
              background: `conic-gradient(#3a9f6d 0 ${progressPct}%, #d9e4df ${progressPct}% 100%)`
            }}
            aria-hidden
          />
          <small>
            {totalKm.toFixed(1)} / {targetKm.toFixed(0)} ק״מ
          </small>
        </div>
      )}
      {status ? <small className="note">{status}</small> : null}
    </div>
  );
}
