import { NextRequest, NextResponse } from "next/server";
import { addPainArea, listPainAreas } from "@/lib/db";
import { cloudAddPainArea, cloudEnabled, cloudListPainAreas } from "@/lib/cloud-db";
export const dynamic = "force-dynamic";

export const runtime = "nodejs";

const options = {
  exertion: [
    { id: "very_easy", label: "קל מאוד" },
    { id: "easy", label: "קל" },
    { id: "moderate", label: "בינוני" },
    { id: "hard", label: "קשה" },
    { id: "max", label: "מקסימלי" }
  ],
  sleep: [
    { id: "poor", label: "שינה חלשה" },
    { id: "ok", label: "שינה סבירה" },
    { id: "good", label: "שינה טובה" },
    { id: "great", label: "שינה מצוינת" }
  ],
  hrv: [
    { id: "low", label: "נמוך" },
    { id: "normal", label: "תקין" },
    { id: "high", label: "גבוה" }
  ],
  restingHr: [
    { id: "high", label: "גבוה מהרגיל" },
    { id: "normal", label: "רגיל" },
    { id: "low", label: "נמוך מהרגיל" }
  ],
  mood: [
    { id: "low", label: "נמוך" },
    { id: "ok", label: "בסדר" },
    { id: "good", label: "טוב" },
    { id: "great", label: "מצוין" }
  ],
  sorenessLevel: [
    { id: "none", label: "ללא כאב" },
    { id: "light", label: "קל" },
    { id: "medium", label: "בינוני" },
    { id: "high", label: "גבוה" }
  ]
};

export async function GET() {
  if (cloudEnabled()) {
    return NextResponse.json({
      options,
      painAreas: await cloudListPainAreas()
    });
  }
  return NextResponse.json({
    options,
    painAreas: listPainAreas()
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { name?: string };
  if (cloudEnabled()) {
    const created = await cloudAddPainArea(String(body.name ?? ""));
    if (!created) {
      return NextResponse.json({ error: "שם אזור חסר" }, { status: 400 });
    }
    return NextResponse.json({ created, painAreas: await cloudListPainAreas() });
  }
  const created = addPainArea(String(body.name ?? ""));
  if (!created) {
    return NextResponse.json({ error: "שם אזור חסר" }, { status: 400 });
  }

  return NextResponse.json({ created, painAreas: listPainAreas() });
}
