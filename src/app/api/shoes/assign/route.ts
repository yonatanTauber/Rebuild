import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assignShoeToWorkout } from "@/lib/db";
import { cloudEnabled } from "@/lib/cloud-db";
import { cloudAssignShoeToWorkout } from "@/lib/cloud-shoes";
export const dynamic = "force-dynamic";

export const runtime = "nodejs";

const schema = z.object({
  workoutId: z.string().min(1),
  shoeId: z.string().min(1).nullable().optional()
});

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const shoeKmAtAssign = cloudEnabled()
    ? await cloudAssignShoeToWorkout(parsed.data.workoutId, parsed.data.shoeId ?? null)
    : assignShoeToWorkout(parsed.data.workoutId, parsed.data.shoeId ?? null);
  return NextResponse.json({ saved: true, shoeKmAtAssign });
}
