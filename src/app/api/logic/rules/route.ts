import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRules, upsertRules } from "@/lib/db";
import { getDbProvider, dbQueryOne, dbQuery } from "@/lib/db-driver";
import { migrateDb } from "@/lib/db-migrate";

const schema = z.object({
  weeklyTimeBudgetHours: z.number().min(2).max(20),
  runPriority: z.number().min(0.5).max(2),
  crossTrainingWeight: z.number().min(0.1).max(1.2),
  hardDaysPerWeek: z.number().min(0).max(4),
  noHardIfLowReadiness: z.number().min(10).max(90),
  minEasyBetweenHard: z.number().min(0).max(3),
  injuryFlags: z.array(z.string())
});

export async function GET() {
  if (getDbProvider() !== "postgres") {
    return NextResponse.json(getRules());
  }

  await migrateDb();
  const row = await dbQueryOne<Record<string, unknown>>("SELECT * FROM logic_rules WHERE id = 1 LIMIT 1");
  if (!row) {
    const now = new Date().toISOString();
    await dbQuery(
      `
      INSERT INTO logic_rules
        (id, weeklyTimeBudgetHours, runPriority, crossTrainingWeight, hardDaysPerWeek, noHardIfLowReadiness, minEasyIfFatigueHigh, minEasyBetweenHard, injuryFlags, updatedAt)
      VALUES
        (1, 7, 1.0, 1.0, 2, 35, 0, 1, '[]', $1)
      `,
      [now]
    );
  }
  const out = await dbQueryOne<Record<string, unknown>>("SELECT * FROM logic_rules WHERE id = 1 LIMIT 1");
  const injury = (() => {
    try {
      return JSON.parse(String((out as any)?.injuryflags ?? (out as any)?.injuryFlags ?? "[]"));
    } catch {
      return [];
    }
  })();
  return NextResponse.json({
    weeklyTimeBudgetHours: Number((out as any)?.weeklytimebudgethours ?? (out as any)?.weeklyTimeBudgetHours ?? 7),
    runPriority: Number((out as any)?.runpriority ?? (out as any)?.runPriority ?? 1),
    crossTrainingWeight: Number((out as any)?.crosstrainingweight ?? (out as any)?.crossTrainingWeight ?? 1),
    hardDaysPerWeek: Number((out as any)?.harddaysperweek ?? (out as any)?.hardDaysPerWeek ?? 2),
    noHardIfLowReadiness: Number((out as any)?.nohardiflowreadiness ?? (out as any)?.noHardIfLowReadiness ?? 35),
    minEasyBetweenHard: Number((out as any)?.mineasybetweenhard ?? (out as any)?.minEasyBetweenHard ?? 1),
    injuryFlags: Array.isArray(injury) ? injury : []
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (getDbProvider() !== "postgres") {
    upsertRules(parsed.data);
    return NextResponse.json({ saved: true, version: Date.now().toString() });
  }

  await migrateDb();
  const now = new Date().toISOString();
  await dbQuery(
    `
    INSERT INTO logic_rules
      (id, weeklyTimeBudgetHours, runPriority, crossTrainingWeight, hardDaysPerWeek, noHardIfLowReadiness, minEasyIfFatigueHigh, minEasyBetweenHard, injuryFlags, updatedAt)
    VALUES
      (1,$1,$2,$3,$4,$5,0,$6,$7,$8)
    ON CONFLICT (id) DO UPDATE SET
      weeklyTimeBudgetHours = EXCLUDED.weeklyTimeBudgetHours,
      runPriority = EXCLUDED.runPriority,
      crossTrainingWeight = EXCLUDED.crossTrainingWeight,
      hardDaysPerWeek = EXCLUDED.hardDaysPerWeek,
      noHardIfLowReadiness = EXCLUDED.noHardIfLowReadiness,
      minEasyBetweenHard = EXCLUDED.minEasyBetweenHard,
      injuryFlags = EXCLUDED.injuryFlags,
      updatedAt = EXCLUDED.updatedAt
    `,
    [
      parsed.data.weeklyTimeBudgetHours,
      parsed.data.runPriority,
      parsed.data.crossTrainingWeight,
      parsed.data.hardDaysPerWeek,
      parsed.data.noHardIfLowReadiness,
      parsed.data.minEasyBetweenHard,
      JSON.stringify(parsed.data.injuryFlags ?? []),
      now
    ]
  );
  return NextResponse.json({ saved: true, version: now });
}
