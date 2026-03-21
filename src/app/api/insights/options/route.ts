import { NextResponse } from 'next/server';
import { getInsightOptions } from '@/lib/insights';
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getInsightOptions());
}
