import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { setForecastOverride } from "@/lib/db";
export const dynamic = "force-dynamic";

const optionSchema = z.object({
  id: z.string(),
  sport: z.enum(["run", "bike", "swim"]),
  workoutType: z.string(),
  durationMin: z.number(),
  intensityZone: z.string(),
  target: z.string(),
  structure: z.string(),
  why: z.string(),
  notes: z.string(),
  plannedLoad: z.number()
});

const schema = z.object({
  date: z.string(),
  optionId: z.string(),
  option: optionSchema
});

export async function POST(request: NextRequest) {
  const payload = await request.json();
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  setForecastOverride(parsed.data.date, parsed.data.optionId, JSON.stringify(parsed.data.option));
  return NextResponse.json({ saved: true });
}
