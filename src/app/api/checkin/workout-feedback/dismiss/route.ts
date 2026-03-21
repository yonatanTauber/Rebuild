import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dismissWorkoutFeedback } from "@/lib/db";
import { cloudDismissWorkoutFeedback, cloudEnabled } from "@/lib/cloud-db";

export const runtime = "nodejs";

const schema = z.object({
  workoutId: z.string().min(1)
});

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (cloudEnabled()) {
    await cloudDismissWorkoutFeedback(parsed.data.workoutId);
  } else {
    dismissWorkoutFeedback(parsed.data.workoutId);
  }
  return NextResponse.json({ dismissed: true });
}
