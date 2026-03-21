import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
export const dynamic = "force-dynamic";

export const runtime = "nodejs";

export async function GET() {
  const url =
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING;

  if (!url) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Missing Postgres env var. Expected one of: POSTGRES_URL / DATABASE_URL / POSTGRES_PRISMA_URL / POSTGRES_URL_NON_POOLING"
      },
      { status: 500 }
    );
  }

  // This verifies the Neon/Vercel Postgres connection is actually usable.
  const result = await sql<{ ok: number }>`SELECT 1 as ok`;
  return NextResponse.json({
    ok: true,
    provider: "vercel-postgres",
    ping: result.rows[0]?.ok ?? null
  });
}

