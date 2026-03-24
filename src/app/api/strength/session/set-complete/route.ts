import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { completeStrengthSessionSet, ensureStrengthTables } from "@/lib/strength-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  sessionId: z.string().min(1),
  exerciseId: z.string().min(1),
  reps: z.number().min(1).max(200).optional(),
  weightKg: z.number().min(0).max(1000).optional()
});

export async function POST(request: NextRequest) {
  await ensureStrengthTables();
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const session = await completeStrengthSessionSet(parsed.data);
  if (!session) {
    return NextResponse.json({ error: "session_or_exercise_not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, session });
}
