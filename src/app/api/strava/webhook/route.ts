import { NextRequest, NextResponse } from "next/server";
import {
export const dynamic = "force-dynamic";
  deleteWorkoutByStravaActivityId,
  ensureStravaTables,
  getStoredToken,
  getStravaVerifyToken,
  refreshTokenIfNeeded,
  upsertWorkoutFromStravaActivity
} from "@/app/api/strava/_lib";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");
  const verifyToken = request.nextUrl.searchParams.get("hub.verify_token");

  if (mode !== "subscribe" || !challenge) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const expected = getStravaVerifyToken();
  if (!expected || verifyToken !== expected) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  return NextResponse.json({ "hub.challenge": challenge });
}

type StravaWebhookEvent = {
  aspect_type: "create" | "update" | "delete";
  event_time: number;
  object_id: number;
  object_type: "activity" | "athlete";
  owner_id: number;
  subscription_id: number;
  updates?: Record<string, unknown>;
};

export async function POST(request: NextRequest) {
  const event = (await request.json().catch(() => null)) as StravaWebhookEvent | null;
  if (!event || !event.object_type) {
    return NextResponse.json({ ok: true });
  }

  if (event.object_type !== "activity") {
    return NextResponse.json({ ok: true });
  }

  await ensureStravaTables();

  if (event.aspect_type === "delete") {
    await deleteWorkoutByStravaActivityId(event.object_id);
    return NextResponse.json({ ok: true });
  }

  const stored = await getStoredToken();
  if (!stored) {
    // Connected state missing; acknowledge to avoid webhook retries.
    return NextResponse.json({ ok: true });
  }
  const token = await refreshTokenIfNeeded(stored);

  const activityRes = await fetch(`https://www.strava.com/api/v3/activities/${event.object_id}`, {
    headers: { Authorization: `Bearer ${token.access_token}` }
  });
  if (!activityRes.ok) {
    return NextResponse.json({ ok: true });
  }
  const activity = (await activityRes.json()) as Parameters<typeof upsertWorkoutFromStravaActivity>[0];
  await upsertWorkoutFromStravaActivity(activity);
  return NextResponse.json({ ok: true });
}

