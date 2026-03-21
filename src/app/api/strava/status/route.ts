import { NextResponse } from "next/server";
import { getStoredToken, getStravaSyncState } from "@/app/api/strava/_lib";

export const runtime = "nodejs";

export async function GET() {
  const token = await getStoredToken();
  if (!token) {
    return NextResponse.json({ connected: false });
  }
  const syncState = await getStravaSyncState();
  return NextResponse.json({
    connected: Boolean(token.access_token),
    athleteId: token.athlete_id ?? null,
    expiresAt: token.expires_at ?? null,
    syncState
  });
}
