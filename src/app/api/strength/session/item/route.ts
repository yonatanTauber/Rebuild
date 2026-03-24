import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  addStrengthSessionItem,
  ensureStrengthTables,
  strengthEquipmentOptions,
  updateStrengthSessionExercise,
  type StrengthHandMode,
  type StrengthEquipmentType
} from "@/lib/strength-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const equipmentValues = strengthEquipmentOptions.map((item) => item.value) as [StrengthEquipmentType, ...StrengthEquipmentType[]];
const handModeValues = ["one", "two"] as [StrengthHandMode, ...StrengthHandMode[]];

const schema = z.object({
  sessionId: z.string().min(1),
  equipmentType: z.enum(equipmentValues).optional(),
  exerciseId: z.string().min(1).optional(),
  exerciseKey: z.string().min(1).optional(),
  weightKg: z.number().min(0).max(1000).optional(),
  repsMin: z.number().int().min(1).max(200).optional(),
  repsMax: z.number().int().min(1).max(200).optional(),
  targetSets: z.number().int().min(1).max(20).optional(),
  handMode: z.enum(handModeValues).optional(),
  note: z.string().max(1000).nullable().optional(),
  setAsDefault: z.boolean().optional()
});

export async function POST(request: NextRequest) {
  await ensureStrengthTables();
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const payload = parsed.data;

  const session =
    payload.exerciseId != null
      ? await updateStrengthSessionExercise({
          sessionId: payload.sessionId,
          exerciseId: payload.exerciseId,
          exerciseKey: payload.exerciseKey,
          weightKg: payload.weightKg,
          repsMin: payload.repsMin,
          repsMax: payload.repsMax,
          targetSets: payload.targetSets,
          handMode: payload.handMode,
          note: payload.note,
          setAsDefault: payload.setAsDefault
        })
      : await addStrengthSessionItem({
          sessionId: payload.sessionId,
          equipmentType: payload.equipmentType ?? "other",
          exerciseKey: payload.exerciseKey
        });
  if (!session) {
    return NextResponse.json({ error: "session_not_found_or_completed" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, session });
}
