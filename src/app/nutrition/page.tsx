"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { formatISODate, addDaysISO, formatDisplayDate } from "@/lib/date";

type NutritionMealItem = {
  name: string;
  quantity: number;
  unit: string;
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

function slotLabel(slot: string) {
  if (slot === "breakfast") return "ארוחת בוקר";
  if (slot === "lunch") return "ארוחת צהריים";
  if (slot === "dinner") return "ארוחת ערב";
  if (slot === "snack") return "חטיף";
  if (slot === "drinks") return "שתייה";
  return slot;
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

const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack", "drinks"];

export default function NutritionPage() {
  const [date, setDate] = useState(formatISODate());
  const [data, setData] = useState<JournalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [addingWater, setAddingWater] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

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

  // Circular SVG ring for kcal
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
                  meals.flatMap((m) => m.items).map((item, i) => (
                    <div key={i} className="nutr-meal-item">
                      <span className="nutr-item-name">{item.name}</span>
                      <span className="nutr-item-qty">{item.quantity} {item.unit}</span>
                      <span className="nutr-item-kcal">{Math.round(item.kcal)} קל׳</span>
                    </div>
                  ))
                ) : (
                  <p className="nutr-meal-empty">לא הוזן מזון</p>
                )}
              </div>
            </details>
          );
        })}

        {/* Drinks section — shows individual items beyond the hydration bar */}
        {drinkMeals.some((m) => m.items.length > 0) && (
          <details className="nutr-meal-fold nutr-drinks-fold" open>
            <summary className="nutr-meal-summary">
              <span className="nutr-meal-icon">💧</span>
              <span className="nutr-meal-name">שתייה</span>
              <span className="nutr-meal-kcal" style={{ color: "#72dcff" }}>{totalDrinkMl} מ״ל</span>
              <span className="nutr-fold-chevron">›</span>
            </summary>
            <div className="nutr-meal-body">
              {drinkMeals.flatMap((m) => m.items).map((item, i) => (
                <div key={i} className="nutr-meal-item">
                  <span className="nutr-item-name">{item.name}</span>
                  <span className="nutr-item-qty">{item.quantity} {item.unit}</span>
                  <span className="nutr-item-kcal" style={{ color: "#72dcff" }}>
                    {item.unit === "ml" ? `${item.quantity} מ״ל` : `${Math.round(item.kcal)} קל׳`}
                  </span>
                </div>
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
