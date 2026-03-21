"use client";

import React, { memo, useMemo, useState, useTransition } from "react";
import type { TodayData } from "../types";

/**
 * TodayNutrition Component
 *
 * Displays nutrition tracking:
 * - Food quick add
 * - Pantry/ingredients list
 * - Drinks tracker
 * - Macros summary
 *
 * This component is LAZY LOADED on scroll.
 * Uses useTransition for smooth food additions.
 */

interface TodayNutritionProps {
  data: TodayData | null;
}

/**
 * Macro formatter with memoization
 */
function formatMacro(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return Math.round(value).toString();
}

const MacroRow = memo(({ label, protein, carbs, fat, calories }: any) => (
  <div className="macro-row">
    <span className="macro-label">{label}</span>
    <span>{formatMacro(protein)}g</span>
    <span>{formatMacro(carbs)}g</span>
    <span>{formatMacro(fat)}g</span>
    <span>{formatMacro(calories)}kcal</span>
  </div>
));
MacroRow.displayName = "MacroRow";

export const TodayNutrition = memo(function TodayNutrition({ data }: TodayNutritionProps) {
  const [isPending, startTransition] = useTransition();
  const [newFood, setNewFood] = useState("");

  // Memoize nutrition calculations
  const totalMacros = useMemo(() => {
    // This should be replaced with actual calculation from your data
    return {
      protein: 0,
      carbs: 0,
      fat: 0,
      calories: 0
    };
  }, [data]);

  const handleAddFood = () => {
    startTransition(async () => {
      if (newFood.trim()) {
        // Call your API here
        // await addFoodToDay(newFood);
        setNewFood("");
      }
    });
  };

  return (
    <section className="today-nutrition" role="region" aria-label="תזונה">
      <h2>תזונה</h2>

      {/* Quick Add Food */}
      <div className="food-quick-add">
        <div className="food-input-row">
          <input
            type="text"
            placeholder="הוסף מזון..."
            value={newFood}
            onChange={(e) => setNewFood(e.target.value)}
            disabled={isPending}
            className="food-input"
          />
          <button
            onClick={handleAddFood}
            disabled={isPending || !newFood.trim()}
            className="choice-btn"
          >
            {isPending ? "הוספה..." : "הוסף"}
          </button>
        </div>
      </div>

      {/* Macros Summary */}
      <div className="macros-summary panel">
        <h3>סיכום הזנה</h3>

        <table className="macros-table">
          <thead>
            <tr>
              <th>קטגוריה</th>
              <th>חלבון</th>
              <th>פחמימות</th>
              <th>שומן</th>
              <th>קלוריות</th>
            </tr>
          </thead>
          <tbody>
            <MacroRow
              label="צריכה"
              protein={totalMacros.protein}
              carbs={totalMacros.carbs}
              fat={totalMacros.fat}
              calories={totalMacros.calories}
            />
          </tbody>
        </table>
      </div>

      {/* Drinks Tracker */}
      <div className="drinks-tracker panel">
        <h3>משקאות</h3>
        <p>תחליף לטיפול בנוזלים</p>
      </div>
    </section>
  );
});

TodayNutrition.displayName = "TodayNutrition";

// Default export for dynamic() in page.tsx
export default TodayNutrition;
