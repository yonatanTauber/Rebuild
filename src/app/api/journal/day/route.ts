import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { formatISODate } from "@/lib/date";
import { buildJournalDayBundle } from "@/lib/journal-day";

export const runtime = "nodejs";

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({
    date: request.nextUrl.searchParams.get("date") ?? formatISODate()
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const date = parsed.data.date ?? formatISODate();
  const bundle = await buildJournalDayBundle(date, { includeCoach: true });
  return NextResponse.json(bundle);
}
