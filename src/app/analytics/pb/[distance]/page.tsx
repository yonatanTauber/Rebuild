"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Section } from "@/components/cards";
import { formatDisplayDate } from "@/lib/date";
import { workoutDetailPath } from "@/lib/url";

type TopEffort = {
  id: string;
  distanceKey: string;
  distanceKm: number;
  timeSec: number;
  paceMinPerKm: number;
  workoutId: string;
  workoutStartAt: string;
  source: "whole_workout" | "rolling_segment";
  segmentStartSec: number | null;
  segmentEndSec: number | null;
};

function formatDuration(sec: number) {
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = Math.round(sec % 60);
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatPace(pace: number) {
  const m = Math.floor(pace);
  const s = Math.round((pace - m) * 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function distanceTitle(key: string) {
  const map: Record<string, string> = {
    "1k": '1 ק"מ',
    "3k": '3 ק"מ',
    "5k": '5 ק"מ',
    "10k": '10 ק"מ',
    "15k": '15 ק"מ',
    half: "חצי מרתון",
    "25k": '25 ק"מ',
    "30k": '30 ק"מ'
  };
  return map[key] ?? key;
}

export default function PbDistancePage() {
  const params = useParams<{ distance: string }>();
  const distance = typeof params?.distance === "string" ? params.distance : "";
  const [top, setTop] = useState<TopEffort[]>([]);
  const [error, setError] = useState<string>("");
  const [includeSegments, setIncludeSegments] = useState(true);

  useEffect(() => {
    if (!distance) return;
    const segmentsParam = includeSegments ? "&includeSegments=1" : "";
    void fetch(`/api/analytics/pb?distance=${distance}&limit=8${segmentsParam}`)
      .then((r) => r.json())
      .then((payload) => {
        if (payload.error) {
          setError(payload.error);
          return;
        }
        setTop(payload.top as TopEffort[]);
      });
  }, [distance, includeSegments]);

  return (
    <>
      <header className="page-header">
        <h1>8 התוצאות הטובות · {distanceTitle(distance)}</h1>
        <p>{includeSegments ? "כולל גם חלקים מתוך ריצות אחרות." : "רק ריצות ייעודיות למרחק הזה."}</p>
      </header>

      <div className="row">
        <button type="button" className="choice-btn" onClick={() => setIncludeSegments((prev) => !prev)}>
          {includeSegments ? "הצג רק ריצות ייעודיות" : "הרחב: כלול גם סגמנטים מריצות ארוכות"}
        </button>
      </div>

      <Section title="תוצאות מובילות" subtitle="כולל סוג מקור וניווט לאימון המקורי">
        <ul className="list">
          {top.map((effort, idx) => (
            <li key={effort.id} className="pb-row">
              <div>
                <strong>#{idx + 1} · {formatDuration(effort.timeSec)}</strong>
                <p>
                  קצב {formatPace(effort.paceMinPerKm)} דק'/ק"מ · מקור: {effort.source === "rolling_segment" ? "חלק מריצה" : "ריצה"}
                </p>
                <p>
                  תאריך: {formatDisplayDate(effort.workoutStartAt.slice(0, 10))}
                  {effort.source === "rolling_segment" && effort.segmentStartSec != null && effort.segmentEndSec != null
                    ? ` · סגמנט: ${formatDuration(effort.segmentStartSec)}-${formatDuration(effort.segmentEndSec)}`
                    : ""}
                </p>
              </div>
              <div className="row">
                <Link href={workoutDetailPath(effort.workoutId)} className="inline-cta-link subtle-link">
                  אימון מקור
                </Link>
              </div>
            </li>
          ))}
          {!!error && <li>{error}</li>}
          {!error && top.length === 0 && <li>אין נתונים זמינים כרגע למרחק הזה.</li>}
        </ul>
      </Section>

      <div className="row">
        <Link href="/analytics" className="inline-cta-link subtle-link">
          חזרה לנתונים והיסטוריה
        </Link>
      </div>
    </>
  );
}
