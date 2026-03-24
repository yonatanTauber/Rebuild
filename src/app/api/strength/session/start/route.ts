import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  ensureStrengthTables,
  startStrengthSession,
  strengthEquipmentOptions,
  type StrengthEquipmentType
} from "@/lib/strength-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const equipmentValues = strengthEquipmentOptions.map((item) => item.value) as [StrengthEquipmentType, ...StrengthEquipmentType[]];

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startedAt: z.string().datetime().optional(),
  equipmentTypes: z.array(z.enum(equipmentValues)).min(1)
});

export async function POST(request: NextRequest) {
  await ensureStrengthTables();
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const session = await startStrengthSession(parsed.data);
  return NextResponse.json({ ok: true, session });
}
