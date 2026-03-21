import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { setForecastFeedback } from "@/lib/db";
export const dynamic = "force-dynamic";

const schema = z.object({
  date: z.string(),
  effort: z.enum(["light", "as_planned", "hard", "skipped"])
});

export async function POST(request: NextRequest) {
  const payload = await request.json();
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  setForecastFeedback(parsed.data.date, parsed.data.effort);
  return NextResponse.json({ saved: true });
}
