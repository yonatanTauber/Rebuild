import { NextResponse } from "next/server";
import { resetIngestData } from "@/lib/db";
import { runIngest } from "@/lib/ingest";

export async function POST() {
  resetIngestData();
  const result = await runIngest();

  return NextResponse.json({
    reset: true,
    jobId: result.jobId,
    filesQueued: result.filesQueued,
    filesIngested: result.filesIngested,
    filesSkipped: result.filesSkipped,
    errors: result.errors.length
  });
}
