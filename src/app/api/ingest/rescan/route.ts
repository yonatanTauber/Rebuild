import { NextResponse } from "next/server";
import { runIngest } from "@/lib/ingest";

export async function POST() {
  const result = await runIngest({ onlyMissing: false, recentDays: 31 });
  return NextResponse.json({
    jobId: result.jobId,
    startedAt: result.startedAt,
    filesQueued: result.filesQueued,
    filesSkipped: result.filesSkipped
  });
}
