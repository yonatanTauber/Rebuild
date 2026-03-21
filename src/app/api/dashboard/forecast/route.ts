import { NextRequest, NextResponse } from "next/server";
import { forecast } from "@/lib/engine";
import { formatISODate } from "@/lib/date";
import { getWeeklyPlan } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const daysRaw = request.nextUrl.searchParams.get("days");
  const date = request.nextUrl.searchParams.get("date") ?? formatISODate();
  const days = Number(daysRaw ?? "7");
  const safeDays = Number.isFinite(days) ? Math.max(1, Math.min(days, 14)) : 7;

  return NextResponse.json({
    days: forecast(safeDays, date),
    weeklyPlan: getWeeklyPlan(date)
  });
}
