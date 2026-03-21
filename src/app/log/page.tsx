"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatDisplayDate, formatDisplayDateTime, formatLocalISODate } from "@/lib/date";
import { workoutDetailPath } from "@/lib/url";

type CalendarView = "month" | "week";

type WorkoutItem = {
  id: string;
  sport: "run" | "bike" | "swim" | "strength";
  source: "strava" | "healthfit" | "bavel" | "smashrun";
  startAt: string;
  durationSec: number;
  distanceM?: number | null;
  avgHr?: number | null;
  elevationM?: number | null;
  tssLike: number;
  shoeName?: string | null;
};

type CalendarResponse = {
  view: CalendarView;
  anchorDate: string;
  from: string;
  to: string;
  workouts: WorkoutItem[];
};

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, date.getDate());
}

function formatDuration(sec: number) {
  const min = Math.round(sec / 60);
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}` : `${m} דק'`;
}

function sportLabel(sport: WorkoutItem["sport"]) {
  if (sport === "run") return "ריצה";
  if (sport === "bike") return "אופניים";
  if (sport === "strength") return "כוח";
  return "שחייה";
}

function sportColor(sport: WorkoutItem["sport"]) {
  if (sport === "run") return "#72dcff";
  if (sport === "bike") return "#fdd848";
  if (sport === "strength") return "#fd8b00";
  return "#c3ffcd";
}

function sportEmoji(sport: WorkoutItem["sport"]) {
  if (sport === "run") return "🏃";
  if (sport === "bike") return "🚴";
  if (sport === "strength") return "💪";
  return "🏊";
}

