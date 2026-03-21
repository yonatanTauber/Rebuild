import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { addDaysISO, formatISODate } from "@/lib/date";
import { getDb } from "@/lib/db";
import { buildJournalDayBundle } from "@/lib/journal-day";

const querySchema = z.object({
  anchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  days: z.coerce.number().int().min(1).max(30).optional(),
  cursor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

function buildDates(startDate: string, count: number) {
  return Array.from({ length: count }, (_, idx) => addDaysISO(startDate, -idx));
}

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({
    anchorDate: request.nextUrl.searchParams.get("anchorDate") ?? formatISODate(),
    days: request.nextUrl.searchParams.get("days") ?? 7,
    cursor: request.nextUrl.searchParams.get("cursor") ?? undefined
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const anchorDate = parsed.data.anchorDate ?? formatISODate();
  const days = parsed.data.days ?? 7;
  const startDate = parsed.data.cursor ?? anchorDate;
  const dates = buildDates(startDate, days);

  const dayBundles = await Promise.all(dates.map((date) => buildJournalDayBundle(date, { includeCoach: false })));
  const items = dayBundles.map((bundle) => ({
    date: bundle.date,
    scores: bundle.scores,
    dayStatus: bundle.dayStatus,
    recovery: bundle.recovery,
    nutrition: {
      totals: bundle.nutrition.totals,
      target: bundle.nutrition.target,
      deltaToTarget: bundle.nutrition.deltaToTarget,
      status: bundle.nutrition.status
    },
    workouts: bundle.workouts,
    energyBattery: bundle.energyBattery,
    dailyScore: bundle.dailyScore
  }));

  let minDate: string | null = null;
  try {
    const db = getDb();
    const minDateRow = db.prepare("SELECT MIN(date) as minDate FROM insight_day_view").get() as { minDate: string | null };
    minDate = minDateRow.minDate;
  } catch {
    // Cloud deployments might not have the local insight view available; it's only used for pagination.
    minDate = null;
  }
  const nextCursor = addDaysISO(dates[dates.length - 1], -1);
  const hasMore = minDate ? nextCursor >= minDate : false;

  return NextResponse.json({
    anchorDate,
    days,
    cursor: startDate,
    nextCursor: hasMore ? nextCursor : null,
    hasMore,
    items
  });
}
