import { NextResponse } from "next/server";
import { listFavoriteIngredientIds, listNutritionFavorites } from "@/lib/nutrition-engine";
import { getDbProvider, dbQuery } from "@/lib/db-driver";
import { migrateDb } from "@/lib/db-migrate";
import { ensureCloudNutritionSeed } from "@/lib/nutrition-cloud";
export const dynamic = "force-dynamic";

export const runtime = "nodejs";

export async function GET() {
  if (getDbProvider() === "postgres") {
    await migrateDb();
    await ensureCloudNutritionSeed();
    const res = await dbQuery<{ ingredientid: string }>(
      "SELECT ingredientId FROM nutrition_ingredient_favorites ORDER BY updatedAt DESC"
    );
    const ingredientFavoriteIds = res.rows.map((row) => String((row as any).ingredientid ?? (row as any).ingredientId));
    return NextResponse.json({
      favorites: listNutritionFavorites(),
      ingredientFavoriteIds
    });
  }
  return NextResponse.json({
    favorites: listNutritionFavorites(),
    ingredientFavoriteIds: listFavoriteIngredientIds()
  });
}
