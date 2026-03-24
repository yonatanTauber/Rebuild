import { NextResponse } from "next/server";
import {
  ensureStravaTables,
  getStoredToken,
  refreshTokenIfNeeded,
  upsertStravaSyncState,
  getStravaSyncState,
  upsertWorkoutFromStravaActivity
} from "@/app/api/strava/_lib";
import { attachOpenStrengthSessionsForDate } from "@/lib/strength-session";

export const runtime = "nodejs";

import type { StravaActivity } from "@/app/api/strava/_lib";
export const dynamic = "force-dynamic";

function parsePositiveInt(raw: string | null, fallback: number) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") === "backfill" ? "backfill" : "recent";
  const pages = parsePositiveInt(url.searchParams.get("pages"), mode === "backfill" ? 6 : 1);

  await ensureStravaTables();
  const stored = await getStoredToken();
  if (!stored) {
    return NextResponse.json({ ok: false, error: "Strava לא מחובר" }, { status: 400 });
  }
  const token = await refreshTokenIfNeeded(stored);

  const perPage = 50;
  let imported = 0;
  let updated = 0;
  const touchedDates = new Set<string>();

  let startPage = 1;
  let done = false;
  if (mode === "backfill") {
    const state = await getStravaSyncState();
    startPage = Math.max(1, state.nextPage);
    done = Boolean(state.done);
    if (done) {
      return NextResponse.json({ ok: true, mode, imported: 0, updated: 0, done: true, nextPage: startPage });
    }
  }

  let lastPageFetched = startPage;
  for (let offset = 0; offset < pages; offset += 1) {
    const page = startPage + offset;
    lastPageFetched = page;
    const res = await fetch(`https://www.strava.com/api/v3/athlete/activities?per_page=${perPage}&page=${page}`, {
      headers: {
        Authorization: `Bearer ${token.access_token}`
      }
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `Strava fetch failed (${res.status})` }, { status: 500 });
    }

    const activities = (await res.json()) as StravaActivity[];
    if (!Array.isArray(activities) || activities.length === 0) {
      done = true;
      break;
    }

    for (const act of activities) {
      const inserted = await upsertWorkoutFromStravaActivity(act);
      if (inserted) imported += 1;
      else updated += 1;
      const d = new Date(act.start_date).toISOString().slice(0, 10);
      touchedDates.add(d);
    }

    if (activities.length < perPage) {
      done = true;
      break;
    }
  }

  const nextPage = mode === "backfill" ? (done ? lastPageFetched : lastPageFetched + 1) : 1;
  if (mode === "backfill") {
    await upsertStravaSyncState({ nextPage, done });
  }

  for (const date of touchedDates) {
    await attachOpenStrengthSessionsForDate(date);
  }

  return NextResponse.json({ ok: true, mode, imported, updated, done, nextPage });
}
