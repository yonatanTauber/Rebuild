import { NextRequest, NextResponse } from "next/server";
import { getWorkoutsBetween } from "@/lib/db";
import { formatLocalISODate, parseLocalISODate } from "@/lib/date";
import { sql } from "@vercel/postgres";
export const dynamic = "force-dynamic";

export const runtime = "nodejs";

function isoDate(date: Date) {
  return formatLocalISODate(date);
}

function parseAnchor(raw: string | null) {
  if (!raw) return new Date();
  const parsed = parseLocalISODate(raw);
  return Number.isFinite(parsed.getTime()) ? parsed : new Date();
}

function startOfWeek(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfMonth(d: Date) {
  const date = new Date(d.getFullYear(), d.getMonth(), 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(d: Date, days: number) {
  const date = new Date(d);
  date.setDate(date.getDate() + days);
  return date;
}

function addMonths(d: Date, months: number) {
  return new Date(d.getFullYear(), d.getMonth() + months, 1);
}

export async function GET(request: NextRequest) {
  const view = request.nextUrl.searchParams.get("view") === "week" ? "week" : "month";
  const anchor = parseAnchor(request.nextUrl.searchParams.get("date"));

  const rangeStart = view === "week" ? startOfWeek(anchor) : startOfWeek(startOfMonth(anchor));
  const rangeEnd = view === "week" ? addDays(rangeStart, 7) : startOfWeek(addMonths(startOfMonth(anchor), 1));

  const useCloud = process.env.VERCEL === "1" && Boolean(process.env.POSTGRES_URL || process.env.DATABASE_URL);

  let workouts: Array<{
    id: string;
    sport: "run" | "bike" | "swim" | "strength";
    source: "strava" | "healthfit" | "bavel" | "smashrun";
    startAt: string;
    durationSec: number;
    distanceM: number | null;
    avgHr: number | null;
    elevationM: number | null;
    tssLike: number;
    shoeId: string | null;
    shoeName: string | null;
  }> = [];

  if (useCloud) {
    // Read from Vercel Postgres (cloud mode). Note: some fields may be missing until we port more tables.
    const res = await sql<{
      id: string;
      sport: string;
      source: string;
      startAt: string;
      durationSec: number;
      distanceM: number | null;
      avgHr: number | null;
      elevationM: number | null;
      tssLike: number;
      shoeId: string | null;
      shoeName: string | null;
    }>`
      SELECT
        id,
        sport,
        source,
        startat as "startAt",
        durationsec as "durationSec",
        distancem as "distanceM",
        avghr as "avgHr",
        elevationm as "elevationM",
        tsslike as "tssLike",
        shoeid as "shoeId",
        NULL::text as "shoeName"
      FROM workouts
      WHERE startat >= ${rangeStart.toISOString()} AND startat < ${rangeEnd.toISOString()}
      ORDER BY startat DESC
    `;

    workouts = res.rows.map((row) => ({
      id: row.id,
      sport: (row.sport as "run" | "bike" | "swim" | "strength") ?? "run",
      source: (row.source as "strava" | "healthfit" | "bavel" | "smashrun") ?? "strava",
      startAt: row.startAt,
      durationSec: Number(row.durationSec ?? 0),
      distanceM: row.distanceM == null ? null : Number(row.distanceM),
      avgHr: row.avgHr == null ? null : Number(row.avgHr),
      elevationM: row.elevationM == null ? null : Number(row.elevationM),
      tssLike: Number(row.tssLike ?? 0),
      shoeId: row.shoeId ?? null,
      shoeName: row.shoeName ?? null
    }));
  } else {
    workouts = getWorkoutsBetween(rangeStart.toISOString(), rangeEnd.toISOString()).map((w) => ({
      id: w.id,
      sport: w.sport,
      source: w.source,
      startAt: w.startAt,
      durationSec: w.durationSec,
      distanceM: w.distanceM ?? null,
      avgHr: w.avgHr ?? null,
      elevationM: w.elevationM ?? null,
      tssLike: w.tssLike,
      shoeId: w.shoeId ?? null,
      shoeName: w.shoeName ?? null
    }));
  }

  return NextResponse.json({
    view,
    anchorDate: isoDate(anchor),
    from: isoDate(rangeStart),
    to: isoDate(addDays(rangeEnd, -1)),
    workouts
  });
}
