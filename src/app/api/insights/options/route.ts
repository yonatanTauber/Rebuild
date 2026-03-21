import { NextResponse } from 'next/server';
import { getInsightOptions } from '@/lib/insights';

export async function GET() {
  return NextResponse.json(getInsightOptions());
}
