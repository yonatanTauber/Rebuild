import { dedupeWorkouts } from "@/lib/db";
import { recalculateNutritionFrom } from "@/lib/nutrition-engine";
import { recomputeBestEffortsAll } from "@/lib/pb-engine";

function run() {
  const result = dedupeWorkouts();
  recomputeBestEffortsAll();
  recalculateNutritionFrom(undefined, 8);
  console.log(`dedupe done: removed=${result.removed} merged_groups=${result.mergedGroups}`);
}

run();
