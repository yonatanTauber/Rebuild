"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { nutritionQuantityToGrams } from "@/lib/nutrition-units";

type Ingredient = {
  id: string;
  name: string;
  kcalPer100: number;
  proteinPer100: number;
  carbsPer100: number;
  fatPer100: number;
  defaultUnit: string;
  gramsPerUnit: number;
};

type RecipeLine = {
  ingredientId: string;
  name: string;
  quantity: number;
  unit: "g" | "ml" | "unit" | "tbsp" | "tsp";
  grams: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

type Recipe = {
  id: string;
  name: string;
  servings: number;
  kcalPerServing: number;
  proteinPerServing: number;
  carbsPerServing: number;
  fatPerServing: number;
  gramsPerServing?: number;
  ingredientId: string | null;
  createdAt: string;
};

const UNIT_LABELS: Record<string, string> = {
  g: "גרם", ml: "מ״ל", unit: "יח׳", tbsp: "כף", tsp: "כפית",
};

function r1(n: number) { return Math.round(n * 10) / 10; }
function r0(n: number) { return Math.round(n); }

export default function RecipesPage() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [recipeName, setRecipeName] = useState("");
  const [servings, setServings] = useState(4);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<RecipeLine[]>([]);

  // Search for ingredient to add
  const [searchQ, setSearchQ] = useState("");
  const [addQty, setAddQty] = useState(100);
  const [addUnit, setAddUnit] = useState<RecipeLine["unit"]>("g");
  const [selectedIng, setSelectedIng] = useState<Ingredient | null>(null);

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  const load = useCallback(async () => {
    setLoading(true);
    const [ingRes, recRes] = await Promise.all([
      fetch("/api/nutrition/ingredient").then((r) => r.json()).catch(() => ({ ingredients: [] })),
      fetch("/api/nutrition/recipes").then((r) => r.json()).catch(() => ({ recipes: [] })),
    ]);
    setIngredients(ingRes.ingredients ?? []);
    setRecipes(recRes.recipes ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Filter ingredients for search
  const searchResults = useMemo(() => {
    if (!searchQ.trim()) return [];
    const q = searchQ.trim().toLowerCase();
    return ingredients
      .filter((i) => i.name.toLowerCase().includes(q) && !i.name.startsWith("מתכון:"))
      .slice(0, 8);
  }, [searchQ, ingredients]);

  function selectIngredient(ing: Ingredient) {
    setSelectedIng(ing);
    setSearchQ(ing.name);
    setAddUnit((ing.defaultUnit as RecipeLine["unit"]) || "g");
    setAddQty(ing.defaultUnit === "unit" || ing.defaultUnit === "tbsp" || ing.defaultUnit === "tsp" ? 1 : 100);
  }

  function computeLine(ing: Ingredient, qty: number, unit: RecipeLine["unit"]): RecipeLine {
    const grams = nutritionQuantityToGrams(qty, unit, { name: ing.name, gramsPerUnit: ing.gramsPerUnit });
    const factor = grams / 100;
    return {
      ingredientId: ing.id,
      name: ing.name,
      quantity: qty,
      unit,
      grams: r1(grams),
      kcal: r0(ing.kcalPer100 * factor),
      proteinG: r1(ing.proteinPer100 * factor),
      carbsG: r1(ing.carbsPer100 * factor),
      fatG: r1(ing.fatPer100 * factor),
    };
  }

  function addLine() {
    if (!selectedIng) return;
    const line = computeLine(selectedIng, addQty, addUnit);
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.ingredientId === selectedIng.id && l.unit === addUnit);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = computeLine(selectedIng, prev[idx].quantity + addQty, addUnit);
        return updated;
      }
      return [...prev, line];
    });
    setSearchQ("");
    setSelectedIng(null);
    setAddQty(100);
    setAddUnit("g");
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateLine(idx: number, qty: number) {
    if (!qty || qty <= 0) return;
    const ing = ingredients.find((i) => i.id === lines[idx].ingredientId);
    if (!ing) return;
    setLines((prev) => {
      const updated = [...prev];
      updated[idx] = computeLine(ing, qty, lines[idx].unit);
      return updated;
    });
  }

  // Totals
  const totals = useMemo(() => ({
    kcal: r0(lines.reduce((s, l) => s + l.kcal, 0)),
    protein: r1(lines.reduce((s, l) => s + l.proteinG, 0)),
    carbs: r1(lines.reduce((s, l) => s + l.carbsG, 0)),
    fat: r1(lines.reduce((s, l) => s + l.fatG, 0)),
    grams: r1(lines.reduce((s, l) => s + l.grams, 0)),
  }), [lines]);

  const perServing = useMemo(() => ({
    kcal: r0(totals.kcal / servings),
    protein: r1(totals.protein / servings),
    carbs: r1(totals.carbs / servings),
    fat: r1(totals.fat / servings),
    grams: r1(totals.grams / servings),
  }), [totals, servings]);

  async function saveRecipe() {
    if (!recipeName.trim()) { showToast("נא להזין שם למתכון"); return; }
    if (lines.length === 0) { showToast("נא להוסיף לפחות מרכיב אחד"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/nutrition/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: recipeName.trim(), servings, ingredients: lines, notes }),
      });
      if (!res.ok) { showToast("שגיאה בשמירה"); return; }
      showToast(`✓ המתכון "${recipeName}" נשמר בקטלוג!`);
      setRecipeName(""); setServings(4); setNotes(""); setLines([]);
      await load();
    } finally {
      setSaving(false);
    }
  }

  const stepForUnit = (u: string) => (u === "g" || u === "ml" ? 25 : 0.5);

  return (
    <div className="recipe-page" dir="rtl">
      {toast && <div className="recipe-toast">{toast}</div>}

      {/* Top nav */}
      <div className="recipe-topbar">
        <Link href="/nutrition" className="recipe-back-btn">← תזונה</Link>
        <h1 className="recipe-page-title">מתכונים</h1>
        <Link href="/nutrition/catalog" className="recipe-catalog-btn">קטלוג מזון</Link>
      </div>

      <div className="recipe-layout">
        {/* ── Left panel: builder ── */}
        <section className="recipe-builder">
          <h2 className="recipe-section-title">מתכון חדש</h2>

          <div className="recipe-meta-row">
            <label className="recipe-field">
              <span>שם המתכון</span>
              <input
                className="recipe-input"
                placeholder="חביתה ירקות, פסטה בשמנת…"
                value={recipeName}
                onChange={(e) => setRecipeName(e.target.value)}
              />
            </label>
            <label className="recipe-field recipe-field-narrow">
              <span>מנות</span>
              <div className="qty-stepper">
                <button className="qty-stepper-btn" onClick={() => setServings((p) => Math.max(1, p - 1))}>−</button>
                <input className="qty-stepper-input" type="number" min={1} max={99} value={servings}
                  onChange={(e) => setServings(Math.max(1, parseInt(e.target.value) || 1))} />
                <button className="qty-stepper-btn" onClick={() => setServings((p) => p + 1)}>+</button>
              </div>
            </label>
          </div>

          {/* Ingredient search row */}
          <div className="recipe-add-row">
            <div className="recipe-search-wrap">
              <input
                className="recipe-input"
                placeholder="חפש מרכיב…"
                value={searchQ}
                onChange={(e) => { setSearchQ(e.target.value); setSelectedIng(null); }}
              />
              {searchResults.length > 0 && (
                <ul className="recipe-search-dropdown">
                  {searchResults.map((ing) => (
                    <li key={ing.id} onClick={() => selectIngredient(ing)} className="recipe-search-item">
                      {ing.name}
                      <span className="recipe-search-sub">{ing.kcalPer100} קק״ל/100</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="qty-stepper recipe-qty-small">
              <button className="qty-stepper-btn" onClick={() => setAddQty((p) => Math.max(stepForUnit(addUnit), r1(p - stepForUnit(addUnit))))}>−</button>
              <input className="qty-stepper-input" type="number" min={stepForUnit(addUnit)} step={stepForUnit(addUnit)}
                value={addQty} onChange={(e) => setAddQty(Math.max(stepForUnit(addUnit), Number(e.target.value) || stepForUnit(addUnit)))} />
              <button className="qty-stepper-btn" onClick={() => setAddQty((p) => r1(p + stepForUnit(addUnit)))}>+</button>
            </div>

            <select className="recipe-unit-select"
              value={addUnit}
              onChange={(e) => {
                const u = e.target.value as RecipeLine["unit"];
                setAddUnit(u);
                setAddQty(u === "g" || u === "ml" ? 100 : 1);
              }}>
              {Object.entries(UNIT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>

            <button className="recipe-add-btn" onClick={addLine} disabled={!selectedIng}>
              + הוסף
            </button>
          </div>

          {/* Lines table */}
          {lines.length > 0 && (
            <table className="recipe-lines-table">
              <thead>
                <tr>
                  <th>מרכיב</th>
                  <th>כמות</th>
                  <th>קק״ל</th>
                  <th>חלבון</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => (
                  <tr key={idx}>
                    <td className="recipe-line-name">{line.name}</td>
                    <td>
                      <input
                        type="number"
                        className="recipe-line-qty"
                        value={line.quantity}
                        min={stepForUnit(line.unit)}
                        step={stepForUnit(line.unit)}
                        onChange={(e) => updateLine(idx, Number(e.target.value))}
                      />
                      <span className="recipe-line-unit">{UNIT_LABELS[line.unit]}</span>
                    </td>
                    <td className="recipe-line-kcal">{line.kcal}</td>
                    <td className="recipe-line-macro">{line.proteinG}g</td>
                    <td>
                      <button className="recipe-remove-btn" onClick={() => removeLine(idx)}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Totals */}
          {lines.length > 0 && (
            <div className="recipe-totals">
              <div className="recipe-totals-row">
                <span className="recipe-totals-label">סה״כ מתכון</span>
                <span>{totals.kcal} קק״ל · חלבון {totals.protein}g · פחמ׳ {totals.carbs}g · שומן {totals.fat}g</span>
              </div>
              <div className="recipe-totals-row recipe-totals-serving">
                <span className="recipe-totals-label">מנה אחת (÷{servings})</span>
                <span className="recipe-serving-highlight">{perServing.kcal} קק״ל · חלבון {perServing.protein}g · פחמ׳ {perServing.carbs}g · שומן {perServing.fat}g</span>
              </div>
            </div>
          )}

          <label className="recipe-field" style={{ marginTop: "0.75rem" }}>
            <span>הערות (אופציונלי)</span>
            <textarea className="recipe-input" rows={2} placeholder="הוראות הכנה…"
              value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>

          <button className="recipe-save-btn" onClick={saveRecipe} disabled={saving || !recipeName.trim() || lines.length === 0}>
            {saving ? "שומר…" : "💾 שמור מתכון לקטלוג"}
          </button>
        </section>

        {/* ── Right panel: recipes list ── */}
        <section className="recipe-list-panel">
          <h2 className="recipe-section-title">מתכונים שמורים</h2>
          {loading ? (
            <p className="recipe-empty">טוען…</p>
          ) : recipes.length === 0 ? (
            <p className="recipe-empty">אין מתכונים עדיין. צור את הראשון!</p>
          ) : (
            <ul className="recipe-list">
              {recipes.map((r) => (
                <li key={r.id} className="recipe-card">
                  <div className="recipe-card-header">
                    <strong className="recipe-card-name">{r.name}</strong>
                    <span className="recipe-card-servings">{r.servings} מנות</span>
                  </div>
                  <div className="recipe-card-macros">
                    <span className="recipe-macro-pill kcal">{r.kcalPerServing} קק״ל</span>
                    <span className="recipe-macro-pill protein">חלבון {r.proteinPerServing}g</span>
                    <span className="recipe-macro-pill carbs">פחמ׳ {r.carbsPerServing}g</span>
                    <span className="recipe-macro-pill fat">שומן {r.fatPerServing}g</span>
                  </div>
                  {r.ingredientId && (
                    <p className="recipe-card-note">✓ זמין בקטלוג כ-&quot;מתכון: {r.name}&quot;</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
