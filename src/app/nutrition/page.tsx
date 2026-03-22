"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { formatISODate, addDaysISO, formatDisplayDate } from "@/lib/date";

type NutritionMealItem = {
  ingredientId: string;
  name: string;
  quantity: number;
  unit: string;
  grams?: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

type NutritionMeal = {
  id: string;
  slot: string;
  items: NutritionMealItem[];
};

type JournalData = {
  nutrition: {
    plan: { hydrationMl: number };
    meals: NutritionMeal[];
    totals: { kcal: number; proteinG: number; carbsG: number; fatG: number };
    target: { kcal: number; proteinG: number; carbsG: number; fatG: number };
  };
};

type EditTarget = {
  meal: NutritionMeal;
  itemIdx: number;
  item: NutritionMealItem;
};

const UNIT_OPTIONS = [
  { value: "g", label: "גרם" },
  { value: "ml", label: "מ״ל" },
  { value: "unit", label: "יח׳" },
  { value: "tbsp", label: "כף" },
  { value: "tsp", label: "כפית" },
];

const SLOT_OPTIONS = [
  { value: "breakfast", label: "ארוחת בוקר" },
  { value: "lunch", label: "ארוחת צהריים" },
  { value: "dinner", label: "ארוחת ערב" },
  { value: "snack", label: "חטיף" },
  { value: "drinks", label: "שתייה" },
];

function slotLabel(slot: string) {
  return SLOT_OPTIONS.find((s) => s.value === slot)?.label ?? slot;
}

function slotIcon(slot: string) {
  if (slot === "breakfast") return "🌅";
  if (slot === "lunch") return "☀️";
  if (slot === "dinner") return "🌙";
  if (slot === "snack") return "🍎";
  if (slot === "drinks") return "💧";
  return "🍽️";
}

function mealKcal(meal: NutritionMeal) {
  return meal.items.reduce((sum, item) => sum + (item.kcal ?? 0), 0);
}

function mealMl(meal: NutritionMeal) {
  return meal.items.reduce((sum, item) => {
    if (item.unit === "ml") return sum + (Number(item.quantity) || 0);
    return sum;
  }, 0);
}

function stepForUnit(unit: string) {
  return unit === "g" || unit === "ml" ? 25 : 0.5;
}

const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack", "drinks"];

export default function NutritionPage() {
  const [date, setDate] = useState(formatISODate());
  const [data, setData] = useState<JournalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [addingWater, setAddingWater] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Edit modal state
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [editQty, setEditQty] = useState(1);
  const [editUnit, setEditUnit] = useState("g");
  const [editSlot, setEditSlot] = useState("breakfast");
  const [saving, setSaving] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async (d: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/journal/day?date=${d}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(date); }, [date, load]);

  const nutrition = data?.nutrition;
  const totals = nutrition?.totals ?? { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  const target = nutrition?.target ?? { kcal: 2000, proteinG: 150, carbsG: 250, fatG: 70 };
  const hydrationTarget = nutrition?.plan.hydrationMl ?? 2000;
  const drinkMeals = (nutrition?.meals ?? []).filter((m) => m.slot === "drinks");
  const totalDrinkMl = drinkMeals.reduce((sum, m) => sum + mealMl(m), 0);
  const hydrationPct = Math.min(Math.round((totalDrinkMl / hydrationTarget) * 100), 100);

  const kcalPct = Math.min(Math.round((totals.kcal / Math.max(1, target.kcal)) * 100), 100);
  const proteinPct = Math.min(Math.round((totals.proteinG / Math.max(1, target.proteinG)) * 100), 100);
  const carbsPct = Math.min(Math.round((totals.carbsG / Math.max(1, target.carbsG)) * 100), 100);
  const fatPct = Math.min(Math.round((totals.fatG / Math.max(1, target.fatG)) * 100), 100);

  const R = 44;
  const circumference = 2 * Math.PI * R;
  const kcalOffset = circumference - (circumference * kcalPct) / 100;

  async function addWater() {
    if (addingWater) return;
    setAddingWater(true);
    try {
      const res = await fetch("/api/nutrition/add-water", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, ml: 250 })
      });
      if (res.ok) { showToast("נוסף 250 מ״ל 💧"); await load(date); }
    } catch { /* silent */ } finally { setAddingWater(false); }
  }

  function openEdit(meal: NutritionMeal, itemIdx: number, item: NutritionMealItem) {
    setEditTarget({ meal, itemIdx, item });
    setEditQty(item.quantity);
    setEditUnit(item.unit);
    setEditSlot(meal.slot);
  }

  function closeEdit() {
    setEditTarget(null);
  }

  async function saveEdit() {
    if (!editTarget) return;
    setSaving(true);
    const { meal, itemIdx, item } = editTarget;
    const slotChanged = editSlot !== meal.slot;
    const qtyChanged = editQty !== item.quantity || editUnit !== item.unit;

    try {
      // Step 1: remove item from current meal
      const remaining = meal.items
        .filter((_, i) => i !== itemIdx)
        .map((it) => ({ ingredientId: it.ingredientId, quantity: it.quantity, unit: it.unit }));

      if (remaining.length === 0) {
        // Delete the whole meal
        await fetch("/api/nutrition/meal-delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mealId: meal.id })
        });
      } else {
        // Update meal without this item
        await fetch("/api/nutrition/meal-edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mealId: meal.id, items: remaining })
        });
      }

      // Step 2: add back to target slot (possibly same slot, new qty/unit)
      if (slotChanged || qtyChanged) {
        await fetch("/api/nutrition/favorites/add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date,
            favoriteId: `ingredient:${item.ingredientId}`,
            slot: editSlot,
            quantity: editQty,
            unit: editUnit
          })
        });
      } else if (!slotChanged && !qtyChanged) {
        // Nothing changed — just close
        closeEdit();
        return;
      }

      showToast("✓ עודכן");
      closeEdit();
      await load(date);
    } catch {
      showToast("שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem() {
    if (!editTarget) return;
    setSaving(true);
    const { meal, itemIdx } = editTarget;
    const remaining = meal.items
      .filter((_, i) => i !== itemIdx)
      .map((it) => ({ ingredientId: it.ingredientId, quantity: it.quantity, unit: it.unit }));

    try {
      if (remaining.length === 0) {
        await fetch("/api/nutrition/meal-delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mealId: meal.id })
        });
      } else {
        await fetch("/api/nutrition/meal-edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mealId: meal.id, items: remaining })
        });
      }
      showToast("🗑 נמחק");
      closeEdit();
      await load(date);
    } catch {
      showToast("שגיאה במחיקה");
    } finally {
      setSaving(false);
    }
  }

  const mealsBySlot = new Map<string, NutritionMeal[]>();
  for (const slot of MEAL_SLOTS) mealsBySlot.set(slot, []);
  for (const meal of nutrition?.meals ?? []) {
    const arr = mealsBySlot.get(meal.slot) ?? [];
    arr.push(meal);
    mealsBySlot.set(meal.slot, arr);
  }

  return (
    <div className="nutr-page">

      {/* Toast */}
      {toast && <div className="nutr-toast">{toast}</div>}

      {/* Edit modal */}
      {editTarget && (
        <div className="nutr-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) closeEdit(); }}>
          <div className="nutr-modal">
            <div className="nutr-modal-header">
              <span className="nutr-modal-title">{editTarget.item.name}</span>
              <button className="nutr-modal-close" onClick={closeEdit}>✕</button>
            </div>

            <div className="nutr-modal-body">
              {/* Quantity stepper */}
              <label className="nutr-modal-label">כמות</label>
              <div className="qty-stepper nutr-modal-stepper">
                <button
                  className="qty-stepper-btn"
                  onClick={() => setEditQty((p) => Math.max(stepForUnit(editUnit), Math.round((p - stepForUnit(editUnit)) * 10) / 10))}
                >−</button>
                <input
                  className="qty-stepper-input"
                  type="number"
                  min={stepForUnit(editUnit)}
                  step={stepForUnit(editUnit)}
                  value={editQty}
                  onChange={(e) => setEditQty(Math.max(stepForUnit(editUnit), Number(e.target.value) || stepForUnit(editUnit)))}
                />
                <button
                  className="qty-stepper-btn"
                  onClick={() => setEditQty((p) => Math.round((p + stepForUnit(editUnit)) * 10) / 10)}
                >+</button>
              </div>

              {/* Unit selector */}
              <label className="nutr-modal-label">יחידה</label>
              <div className="nutr-modal-unit-row">
                {UNIT_OPTIONS.map((u) => (
                  <button
                    key={u.value}
                    className={`nutr-modal-unit-btn${editUnit === u.value ? " active" : ""}`}
                    onClick={() => {
                      setEditUnit(u.value);
                      setEditQty(u.value === "g" || u.value === "ml" ? 100 : 1);
                    }}
                  >{u.label}</button>
                ))}
              </div>

              {/* Slot selector */}
              <label className="nutr-modal-label">ארוחה</label>
              <div className="nutr-modal-slot-row">
                {SLOT_OPTIONS.map((s) => (
                  <button
                    key={s.value}
                    className={`nutr-modal-slot-btn${editSlot === s.value ? " active" : ""}`}
                    onClick={() => setEditSlot(s.value)}
                  >
                    {slotIcon(s.value)} {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="nutr-modal-actions">
              <button className="nutr-modal-delete-btn" onClick={deleteItem} disabled={saving}>
                🗑 מחק
              </button>
              <button className="nutr-modal-save-btn" onClick={saveEdit} disabled={saving}>
                {saving ? "שומר…" : "✓ שמור"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="nutr-header">
        <div className="nutr-header-top">
          <div className="nutr-nav">
            <button className="nutr-nav-btn" onClick={() => setDate((d) => addDaysISO(d, -1))}>‹</button>
            <span className="nutr-date">{formatDisplayDate(date)}</span>
            <button className="nutr-nav-btn" onClick={() => setDate((d) => addDaysISO(d, 1))}>›</button>
          </div>
          <div className="nutr-nav-links">
            <Link href="/nutrition/catalog" className="nutr-catalog-link">קטלוג מזונות</Link>
            <Link href="/nutrition/recipes" className="nutr-catalog-link nutr-recipe-link">מתכונים 🍳</Link>
          </div>
        </div>
        <div className="nutr-title-row">
          <span className="nutr-session-label">NUTRITION & HYDRATION</span>
          <h1 className="nutr-title">תזונה ושתייה</h1>
        </div>
      </div>

      {/* Main stats */}
      <div className="nutr-stats-row">

        {/* Kcal ring */}
        <div className="nutr-kcal-card">
          <div className="nutr-ring-wrap">
            <svg width="100" height="100" viewBox="0 0 100 100" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="50" cy="50" r={R} fill="transparent" stroke="var(--surface-container-high)" strokeWidth="8" />
              <circle
                cx="50" cy="50" r={R}
                fill="transparent"
                stroke="#c3ffcd"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={kcalOffset}
              />
            </svg>
            <div className="nutr-ring-center">
              <span className="nutr-ring-pct">{kcalPct}%</span>
            </div>
          </div>
          <div className="nutr-kcal-text">
            <span className="nutr-kcal-number">{Math.round(totals.kcal)}</span>
            <span className="nutr-kcal-label">מתוך {Math.round(target.kcal)} קל׳</span>
          </div>
        </div>

        {/* Macros */}
        <div className="nutr-macros-col">
          <div className="nutr-macro-row">
            <span className="nutr-macro-label">חלבון</span>
            <div className="nutr-macro-bar-wrap">
              <div className="nutr-macro-bar-track">
                <div className="nutr-macro-bar-fill" style={{ width: `${proteinPct}%`, background: "#72dcff" }} />
              </div>
            </div>
            <span className="nutr-macro-val" style={{ color: "#72dcff" }}>{Math.round(totals.proteinG)}g</span>
          </div>
          <div className="nutr-macro-row">
            <span className="nutr-macro-label">פחמימות</span>
            <div className="nutr-macro-bar-wrap">
              <div className="nutr-macro-bar-track">
                <div className="nutr-macro-bar-fill" style={{ width: `${carbsPct}%`, background: "#fdd848" }} />
              </div>
            </div>
            <span className="nutr-macro-val" style={{ color: "#fdd848" }}>{Math.round(totals.carbsG)}g</span>
          </div>
          <div className="nutr-macro-row">
            <span className="nutr-macro-label">שומן</span>
            <div className="nutr-macro-bar-wrap">
              <div className="nutr-macro-bar-track">
                <div className="nutr-macro-bar-fill" style={{ width: `${fatPct}%`, background: "#fd8b00" }} />
              </div>
            </div>
            <span className="nutr-macro-val" style={{ color: "#fd8b00" }}>{Math.round(totals.fatG)}g</span>
          </div>
        </div>
      </div>

      {/* Hydration */}
      <div className="nutr-hydration-card">
        <div className="nutr-hydration-header">
          <div>
            <span className="nutr-section-label">שתייה</span>
            <div className="nutr-hydration-numbers">
              <span className="nutr-hydration-current">{(totalDrinkMl / 1000).toFixed(1)}</span>
              <span className="nutr-hydration-sep">/</span>
              <span className="nutr-hydration-target">{(hydrationTarget / 1000).toFixed(1)} ל׳</span>
            </div>
          </div>
          <button className="nutr-add-water-btn" onClick={addWater} disabled={addingWater}>
            {addingWater ? "..." : "+ הוסף 250 מ״ל"}
          </button>
        </div>
        <div className="nutr-hydration-bar-track">
          <div className="nutr-hydration-bar-fill" style={{ width: `${hydrationPct}%` }} />
        </div>
        <span className="nutr-hydration-pct">{hydrationPct}%</span>
      </div>

      {/* Meal sections */}
      <div className="nutr-meals">
        {MEAL_SLOTS.filter((s) => s !== "drinks").map((slot) => {
          const meals = mealsBySlot.get(slot) ?? [];
          const kcal = meals.reduce((sum, m) => sum + mealKcal(m), 0);
          const hasItems = meals.some((m) => m.items.length > 0);
          // Flat list with meal reference per item
          const flatItems = meals.flatMap((meal) =>
            meal.items.map((item, itemIdx) => ({ meal, item, itemIdx }))
          );
          return (
            <details key={slot} className="nutr-meal-fold" open={hasItems}>
              <summary className="nutr-meal-summary">
                <span className="nutr-meal-icon">{slotIcon(slot)}</span>
                <span className="nutr-meal-name">{slotLabel(slot)}</span>
                <span className="nutr-meal-kcal">{kcal > 0 ? `${Math.round(kcal)} קל׳` : "-"}</span>
                <span className="nutr-fold-chevron">›</span>
              </summary>
              <div className="nutr-meal-body">
                {hasItems ? (
                  flatItems.map(({ meal, item, itemIdx }, i) => (
                    <button
                      key={i}
                      className="nutr-meal-item nutr-meal-item-btn"
                      onClick={() => openEdit(meal, itemIdx, item)}
                    >
                      <span className="nutr-item-name">{item.name}</span>
                      <span className="nutr-item-qty">{item.quantity} {item.unit}</span>
                      <span className="nutr-item-kcal">{Math.round(item.kcal)} קל׳</span>
                      <span className="nutr-item-edit-hint">›</span>
                    </button>
                  ))
                ) : (
                  <p className="nutr-meal-empty">לא הוזן מזון</p>
                )}
              </div>
            </details>
          );
        })}

        {/* Drinks section */}
        {drinkMeals.some((m) => m.items.length > 0) && (
          <details className="nutr-meal-fold nutr-drinks-fold" open>
            <summary className="nutr-meal-summary">
              <span className="nutr-meal-icon">💧</span>
              <span className="nutr-meal-name">שתייה</span>
              <span className="nutr-meal-kcal" style={{ color: "#72dcff" }}>{totalDrinkMl} מ״ל</span>
              <span className="nutr-fold-chevron">›</span>
            </summary>
            <div className="nutr-meal-body">
              {drinkMeals.flatMap((meal) =>
                meal.items.map((item, itemIdx) => ({ meal, item, itemIdx }))
              ).map(({ meal, item, itemIdx }, i) => (
                <button
                  key={i}
                  className="nutr-meal-item nutr-meal-item-btn"
                  onClick={() => openEdit(meal, itemIdx, item)}
                >
                  <span className="nutr-item-name">{item.name}</span>
                  <span className="nutr-item-qty">{item.quantity} {item.unit}</span>
                  <span className="nutr-item-kcal" style={{ color: "#72dcff" }}>
                    {item.unit === "ml" ? `${item.quantity} מ״ל` : `${Math.round(item.kcal)} קל׳`}
                  </span>
                  <span className="nutr-item-edit-hint">›</span>
                </button>
              ))}
            </div>
          </details>
        )}
      </div>

      {/* Back to today */}
      <div className="nutr-footer">
        <Link href="/today" className="nutr-back-link">← חזרה לדף הבית</Link>
      </div>

    </div>
  );
}
