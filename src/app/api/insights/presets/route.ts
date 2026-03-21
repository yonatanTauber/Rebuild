import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPresetInsights } from '@/lib/insights';

const schema = z.object({
  range: z.enum(['30d', '12w', '365d', 'all']).default('12w'),
  sport: z.enum(['run', 'bike', 'swim', 'all']).default('run')
});

export async function GET(request: NextRequest) {
  const parsed = schema.safeParse({
    range: request.nextUrl.searchParams.get('range') ?? '12w',
    sport: request.nextUrl.searchParams.get('sport') ?? 'run'
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  return NextResponse.json({ presets: getPresetInsights(parsed.data.range, parsed.data.sport) });
}
