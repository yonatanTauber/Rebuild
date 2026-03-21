import type { NutritionIngredient, NutritionUnit } from "@/lib/types";

export const nutritionUnitOptions: Array<{ value: NutritionUnit; label: string }> = [
  { value: "g", label: "גרם" },
  { value: "ml", label: "מ״ל" },
  { value: "unit", label: "יח׳" },
  { value: "tbsp", label: "כף" },
  { value: "tsp", label: "כפית" }
];

function lowerName(name: string | null | undefined) {
  return (name ?? "").trim().toLowerCase();
}

function spreadSpoonGramsByName(name: string) {
  if (!name) return null;
  if (name.includes("דבש")) return { tbsp: 21, tsp: 7 };
  if (name.includes("טחינה")) return { tbsp: 13, tsp: 4.3 };
  if (name.includes("קוטג")) return { tbsp: 15, tsp: 5 };
  if (name.includes("חומוס")) return { tbsp: 15, tsp: 5 };
  return null;
}

function genericSpoonGrams(unit: NutritionUnit) {
  if (unit === "tbsp") return 15;
  if (unit === "tsp") return 5;
  return 0;
}

export function normalizeNutritionUnit(unit: string): NutritionUnit {
  if (unit === "ml") return "ml";
  if (unit === "unit") return "unit";
  if (unit === "tbsp") return "tbsp";
  if (unit === "tsp") return "tsp";
  return "g";
}

export function nutritionUnitLabel(unit: NutritionUnit) {
  if (unit === "unit") return "יח׳";
  if (unit === "tbsp") return "כף";
  if (unit === "tsp") return "כפית";
  if (unit === "ml") return "מ״ל";
  return "גרם";
}

export function nutritionQuantityToGrams(
  quantity: number,
  unit: NutritionUnit,
  ingredient: Pick<NutritionIngredient, "name" | "gramsPerUnit">
) {
  const safeQuantity = Number(quantity);
  if (!Number.isFinite(safeQuantity) || safeQuantity <= 0) return 0;

  if (unit === "g") return safeQuantity;
  if (unit === "ml") return safeQuantity;
  if (unit === "unit") return safeQuantity * Math.max(1, Number(ingredient.gramsPerUnit));

  const spoons = spreadSpoonGramsByName(lowerName(ingredient.name));
  if (spoons) {
    return safeQuantity * (unit === "tbsp" ? spoons.tbsp : spoons.tsp);
  }

  return safeQuantity * genericSpoonGrams(unit);
}
