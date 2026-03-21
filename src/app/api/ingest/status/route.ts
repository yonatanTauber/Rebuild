import { NextResponse } from "next/server";
import { getIngestStatus } from "@/lib/db";
import { getIngestDirectories } from "@/lib/ingest";

export async function GET() {
  const status = getIngestStatus();
  const dirs = getIngestDirectories();
  return NextResponse.json({
    ...status,
    importDir: dirs.importDir,
    smashrunDir: dirs.smashrunDir
  });
}
