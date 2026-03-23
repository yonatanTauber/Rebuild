import { NextResponse } from "next/server";
import { buildAnalytics } from "@/lib/analytics";
import { z } from "zod";
export const dynamic = "force-dynamic";

const schema = z.object({
  sport: z.enum(["run", "bike", "swim"]).default("run"),
  year: z.number().int().optional(),
  fromYear: z.number().int().optional(),
  toYear: z.number().int().optional(),
  shoeId: z.string().optional(),
  allYears: z.union([z.literal("true"), z.literal("1")]).optional()
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = {
    sport: (url.searchParams.get("sport") ?? "run") as "run" | "bike" | "swim",
    year: url.searchParams.get("year") ? Number(url.searchParams.get("year")) : undefined,
    fromYear: url.searchParams.get("fromYear") ? Number(url.searchParams.get("fromYear")) : undefined,
    toYear: url.searchParams.get("toYear") ? Number(url.searchParams.get("toYear")) : undefined,
    shoeId: url.searchParams.get("shoeId") ?? undefined,
    allYears: url.searchParams.get("allYears") ?? undefined
  };
  const parsed = schema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { sport, year, shoeId, fromYear, toYear, allYears } = parsed.data;
  return NextResponse.json(
    await buildAnalytics({ sport, year, shoeId: shoeId ?? null, fromYear, toYear, allYears: Boolean(allYears) })
  );
}
