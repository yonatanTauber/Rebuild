import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { runInsightQuery } from '@/lib/insights';

const schema = z.object({
  entity: z.enum(['day', 'workout']),
  aggregate: z.enum(['count', 'sum', 'avg', 'min', 'max', 'rate']),
  metric: z.enum([
    'workoutCount',
    'totalLoad',
    'runKm',
    'runMinutes',
    'readiness',
    'fatigue',
    'fitness',
    'sleepHours',
    'sleepQuality',
    'hrv',
    'restingHr',
    'mood',
    'sorenessGlobal',
    'actualKcal',
    'actualProteinG',
    'actualCarbsG',
    'actualFatG',
    'fuelingCarbsG',
    'fuelingEntries',
    'distanceKm',
    'durationMin',
    'paceMinPerKm',
    'avgHr',
    'maxHr',
    'elevationM',
    'tssLike',
    'trimp',
    'hasPain',
    'hasPreRunMeal',
    'hasFueling',
    'hasBestEffort'
  ]),
  groupBy: z.enum(['none', 'month', 'week', 'weekday', 'sport', 'shoe', 'pain_area', 'meal_slot', 'fueling_item']),
  range: z.enum(['30d', '12w', '365d', 'all']).default('12w'),
  sport: z.enum(['run', 'bike', 'swim', 'all']).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  filters: z
    .object({
      sport: z.enum(['run', 'bike', 'swim', 'all']).optional(),
      minDistanceKm: z.number().optional(),
      maxDistanceKm: z.number().optional(),
      minDurationMin: z.number().optional(),
      maxDurationMin: z.number().optional(),
      minLoad: z.number().optional(),
      maxLoad: z.number().optional(),
      minReadiness: z.number().optional(),
      maxReadiness: z.number().optional(),
      minFatigue: z.number().optional(),
      maxFatigue: z.number().optional(),
      minFitness: z.number().optional(),
      maxFitness: z.number().optional(),
      minAvgHr: z.number().optional(),
      maxAvgHr: z.number().optional(),
      minPace: z.number().optional(),
      maxPace: z.number().optional(),
      hasPain: z.boolean().optional(),
      painArea: z.string().optional(),
      timeOfDay: z.enum(['morning', 'midday', 'evening', 'night']).optional(),
      shoeId: z.string().optional(),
      mealSlot: z.enum(['breakfast', 'pre_run', 'lunch', 'dinner', 'snack']).optional(),
      hasPreRunMeal: z.boolean().optional(),
      hasFueling: z.boolean().optional()
    })
    .optional()
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  return NextResponse.json(runInsightQuery(parsed.data));
}