export default function LogPage() {
  const [view, setView] = useState<CalendarView>("week");
  const [anchorDate, setAnchorDate] = useState<string>(isoDate(new Date()));
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [sportFilter, setSportFilter] = useState<"all" | "run" | "bike" | "swim" | "strength">("all");

  useEffect(() => {
    void fetch(`/api/workouts?view=${view}&date=${anchorDate}`)
      .then((response) => response.json())
      .then((payload) => setData(payload as CalendarResponse));
  }, [view, anchorDate]);

  const anchor = new Date(anchorDate);
  const title =
    view === "month"
      ? `${String(anchor.getMonth() + 1).padStart(2, "0")}-${String(anchor.getFullYear()).slice(-2)}`
      : data
        ? `${formatDisplayDate(data.from)} – ${formatDisplayDate(data.to)}`
        : `${formatDisplayDate(anchor)}`;

  function goPrevious() {
    const date = new Date(anchorDate);
    setAnchorDate(isoDate(view === "month" ? addMonths(date, -1) : addDays(date, -7)));
  }

  function goNext() {
    const date = new Date(anchorDate);
    setAnchorDate(isoDate(view === "month" ? addMonths(date, 1) : addDays(date, 7)));
  }

  const allWorkouts = useMemo(() => {
    const list = [...(data?.workouts ?? [])];
    return list.sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());
  }, [data]);

  const filteredWorkouts = useMemo(() => {
    if (sportFilter === "all") return allWorkouts;
    return allWorkouts.filter((w) => w.sport === sportFilter);
  }, [allWorkouts, sportFilter]);

  const totalKm = filteredWorkouts.reduce((sum, w) => sum + (w.distanceM ? w.distanceM / 1000 : 0), 0);
  const totalCount = filteredWorkouts.length;

  const filters: { key: "all" | "run" | "bike" | "swim" | "strength"; label: string }[] = [
    { key: "all", label: "הכל" },
    { key: "run", label: "ריצה" },
    { key: "bike", label: "אופניים" },
    { key: "swim", label: "שחייה" },
    { key: "strength", label: "כוח" },
  ];

  return (
    <div className="log-kinetic-page">
      <div className="log-kinetic-hero">
        <h1>יומן אימונים</h1>
        <p>כל האימונים שלך במקום אחד</p>
      </div>

      <div className="log-kinetic-period-nav">
        <button onClick={goPrevious} aria-label="תקופה קודמת">‹</button>
        <span className="log-kinetic-period-title">{title}</span>
        <button onClick={goNext} aria-label="תקופה הבאה">›</button>
        <div className="log-kinetic-view-toggle">
          <button
            className={view === "week" ? "active" : ""}
            onClick={() => setView("week")}
          >
            שבועי
          </button>
          <button
            className={view === "month" ? "active" : ""}
            onClick={() => setView("month")}
          >
            חודשי
          </button>
        </div>
      </div>

      <div className="log-kinetic-filter-bar">
        {filters.map((f) => (
          <button
            key={f.key}
            className={`log-kinetic-chip${sportFilter === f.key ? " active" : ""}`}
            onClick={() => setSportFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="log-kinetic-stats">
        <div className="log-kinetic-stat-card">
          <span className="log-stat-label">מרחק כולל</span>
          <span className="log-stat-value">{totalKm.toFixed(1)} <small>ק"מ</small></span>
        </div>
        <div className="log-kinetic-stat-card">
          <span className="log-stat-label">סה"כ אימונים</span>
          <span className="log-stat-value">{totalCount}</span>
        </div>
      </div>

      <div className="log-kinetic-list">
        {filteredWorkouts.length === 0 ? (
          <div className="log-kinetic-empty">אין אימונים בתקופה זו</div>
        ) : (
          filteredWorkouts.map((workout) => {
            const intensityBars = Math.min(5, Math.ceil(workout.tssLike / 16));
            const km = workout.distanceM ? (workout.distanceM / 1000).toFixed(1) : null;
            const paceMinPerKm =
              workout.distanceM && workout.distanceM > 0
                ? workout.durationSec / 60 / (workout.distanceM / 1000)
                : null;
            const paceStr =
              paceMinPerKm != null
                ? `${Math.floor(paceMinPerKm)}:${String(Math.round((paceMinPerKm % 1) * 60)).padStart(2, "0")}/ק"מ`
                : null;

            return (
              <Link
                key={workout.id}
                href={workoutDetailPath(workout.id)}
                className="log-workout-card-k"
              >
                <div className="log-workout-card-k-header">
                  <div
                    className="log-workout-card-k-icon"
                    style={{ background: sportColor(workout.sport) + "22", borderColor: sportColor(workout.sport) + "55" }}
                  >
                    <span style={{ fontSize: "1.5rem" }}>{sportEmoji(workout.sport)}</span>
                  </div>
                  <div className="log-workout-card-k-info">
                    <strong style={{ color: sportColor(workout.sport) }}>{sportLabel(workout.sport)}</strong>
                    <span>{formatDisplayDateTime(workout.startAt)}</span>
                    <span className="log-card-source">{workout.source}</span>
                  </div>
                  <div className="log-workout-card-k-chevron">›</div>
                </div>
                <div className="log-workout-card-k-metrics">
                  {km ? (
                    <div className="log-workout-metric-k">
                      <span className="log-metric-label">מרחק</span>
                      <span className="log-metric-value">{km} ק"מ</span>
                    </div>
                  ) : (
                    <div className="log-workout-metric-k">
                      <span className="log-metric-label">משך</span>
                      <span className="log-metric-value">{formatDuration(workout.durationSec)}</span>
                    </div>
                  )}
                  {paceStr ? (
                    <div className="log-workout-metric-k">
                      <span className="log-metric-label">קצב</span>
                      <span className="log-metric-value">{paceStr}</span>
                    </div>
                  ) : workout.avgHr ? (
                    <div className="log-workout-metric-k">
                      <span className="log-metric-label">דופק</span>
                      <span className="log-metric-value">{Math.round(workout.avgHr)}</span>
                    </div>
                  ) : null}
                  <div className="log-workout-metric-k">
                    <span className="log-metric-label">עומס</span>
                    <div className="log-intensity-bars">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div
                          key={i}
                          className={`log-intensity-bar${i <= intensityBars ? " filled" : ""}`}
                          style={i <= intensityBars ? { background: sportColor(workout.sport) } : {}}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
