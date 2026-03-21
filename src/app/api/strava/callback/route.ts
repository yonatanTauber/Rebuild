import { NextRequest, NextResponse } from "next/server";
import { getStravaEnv, upsertToken } from "@/app/api/strava/_lib";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const env = getStravaEnv();
  if (!env) {
    return NextResponse.json(
      { ok: false, error: "Missing STRAVA_CLIENT_ID/STRAVA_CLIENT_SECRET" },
      { status: 500 }
    );
  }

  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  if (error) {
    return NextResponse.redirect(new URL(`/settings/strava?error=${encodeURIComponent(error)}`, request.nextUrl));
  }
  if (!code) {
    return NextResponse.redirect(new URL("/settings/strava?error=missing_code", request.nextUrl));
  }

  const tokenRes = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.clientId,
      client_secret: env.clientSecret,
      code,
      grant_type: "authorization_code"
    })
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL(`/settings/strava?error=token_${tokenRes.status}`, request.nextUrl));
  }

  const json = (await tokenRes.json()) as {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    athlete?: { id?: number };
    scope?: string;
  };

  await upsertToken({
    athlete_id: json.athlete?.id != null ? String(json.athlete.id) : null,
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: json.expires_at,
    scope: json.scope ?? null
  });

  return NextResponse.redirect(new URL("/settings/strava?connected=1", request.nextUrl));
}

