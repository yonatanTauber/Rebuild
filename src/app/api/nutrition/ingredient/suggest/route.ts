import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { suggestNutritionIngredientFromText } from "@/lib/nutrition-engine";
export const dynamic = "force-dynamic";

export const runtime = "nodejs";

const schema = z.object({
  text: z.string().min(1).max(160)
});

type IngredientSuggestion = NonNullable<ReturnType<typeof suggestNutritionIngredientFromText>>;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function guessCategory(text: string): IngredientSuggestion["category"] {
  const t = (text || "").toLowerCase();
  if (t.includes("מים") || t.includes("water") || t.includes("קפה") || t.includes("coffee") || t.includes("תה") || t.includes("espresso")) {
    return "hydration";
  }
  if (t.includes("יוגורט") || t.includes("קוטג") || t.includes("גבינה") || t.includes("חלב") || t.includes("סקייר") || t.includes("labaneh") || t.includes("לאבנה")) {
    return "dairy";
  }
  if (t.includes("בננה") || t.includes("תפוח") || t.includes("תמר") || t.includes("אבטיח") || t.includes("melon") || t.includes("banana") || t.includes("apple") || t.includes("date")) {
    return "fruit";
  }
  if (t.includes("שמן") || t.includes("טחינה") || t.includes("avocado") || t.includes("אבוקדו")) {
    return "fat";
  }
  if (t.includes("עוף") || t.includes("חזה") || t.includes("טונה") || t.includes("ביצה") || t.includes("protein")) {
    return "protein";
  }
  if (t.includes("שוקולד") || t.includes("קינדר") || t.includes("מתוק") || t.includes("sweet") || t.includes("cookie")) {
    return "sweet";
  }
  return "mixed";
}

function guessDefaultUnit(text: string): IngredientSuggestion["defaultUnit"] {
  const t = (text || "").toLowerCase();
  if (t.includes("מ״ל") || t.includes("ml") || t.includes("קפה") || t.includes("coffee") || t.includes("מים") || t.includes("juice")) {
    return "ml";
  }
  return "g";
}

async function suggestFromOpenFoodFacts(text: string): Promise<IngredientSuggestion | null> {
  const query = text.trim();
  if (query.length < 2) return null;

  const endpoints = ["https://il.openfoodfacts.org/cgi/search.pl", "https://world.openfoodfacts.org/cgi/search.pl"];
  for (const endpoint of endpoints) {
    const url = new URL(endpoint);
    url.searchParams.set("search_terms", query);
    url.searchParams.set("search_simple", "1");
    url.searchParams.set("action", "process");
    url.searchParams.set("json", "1");
    url.searchParams.set("page_size", "8");
    url.searchParams.set("lc", "he");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    try {
      const res = await fetch(url.toString(), {
        headers: { "User-Agent": "Rebuild/1.0 (nutrition-suggest)" },
        signal: controller.signal
      });
      if (!res.ok) continue;
      const json = (await res.json()) as {
        products?: Array<{
          product_name?: string;
          product_name_he?: string;
          nutriments?: Record<string, unknown>;
        }>;
      };
      const products = Array.isArray(json.products) ? json.products : [];
      for (const p of products) {
        const nutr = (p.nutriments ?? {}) as Record<string, unknown>;
        const kcalRaw = nutr["energy-kcal_100g"] ?? nutr["energy-kcal"] ?? null;
        const proteinRaw = nutr["proteins_100g"] ?? nutr["proteins"] ?? null;
        const carbsRaw = nutr["carbohydrates_100g"] ?? nutr["carbohydrates"] ?? null;
        const fatRaw = nutr["fat_100g"] ?? nutr["fat"] ?? null;

        const kcal = Number(kcalRaw);
        const protein = Number(proteinRaw);
        const carbs = Number(carbsRaw);
        const fat = Number(fatRaw);

        if (![kcal, protein, carbs, fat].every((v) => Number.isFinite(v))) continue;
        if (kcal <= 0 || kcal > 1000) continue;

        const name = String(p.product_name_he || p.product_name || query).trim() || query;
        const defaultUnit = guessDefaultUnit(name);
        return {
          name,
          category: guessCategory(name),
          kcalPer100: clamp(Math.round(kcal), 0, 1000),
          proteinPer100: clamp(Math.round(protein * 10) / 10, 0, 100),
          carbsPer100: clamp(Math.round(carbs * 10) / 10, 0, 100),
          fatPer100: clamp(Math.round(fat * 10) / 10, 0, 100),
          defaultUnit,
          gramsPerUnit: 100,
          matchedBy: "OpenFoodFacts"
        };
      }
    } catch {
      // try next endpoint
    } finally {
      clearTimeout(timeout);
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const localSuggestion = suggestNutritionIngredientFromText(parsed.data.text);
  if (localSuggestion) {
    return NextResponse.json({ ok: true, suggestion: localSuggestion });
  }

  const onlineSuggestion = await suggestFromOpenFoodFacts(parsed.data.text);
  if (!onlineSuggestion) {
    return NextResponse.json({ ok: false, suggestion: null });
  }

  return NextResponse.json({ ok: true, suggestion: onlineSuggestion });
}
