import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureStrengthTables, pauseStrengthSession } from "@/lib/strength-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  sessionId: z.string().min(1)
});

export async function POST(request: NextRequest) {
  await ensureStrengthTables();
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const session = await pauseStrengthSession(parsed.data.sessionId);
  if (!session) {
    return NextResponse.json({ error: "session_not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, session });
}
