import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getWorkoutById, getWorkoutFueling, replaceWorkoutFueling } from "@/lib/db";
export const dynamic = "force-dynamic";

const itemSchema = z.object({
  itemName: z.string().min(1).max(80),
  quantity: z.number().positive(),
  unitLabel: z.string().min(1).max(24),
  carbsG: z.number().min(0),
  kcal: z.number().min(0).nullable().optional(),
  caffeineMg: z.number().min(0).nullable().optional(),
  notes: z.string().max(160).nullable().optional()
});

const bodySchema = z.object({
  items: z.array(itemSchema)
});

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workout = getWorkoutById(id);
  if (!workout) {
    return NextResponse.json({ error: "Workout not found" }, { status: 404 });
  }
  return NextResponse.json({ items: getWorkoutFueling(id) });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workout = getWorkoutById(id);
  if (!workout) {
    return NextResponse.json({ error: "Workout not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const items = replaceWorkoutFueling(id, parsed.data.items);
  return NextResponse.json({ ok: true, items });
}
