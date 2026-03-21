import { NextResponse } from "next/server";
import { z } from "zod";
import { createRunningShoeBrand, listRunningShoeBrands } from "@/lib/db";
import { cloudEnabled } from "@/lib/cloud-db";
import { cloudCreateRunningShoeBrand, cloudListRunningShoeBrands } from "@/lib/cloud-shoes";
export const dynamic = "force-dynamic";

export const runtime = "nodejs";

const schema = z.object({
  name: z.string().min(1).max(64)
});

export async function GET() {
  const brands = cloudEnabled() ? await cloudListRunningShoeBrands() : listRunningShoeBrands();
  return NextResponse.json({ brands });
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "שם חברה לא חוקי" }, { status: 400 });
  }
  const brand = cloudEnabled() ? await cloudCreateRunningShoeBrand(parsed.data.name) : createRunningShoeBrand(parsed.data.name);
  if (!brand) {
    return NextResponse.json({ error: "שם חברה לא ניתן לחזור" }, { status: 400 });
  }
  return NextResponse.json({ brand });
}
