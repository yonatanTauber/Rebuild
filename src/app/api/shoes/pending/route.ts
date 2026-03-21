import { NextResponse } from "next/server";
import { getPendingRunShoeAssignments } from "@/lib/db";
import { cloudEnabled } from "@/lib/cloud-db";
import { cloudGetPendingRunShoeAssignments } from "@/lib/cloud-shoes";

export const runtime = "nodejs";

export async function GET() {
  if (cloudEnabled()) {
    return NextResponse.json({ pending: await cloudGetPendingRunShoeAssignments(6) });
  }
  return NextResponse.json({ pending: getPendingRunShoeAssignments(6) });
}
