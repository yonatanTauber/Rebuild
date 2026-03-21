import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { ensureStravaTables, getStravaEnv, getStravaVerifyToken } from "@/app/api/strava/_lib";
export const dynamic = "force-dynamic";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  await ensureStravaTables();
  const env = getStravaEnv();
  if (!env) {
    return NextResponse.json(
      { ok: false, error: "Missing STRAVA_CLIENT_ID/STRAVA_CLIENT_SECRET" },
      { status: 500 }
    );
  }

  const verifyToken = getStravaVerifyToken();
  if (!verifyToken) {
    return NextResponse.json({ ok: false, error: "Missing STRAVA_VERIFY_TOKEN" }, { status: 500 });
  }

  const callbackUrl =
    process.env.STRAVA_WEBHOOK_CALLBACK_URL?.trim() || `${request.nextUrl.origin}/api/strava/webhook`;

  // Create subscription. Strava will immediately verify via GET hub.challenge on callbackUrl.
  const body = new URLSearchParams();
  body.set("client_id", env.clientId);
  body.set("client_secret", env.clientSecret);
  body.set("callback_url", callbackUrl);
  body.set("verify_token", verifyToken);

  const res = await fetch("https://www.strava.com/api/v3/push_subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  const text = await res.text();
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: `Strava subscribe failed (${res.status}): ${text}` }, { status: 500 });
  }

  const json = JSON.parse(text) as { id?: number };
  const subscriptionId = json.id != null ? String(json.id) : null;

  await sql`
    INSERT INTO strava_webhook (id, subscription_id, callback_url, created_at, updated_at)
    VALUES (1, ${subscriptionId}, ${callbackUrl}, now(), now())
    ON CONFLICT (id) DO UPDATE
      SET subscription_id = EXCLUDED.subscription_id,
          callback_url = EXCLUDED.callback_url,
          updated_at = now()
  `;

  return NextResponse.json({ ok: true, subscriptionId, callbackUrl });
}

