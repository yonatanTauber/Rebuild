import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { formatISODate } from "@/lib/date";
import { getWeeklyPlan, setWeeklyPlan, unlockWeeklyPlan } from "@/lib/db";
import { recalculateNutritionFrom } from "@/lib/nutrition-engine";

const schema = z.object({
  profile: z.enum(["free", "balanced", "busy", "vacation"]).optional(),
  unlock: z.boolean().optional(),
  date: z.string().optional()
});

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date") ?? formatISODate();
  return NextResponse.json(getWeeklyPlan(date));
}

export async function POST(request: NextRequest) {
  const payload = await request.json();
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const date = parsed.data.date ?? formatISODate();
  if (parsed.data.unlock) {
    return NextResponse.json({ saved: true, ...unlockWeeklyPlan(date) });
  }

  if (!parsed.data.profile) {
    return NextResponse.json({ error: "missing profile" }, { status: 400 });
  }

  setWeeklyPlan(parsed.data.profile, date);
  recalculateNutritionFrom(undefined, 8);
  return NextResponse.json({ saved: true, ...getWeeklyPlan(date) });
}
