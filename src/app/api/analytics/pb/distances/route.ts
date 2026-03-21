import { NextResponse } from "next/server";
import { getTopEfforts } from "@/lib/db";
import { PB_DISTANCES } from "@/lib/pb-engine";
export const dynamic = "force-dynamic";

export async function GET() {
  const distances = PB_DISTANCES.map((d) => {
    const [best] = getTopEfforts(d.key, 1);
    return {
      key: d.key,
      label: d.label,
      km: d.km,
      best: best
        ? {
            timeSec: Math.round(best.timeSec),
            paceMinPerKm: best.paceMinPerKm,
            workoutId: best.workoutId,
            source: best.source
          }
        : null
    };
  });

  return NextResponse.json({ distances });
}
