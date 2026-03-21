import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { ensureStravaTables } from "@/app/api/strava/_lib";
export const dynamic = "force-dynamic";

export const runtime = "nodejs";

export async function GET() {
  await ensureStravaTables();
  const res = await sql<{ subscription_id: string | null; callback_url: string | null }>`
    SELECT subscription_id, callback_url FROM strava_webhook WHERE id = 1
  `;
  const row = res.rows[0];
  return NextResponse.json({
    subscribed: Boolean(row?.subscription_id),
    subscriptionId: row?.subscription_id ?? null,
    callbackUrl: row?.callback_url ?? null
  });
}

