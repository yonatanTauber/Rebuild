import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createRunningShoe, listRunningShoes, updateRunningShoe } from "@/lib/db";
import { cloudCreateRunningShoe, cloudListRunningShoes, cloudUpdateRunningShoe } from "@/lib/cloud-shoes";
import { cloudEnabled } from "@/lib/cloud-db";
export const dynamic = "force-dynamic";

export const runtime = "nodejs";

const schema = z.object({
  name: z.string().min(1),
  brand: z.string().min(1).max(64),
  startKm: z.number().min(0).max(5000).optional(),
  targetKm: z.number().min(1).max(3000),
  isDefault: z.boolean().optional()
});

const updateSchema = schema.extend({
  id: z.string().min(1),
  startKm: z.number().min(0).max(5000),
  targetKm: z.number().min(1).max(3000)
});

export async function GET() {
  if (cloudEnabled()) {
    return NextResponse.json({ shoes: await cloudListRunningShoes() });
  }
  return NextResponse.json({ shoes: listRunningShoes() });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (cloudEnabled()) {
    await cloudCreateRunningShoe(parsed.data);
    return NextResponse.json({ shoes: await cloudListRunningShoes() });
  }
  createRunningShoe(parsed.data);
  return NextResponse.json({ shoes: listRunningShoes() });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (cloudEnabled()) {
    await cloudUpdateRunningShoe(parsed.data);
    return NextResponse.json({ shoes: await cloudListRunningShoes() });
  }
  updateRunningShoe(parsed.data);
  return NextResponse.json({ shoes: listRunningShoes() });
}
