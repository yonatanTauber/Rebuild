import { NextRequest, NextResponse } from "next/server";
import { ensureStrengthTables, getActiveStrengthSession } from "@/lib/strength-session";
import { formatISODate } from "@/lib/date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  await ensureStrengthTables();
  const date = request.nextUrl.searchParams.get("date") || formatISODate();
  const session = await getActiveStrengthSession(date);
  return NextResponse.json({ ok: true, session });
}
