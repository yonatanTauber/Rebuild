import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listRunningShoes, setDefaultRunningShoe } from "@/lib/db";
import { cloudEnabled } from "@/lib/cloud-db";
import { cloudListRunningShoes, cloudSetDefaultRunningShoe } from "@/lib/cloud-shoes";
export const dynamic = "force-dynamic";

export const runtime = "nodejs";

const schema = z.object({
  shoeId: z.string().min(1)
});

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (cloudEnabled()) {
    await cloudSetDefaultRunningShoe(parsed.data.shoeId);
    return NextResponse.json({ shoes: await cloudListRunningShoes() });
  }
  setDefaultRunningShoe(parsed.data.shoeId);
  return NextResponse.json({ shoes: listRunningShoes() });
}
