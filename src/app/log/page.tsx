"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { WorkoutBanner, buildWorkoutBannerMetrics } from "@/components/workout-banner";
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

function weekdayLabels() {
  return ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
}

export default function LogPage() {
  const [view, setView] = useState<CalendarView>("week");
  const [anchorDate, setAnchorDate] = useState<string>(isoDate(new Date()));
  const [selectedDate, setSelectedDate] = useState<string>(isoDate(new Date()));
  const [activeWorkoutId, setActiveWorkoutId] = useState<string | null>(null);
  const [data, setData] = useState<CalendarResponse | null>(null);

  useEffect(() => {
    void fetch(`/api/workouts?view=${view}&date=${anchorDate}`)
      .then((response) => response.json())
      .then((payload) => setData(payload as CalendarResponse));
  }, [view, anchorDate]);

  const workoutsByDate = useMemo(() => {
    const map = new Map<string, WorkoutItem[]>();
    for (const workout of data?.workouts ?? []) {
      const key = formatLocalISODate(workout.startAt);
      const list = map.get(key) ?? [];
      list.push(workout);
      map.set(key, list);
    }

    for (const [key, list] of map.entries()) {
      map.set(
        key,
        [...list].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
      );
    }

    return map;
  }, [data]);

  const visibleDays = useMemo(() => {
    if (!data) return [] as Date[];
    const from = new Date(data.from);
    const to = new Date(data.to);

    const days: Date[] = [];
    for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
      days.push(new Date(d));
    }
    return days;
  }, [data]);

  useEffect(() => {
    if (!data) return;
    if (selectedDate >= data.from && selectedDate <= data.to) return;
    setSelectedDate(data.anchorDate ?? isoDate(new Date()));
  }, [data, selectedDate]);

  const selectedWorkouts = workoutsByDate.get(selectedDate) ?? [];

  useEffect(() => {
    if (!selectedWorkouts.length) {
      setActiveWorkoutId(null);
      return;
    }
    if (activeWorkoutId && selectedWorkouts.some((w) => w.id === activeWorkoutId)) return;
    setActiveWorkoutId(selectedWorkouts[0].id);
  }, [activeWorkoutId, selectedWorkouts]);

  const activeWorkout = selectedWorkouts.find((item) => item.id === activeWorkoutId) ?? selectedWorkouts[0] ?? null;

  const anchor = new Date(anchorDate);
  const title =
    view === "month"
      ? `${String(anchor.getMonth() + 1).padStart(2, "0")}-${String(anchor.getFullYear()).slice(-2)}`
      : data
        ? `שבוע ${formatDisplayDate(data.from)} עד ${formatDisplayDate(data.to)}`
        : `שבוע ${formatDisplayDate(anchor)}`;

  function goPrevious() {
    const date = new Date(anchorDate);
    setAnchorDate(isoDate(view === "month" ? addMonths(date, -1) : addDays(date, -7)));
  }

  function goNext() {
    const date = new Date(anchorDate);
    setAnchorDate(isoDate(view === "month" ? addMonths(date, 1) : addDays(date, 7)));
  }

  return (
    <div className="log-page">
      <header className="page-header">
        <h1>יומן אימונים</h1>
        <p>יומן רציף: בוחרים יום ורואים מיד את האימון הפעיל באותו משטח.</p>
      </header>

      <section className="log-surface">
        <div className="log-toolbar">
          <div className="calendar-switch" role="tablist" aria-label="תצוגת יומן">
            <button
              className={view === "month" ? "calendar-tab active" : "calendar-tab"}
              onClick={() => setView("month")}
            >
              חודשי
            </button>
            <button className={view === "week" ? "calendar-tab active" : "calendar-tab"} onClick={() => setView("week")}>
              שבועי
            </button>
          </div>

          <div className="calendar-nav">
            <button onClick={goPrevious}>הקודם</button>
            <strong>{title}</strong>
            <button onClick={goNext}>הבא</button>
          </div>
        </div>

        <div className="log-surface-layout">
          <div className="log-calendar-grid">
            {weekdayLabels().map((label) => (
              <div key={label} className="calendar-weekday">
                {label}
              </div>
            ))}

            {visibleDays.map((day) => {
              const dayKey = isoDate(day);
              const items = workoutsByDate.get(dayKey) ?? [];
              const inCurrentMonth = day.getMonth() === new Date(anchorDate).getMonth();
              const selected = dayKey === selectedDate;

              return (
                <button
                  key={dayKey}
                  type="button"
                  className={[
                    "log-day-cell",
                    inCurrentMonth ? "" : "muted",
                    selected ? "selected" : "",
                    items.length > 0 ? "has-workout" : ""
                  ]
                    .join(" ")
                    .trim()}
                  onClick={() => setSelectedDate(dayKey)}
                >
                  <span className="log-day-date">{formatDisplayDate(day)}</span>
                  <span className="log-day-count">{items.length} אימונים</span>
                  {items.length > 0 ? <i aria-hidden className="log-day-dot" /> : null}
                </button>
              );
            })}
          </div>

          <aside className="log-active-panel">
            <div className="log-active-head">
              <strong>{formatDisplayDate(selectedDate)}</strong>
              <span>{selectedWorkouts.length} אימונים</span>
            </div>

            {selectedWorkouts.length > 1 ? (
              <div className="log-day-workout-tabs" role="tablist" aria-label="אימוני היום">
                {selectedWorkouts.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={item.id === activeWorkout?.id ? "log-day-workout-tab active" : "log-day-workout-tab"}
                    onClick={() => setActiveWorkoutId(item.id)}
                  >
                    {sportLabel(item.sport)} · {formatDuration(item.durationSec)}
                  </button>
                ))}
              </div>
            ) : null}

            {activeWorkout ? (
              <article className="log-active-workout-card">
                <div className="log-active-workout-main">
                  <WorkoutBanner
                    sport={activeWorkout.sport}
                    className="log-active-banner"
                    metrics={buildWorkoutBannerMetrics({
                      sport: activeWorkout.sport,
                      durationSec: activeWorkout.durationSec,
                      distanceKm: activeWorkout.distanceM != null ? activeWorkout.distanceM / 1000 : null,
                      avgHr: activeWorkout.avgHr ?? null,
                      load: activeWorkout.tssLike
                    })}
                    runScore={null}
                  />

                  <div className="log-active-meta">
                    <h3>{sportLabel(activeWorkout.sport)}</h3>
                    <p>{formatDisplayDateTime(activeWorkout.startAt)}</p>
                    <div className="log-active-pills">
                      <span>משך: {formatDuration(activeWorkout.durationSec)}</span>
                      {activeWorkout.distanceM != null ? <span>מרחק: {(activeWorkout.distanceM / 1000).toFixed(1)} ק"מ</span> : null}
                      <span>עומס: {Math.round(activeWorkout.tssLike)}</span>
                      {activeWorkout.avgHr ? <span>דופק: {Math.round(activeWorkout.avgHr)}</span> : null}
                    </div>
                    {activeWorkout.shoeName ? <small>נעל: {activeWorkout.shoeName}</small> : null}
                    <div className="log-active-actions">
                      <Link href={workoutDetailPath(activeWorkout.id)} className="inline-cta-link">
                        פתיחת אימון מלא
                      </Link>
                    </div>
                  </div>
                </div>
              </article>
            ) : (
              <div className="log-empty">לא נמצא אימון ביום הנבחר.</div>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
}
