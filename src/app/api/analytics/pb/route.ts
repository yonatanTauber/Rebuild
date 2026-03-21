import { NextRequest, NextResponse } from "next/server";
import { getTopEfforts } from "@/lib/db";
import { PB_DISTANCES } from "@/lib/pb-engine";

const keys = new Set(PB_DISTANCES.map((d) => d.key));

export async function GET(request: NextRequest) {
  const distance = (request.nextUrl.searchParams.get("distance") ?? "5k") as string;
  const limitRaw = Number(request.nextUrl.searchParams.get("limit") ?? "5");
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(20, Math.round(limitRaw))) : 5;
  const includeSegments = request.nextUrl.searchParams.get("includeSegments") === "1";
  if (!keys.has(distance as any)) {
    return NextResponse.json({ error: "distance not supported" }, { status: 400 });
  }

  return NextResponse.json({
    distance,
    top: getTopEfforts(distance, limit, includeSegments)
  });
}
