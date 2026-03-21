import { NextRequest, NextResponse } from "next/server";
import { getStravaEnv } from "@/app/api/strava/_lib";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const env = getStravaEnv();
  if (!env) {
    return NextResponse.json(
      { ok: false, error: "Missing STRAVA_CLIENT_ID/STRAVA_CLIENT_SECRET" },
      { status: 500 }
    );
  }

  const redirectUri =
    process.env.STRAVA_REDIRECT_URI?.trim() || `${request.nextUrl.origin}/api/strava/callback`;

  const authUrl = new URL("https://www.strava.com/oauth/authorize");
  authUrl.searchParams.set("client_id", env.clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("approval_prompt", "auto");
  authUrl.searchParams.set("scope", "read,activity:read_all");

  return NextResponse.redirect(authUrl.toString());
}

