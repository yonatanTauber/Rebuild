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

/**
 * Returns grams per spoon for spreadable / soft foods.
 * "כף" here is an Israeli "eating tablespoon" (~30–40 g for soft dairy),
 * not the 15 ml cooking measure.
 */
function spreadSpoonGramsByName(name: string) {
  if (!name) return null;
  // Honey / jam / syrup – dense, pourable
  if (name.includes("דבש") || name.includes("ריבה") || name.includes("סילאן")) return { tbsp: 25, tsp: 8 };
  // Tahini / nut butters – thick paste
  if (name.includes("טחינה") || name.includes("חמאת בוטנים") || name.includes("חמאת שקדים")) return { tbsp: 16, tsp: 5.5 };
  // Cottage cheese / labane / soft white cheese – a heaped serving spoon
  if (name.includes("קוטג") || name.includes("לבנה") || name.includes("גבינה לבנה") || name.includes("ריקוטה")) return { tbsp: 40, tsp: 13 };
  // Cream cheese / soft cheese spreads
  if (name.includes("קרם גבינה") || name.includes("גבינת שמנת") || name.includes("פילדלפיה")) return { tbsp: 30, tsp: 10 };
  // Hummus / other thick dips
  if (name.includes("חומוס") || name.includes("בבגנוש") || name.includes("מוטבל")) return { tbsp: 30, tsp: 10 };
  // Greek yogurt / regular yogurt
  if (name.includes("יוגורט")) return { tbsp: 35, tsp: 12 };
  // Olive oil / oils
  if (name.includes("שמן")) return { tbsp: 13, tsp: 4.3 };
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
