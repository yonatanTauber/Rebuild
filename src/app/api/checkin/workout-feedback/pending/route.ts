import { NextResponse } from "next/server";
import { getPendingWorkoutFeedback } from "@/lib/db";
import { cloudEnabled, cloudGetPendingWorkoutFeedback } from "@/lib/cloud-db";
export const dynamic = "force-dynamic";

export const runtime = "nodejs";

export async function GET() {
  if (cloudEnabled()) {
    return NextResponse.json({
      pending: await cloudGetPendingWorkoutFeedback(2)
    });
  }
  return NextResponse.json({
    pending: getPendingWorkoutFeedback(2)
  });
}
