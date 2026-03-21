import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  clearDailyCheckinProgress,
  getAthleteProfile,
  getDailyCheckinProgress,
  getRecovery,
  hasRecoveryForDate,
  upsertDailyCheckinProgress,
  upsertDailyRecovery
} from "@/lib/db";
import {
  cloudClearDailyCheckinProgress,
  cloudEnabled,
  cloudGetAthleteProfile,
  cloudGetDailyCheckinProgress,
  cloudGetRecovery,
  cloudHasRecovery,
  cloudUpsertDailyCheckinProgress,
  cloudUpsertRecovery
} from "@/lib/cloud-db";
import { formatISODate } from "@/lib/date";
export const dynamic = "force-dynamic";

export const runtime = "nodejs";

const schema = z.object({
  date: z.string(),
  exertion: z.enum(["very_easy", "easy", "moderate", "hard", "max"]),
  sleep: z.enum(["poor", "ok", "good", "great"]),
  hrv: z.enum(["low", "normal", "high"]),
  restingHr: z.enum(["high", "normal", "low"]),
  mood: z.enum(["low", "ok", "good", "great"]),
  sorenessLevel: z.enum(["none", "light", "medium", "high"]),
  painAreas: z.array(z.string()).default([]),
  sleepHoursActual: z.number().min(0).max(14).nullable().optional(),
  hrvActual: z.number().min(0).max(250).nullable().optional(),
  restingHrActual: z.number().min(20).max(120).nullable().optional()
});

const partialSchema = z.object({
  date: z.string(),
  savePartial: z.literal(true),
  exertion: z.enum(["very_easy", "easy", "moderate", "hard", "max"]).optional(),
  sleep: z.enum(["poor", "ok", "good", "great"]).optional(),
  hrv: z.enum(["low", "normal", "high"]).optional(),
  restingHr: z.enum(["high", "normal", "low"]).optional(),
  mood: z.enum(["low", "ok", "good", "great"]).optional(),
  sorenessLevel: z.enum(["none", "light", "medium", "high"]).optional(),
  painAreas: z.array(z.string()).optional(),
  lastStep: z.number().int().min(0).max(20).optional()
});

export async function POST(request: NextRequest) {
  const body = await request.json();
  const partial = partialSchema.safeParse(body);
  if (partial.success) {
    const payload = partial.data;
    if (cloudEnabled()) {
      await cloudUpsertDailyCheckinProgress({
        date: payload.date,
        exertion: payload.exertion ?? null,
        sleep: payload.sleep ?? null,
        hrv: payload.hrv ?? null,
        restingHr: payload.restingHr ?? null,
        mood: payload.mood ?? null,
        sorenessLevel: payload.sorenessLevel ?? null,
        painAreas: payload.painAreas ?? null,
        lastStep: payload.lastStep ?? null
      });
    } else {
      upsertDailyCheckinProgress({
        date: payload.date,
        exertion: payload.exertion ?? null,
        sleep: payload.sleep ?? null,
        hrv: payload.hrv ?? null,
        restingHr: payload.restingHr ?? null,
        mood: payload.mood ?? null,
        sorenessLevel: payload.sorenessLevel ?? null,
        painAreas: payload.painAreas ?? null,
        lastStep: payload.lastStep ?? null
      });
    }
    return NextResponse.json({ saved: true, partial: true });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const payload = parsed.data;
  const profile = cloudEnabled() ? await cloudGetAthleteProfile() : getAthleteProfile();
  const sleepBase = profile.sleepHoursBaseline ?? 7.1;
  const hrvBase = profile.hrvBaseline ?? 45;
  const restingBase = profile.restingHrBaseline ?? 58;

  const maps = {
    exertion: { very_easy: 2, easy: 4, moderate: 6, hard: 8, max: 10 },
    sleepHours: {
      poor: Math.max(4.5, Number((sleepBase - 1.4).toFixed(1))),
      ok: Math.max(5.5, Number((sleepBase - 0.5).toFixed(1))),
      good: Math.min(10.5, Number((sleepBase + 0.4).toFixed(1))),
      great: Math.min(11.5, Number((sleepBase + 1.1).toFixed(1)))
    },
    sleepQuality: { poor: 1, ok: 3, good: 4, great: 5 },
    hrv: {
      low: Math.max(20, Math.round(hrvBase * 0.82)),
      normal: Math.round(hrvBase),
      high: Math.min(120, Math.round(hrvBase * 1.18))
    },
    restingHr: {
      high: Math.min(95, Math.round(restingBase + 6)),
      normal: Math.round(restingBase),
      low: Math.max(35, Math.round(restingBase - 6))
    },
    mood: { low: 1, ok: 3, good: 4, great: 5 },
    soreness: { none: 1, light: 3, medium: 6, high: 8 }
  } as const;

  if (cloudEnabled()) {
    await cloudUpsertRecovery({
      date: payload.date,
      rpe: maps.exertion[payload.exertion],
      sleepHours: payload.sleepHoursActual ?? maps.sleepHours[payload.sleep],
      sleepQuality: maps.sleepQuality[payload.sleep],
      hrv: payload.hrvActual ?? maps.hrv[payload.hrv],
      restingHr: payload.restingHrActual ?? maps.restingHr[payload.restingHr],
      mood: maps.mood[payload.mood],
      sorenessGlobal: maps.soreness[payload.sorenessLevel],
      sorenessByArea: JSON.stringify(payload.painAreas),
      notes: null
    });
    await cloudClearDailyCheckinProgress(payload.date);
  } else {
    upsertDailyRecovery({
      date: payload.date,
      rpe: maps.exertion[payload.exertion],
      sleepHours: payload.sleepHoursActual ?? maps.sleepHours[payload.sleep],
      sleepQuality: maps.sleepQuality[payload.sleep],
      hrv: payload.hrvActual ?? maps.hrv[payload.hrv],
      restingHr: payload.restingHrActual ?? maps.restingHr[payload.restingHr],
      mood: maps.mood[payload.mood],
      sorenessGlobal: maps.soreness[payload.sorenessLevel],
      sorenessByArea: JSON.stringify(payload.painAreas),
      notes: null
    });
    clearDailyCheckinProgress(payload.date);
  }
  return NextResponse.json({ saved: true });
}

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date") ?? formatISODate();
  if (cloudEnabled()) {
    const exists = await cloudHasRecovery(date);
    const recovery = await cloudGetRecovery(date);
    const progress = exists ? null : await cloudGetDailyCheckinProgress(date);
    return NextResponse.json({ date, exists, recovery, progress });
  }
  const exists = hasRecoveryForDate(date);
  const recovery = getRecovery(date);
  const progress = exists ? null : getDailyCheckinProgress(date);
  return NextResponse.json({
    date,
    exists,
    recovery,
    progress
  });
}
