import { NextResponse } from "next/server";
import { getAthleteProfile } from "@/lib/db";

export async function GET() {
  return NextResponse.json(getAthleteProfile());
}
