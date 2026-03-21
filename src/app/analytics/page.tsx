"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Section } from "@/components/cards";
import UiSelect from "@/components/ui-select";
import { formatDisplayDate } from "@/lib/date";
import { workoutDetailPath } from "@/lib/url";
import type { HistoryResult, HistoryWorkout } from "@/lib/history-types";

type Sport = "run" | "swim" | "bike";
type HistorySortField = "date" | "distance" | "pace" | "time" | "tss";

type AnalyticsResponse = {
  sport: Sport;
  selectedShoeId: string | null;
  currentYear: number;
  selectedYear: number;
  availableYears: number[];
  rangeFromYear: number;
  rangeToYear: number;
  rangeSummary: {
    totalCount: number;
    totalKm: number;
    avgPace: number | null;
  };
  summary: {
    selectedYearKm: number;
    currentYearKm: number;
    currentMonthKm: number;
  };
  yearly: Array<{ year: number; km: number; workouts: number }>;
  monthly: Array<{ month: number; km: number; workouts: number; avgPaceMinPerKm: number | null }>;
  runBreakdown: {
    byDistance: Array<{ id: string; label: string; count: number; km: number }>;
    byDuration: Array<{ id: string; label: string; count: number }>;
    byPace: Array<{ id: string; label: string; count: number }>;
  };
  runShoes: Array<{ id: string; name: string; runs: number; km: number }>;
  todayRuns: Array<{
    id: string;
    startAt: string;
    distanceKm: number;
    durationSec: number;
    shoeName: string;
  }>;
  pbs: Array<{
    distanceKey: string;
    distanceLabel: string;
    distanceKm: number;
    bestTimeSec: number | null;
    paceMinPerKm: number | null;
    workoutId: string | null;
    date: string | null;
    source: "whole_workout" | "rolling_segment" | null;
  }>;
};

function monthLabel(month: number) {
  const labels = ["ינו", "פבר", "מרץ", "אפר", "מאי", "יונ", "יול", "אוג", "ספט", "אוק", "נוב", "דצמ"];
  return labels[month - 1] ?? String(month);
}

function formatDuration(sec: number | null) {
  if (sec == null) return "-";
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatPace(paceMinPerKm: number | null) {
  if (paceMinPerKm == null || !Number.isFinite(paceMinPerKm)) return "-";
  const min = Math.floor(paceMinPerKm);
  const sec = Math.round((paceMinPerKm - min) * 60);
  return `${min}:${String(sec).padStart(2, "0")}`;
}

function formatDistanceKm(distanceKm: number | null | undefined) {
  if (distanceKm == null || !Number.isFinite(distanceKm)) return "-";
  const rounded = Math.round(distanceKm * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(2)} ק"מ`;
}

function maxValue(values: number[]) {
  return Math.max(1, ...values);
}

function currentMonthRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return {
    from: `${year}-${month}-01`,
    to: `${year}-${month}-${day}`
  };
}

function historySortValue(workout: HistoryWorkout, field: HistorySortField) {
  switch (field) {
    case "date":
      return Date.parse(workout.startAt) || 0;
    case "distance":
      return workout.distanceDisplayKm ?? (workout.distanceM ?? 0) / 1000;
    case "pace":
      return Number.isFinite(workout.paceMinPerKm ?? NaN) ? (workout.paceMinPerKm as number) : Number.MAX_SAFE_INTEGER;
    case "time":
      return workout.durationSec ?? 0;
    case "tss":
      return workout.tssLike ?? 0;
    default:
      return 0;
  }
}

export default function AnalyticsPage() {
  const monthRange = currentMonthRange();
  const [sport, setSport] = useState<Sport>("run");
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [shoeId, setShoeId] = useState<string>("");
  const [fromYear, setFromYear] = useState<number | undefined>(undefined);
  const [toYear, setToYear] = useState<number | undefined>(undefined);
  const [allYears, setAllYears] = useState(false);
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [historyResult, setHistoryResult] = useState<HistoryResult | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFromDate, setHistoryFromDate] = useState(monthRange.from);
  const [historyToDate, setHistoryToDate] = useState(monthRange.to);
  const [historyFilterDirty, setHistoryFilterDirty] = useState(false);
  const [historyRefreshToken, setHistoryRefreshToken] = useState(0);
  const [historySort, setHistorySort] = useState<{ field: HistorySortField; direction: "asc" | "desc" }>({
    field: "date",
    direction: "desc"
  });

  useEffect(() => {
    void load();
  }, [sport, year, shoeId, fromYear, toYear, allYears]);

  useEffect(() => {
    void loadHistoryTable();
  }, [sport, fromYear, toYear, allYears, historyRefreshToken]);

  useEffect(() => {
    if (!allYears || !data) return;
    const sorted = [...data.availableYears].sort((a, b) => a - b);
    setFromYear(sorted[0]);
    setToYear(sorted[sorted.length - 1]);
  }, [allYears, data]);

  useEffect(() => {
    if (historyFilterDirty) return;
    if (allYears) {
      setHistoryFromDate("");
      setHistoryToDate("");
      return;
    }
    const range = currentMonthRange();
    setHistoryFromDate(range.from);
    setHistoryToDate(range.to);
  }, [allYears, historyFilterDirty, sport]);

  async function load() {
    const params = new URLSearchParams({
      sport,
      year: String(year)
    });
    if (fromYear) params.set("fromYear", String(fromYear));
    if (toYear) params.set("toYear", String(toYear));
    if (allYears) params.set("allYears", "true");
    if (sport === "run" && shoeId) {
      params.set("shoeId", shoeId);
    }
    const res = await fetch(`/api/analytics/overview?${params.toString()}`);
    const json = (await res.json()) as AnalyticsResponse;
    setData(json);
    setYear(json.selectedYear);
  }

  async function loadHistoryTable() {
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("sport", sport);
      if (!allYears) {
        if (historyFromDate) {
          params.set("from", `${historyFromDate}T00:00:00.000Z`);
        } else {
          params.set("from", `${monthRange.from}T00:00:00.000Z`);
        }
        if (historyToDate) {
          params.set("to", `${historyToDate}T23:59:59.999Z`);
        } else {
          params.set("to", `${monthRange.to}T23:59:59.999Z`);
        }
      }
      const res = await fetch(`/api/analytics/history?${params.toString()}`);
      if (!res.ok) throw new Error("history fetch failed");
      const payload = (await res.json()) as HistoryResult;
      setHistoryResult(payload);
    } catch (error) {
      console.error(error);
    } finally {
      setHistoryLoading(false);
    }
  }

  function applyHistoryFilters() {
    setHistoryRefreshToken((prev) => prev + 1);
    setHistoryFilterDirty(true);
  }

  function handleToggleAllYears() {
    setAllYears((prev) => {
      const next = !prev;
      if (!next) {
        const range = currentMonthRange();
        setHistoryFromDate(range.from);
        setHistoryToDate(range.to);
      }
      return next;
    });
    setHistoryFilterDirty(false);
  }

  const yearlyMax = useMemo(() => maxValue((data?.yearly ?? []).map((y) => y.km)), [data]);
  const monthlyMax = useMemo(() => maxValue((data?.monthly ?? []).map((m) => m.km)), [data]);

  const sortedHistoryWorkouts = useMemo(() => {
    const workouts = historyResult?.workouts ?? [];
    const dir = historySort.direction === "asc" ? 1 : -1;
    return [...workouts].sort((a, b) => {
      const valA = historySortValue(a, historySort.field);
      const valB = historySortValue(b, historySort.field);
      if (valA === valB) {
        return Date.parse(b.startAt) - Date.parse(a.startAt);
      }
      return dir * (valA - valB);
    });
  }, [historyResult?.workouts, historySort]);

  const historySortIndicator = (field: HistorySortField) => {
    if (historySort.field !== field) return "";
    return historySort.direction === "asc" ? "▲" : "▼";
  };

  function toggleHistorySort(field: HistorySortField) {
    setHistorySort((prev) =>
      prev.field === field
        ? { field, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { field, direction: "desc" }
    );
  }

  const yearIndex = data ? data.availableYears.indexOf(data.selectedYear) : -1;
  const canPrevYear = data ? yearIndex >= 0 && yearIndex < data.availableYears.length - 1 : false;
  const canNextYear = data ? yearIndex > 0 : false;

  return (
    <>
      <header className="page-header">
        <h1>נתונים והיסטוריה</h1>
        <p>מבט מאקרו ומיקרו על נפח אימונים, מגמות ושיאים אישיים.</p>
      </header>

      <Section title="פילטרים" subtitle="ענף + שנה לניתוח">
        <div className="row">
          {[
            { id: "run", label: "ריצה" },
            { id: "swim", label: "שחייה" },
            { id: "bike", label: "אופניים" }
          ].map((item) => (
            <button
              key={item.id}
              className={sport === item.id ? "choice-btn selected" : "choice-btn"}
              onClick={() => setSport(item.id as Sport)}
            >
              {item.label}
            </button>
          ))}
          <div className="year-nav-inline">
            <button
              className="choice-btn"
              onClick={() => data && canPrevYear && setYear(data.availableYears[yearIndex + 1])}
              disabled={!canPrevYear}
            >
              שנה קודמת
            </button>
            <strong>{data?.selectedYear ?? year}</strong>
            <button
              className="choice-btn"
              onClick={() => data && canNextYear && setYear(data.availableYears[yearIndex - 1])}
              disabled={!canNextYear}
            >
              שנה הבאה
            </button>
          </div>
          <UiSelect
            value={String(data?.selectedYear ?? year)}
            onChange={(nextValue) => setYear(Number(nextValue))}
            options={(data?.availableYears ?? [year]).map((y) => ({ value: String(y), label: String(y) }))}
          />
          {sport === "run" && (
            <UiSelect
              value={shoeId}
              onChange={(nextValue) => setShoeId(nextValue)}
              options={[
                { value: "", label: "כל הנעליים" },
                ...((data?.runShoes ?? []).map((shoe) => ({ value: shoe.id, label: shoe.name })))
              ]}
            />
          )}
        </div>
        <div className="row range-controls">
          <label>
            מ־
            <UiSelect
              value={String(fromYear ?? data?.rangeFromYear ?? year)}
              onChange={(nextValue) => setFromYear(Number(nextValue))}
              disabled={allYears}
              options={(data?.availableYears ?? [year]).map((y) => ({ value: String(y), label: String(y) }))}
            />
          </label>
          <label>
            עד־
            <UiSelect
              value={String(toYear ?? data?.rangeToYear ?? year)}
              onChange={(nextValue) => setToYear(Number(nextValue))}
              disabled={allYears}
              options={(data?.availableYears ?? [year]).map((y) => ({ value: String(y), label: String(y) }))}
            />
          </label>
          <button className={allYears ? "choice-btn selected" : "choice-btn"} onClick={handleToggleAllYears}>
            {allYears ? "כל השנים" : "הצג כל השנים"}
          </button>
        </div>
        <div className="row range-summary">
          <span>טווח ניתוח: {allYears ? "כל השנים" : `${fromYear ?? data?.rangeFromYear ?? year}-${toYear ?? data?.rangeToYear ?? year}`}</span>
          <span>סה"כ ק"מ בטווח: {data?.rangeSummary.totalKm ?? 0}</span>
          <span>קצב ממוצע: {data?.rangeSummary.avgPace ? formatPace(data.rangeSummary.avgPace) : "-"}</span>
        </div>
      </Section>

      <div className="grid-3">
        <article className="score-card yellow">
          <p className="score-label">ק"מ השנה ({data?.currentYear ?? year})</p>
          <strong className="score-value">{data?.summary.currentYearKm ?? 0}</strong>
        </article>
        <article className="score-card red">
          <p className="score-label">ק"מ החודש</p>
          <strong className="score-value">{data?.summary.currentMonthKm ?? 0}</strong>
        </article>
        <article className="score-card black">
          <p className="score-label">ק"מ בשנת ניתוח</p>
          <strong className="score-value">{data?.summary.selectedYearKm ?? 0}</strong>
        </article>
      </div>

      <div className="two-col-panels">
        <Section title="מבט על שנתי" subtitle="סה״כ ק״מ לכל שנה">
          <div className="trend-chart">
            {(data?.yearly ?? []).map((y) => (
              <div key={y.year} className="trend-bar-item" title={`${y.km} ק״מ · ${y.workouts} אימונים`}>
                <div className="trend-bar" style={{ height: `${Math.max(8, (y.km / yearlyMax) * 180)}px` }} />
                <span>{y.year}</span>
                <small>{y.km}</small>
              </div>
            ))}
          </div>
        </Section>

        <Section title={`מיקרו חודשי · ${data?.selectedYear ?? year}`} subtitle="חלוקה לפי חודשים עם זום פנימה לביצועים">
          <div className="trend-chart monthly">
            {(data?.monthly ?? []).map((m) => (
              <div
                key={m.month}
                className="trend-bar-item"
                title={`${m.km} ק״מ · ${m.workouts} אימונים${sport === "run" && m.avgPaceMinPerKm ? ` · קצב ממוצע ${formatPace(m.avgPaceMinPerKm)}` : ""}`}
              >
                <div className="trend-bar" style={{ height: `${Math.max(8, (m.km / monthlyMax) * 180)}px` }} />
                <span>{monthLabel(m.month)}</span>
                <small>{m.km}</small>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {sport === "run" && (
        <Section title="פילוח היסטוריית אימונים" subtitle="בחר טווח ועקוב אחרי כל העמודות בטבלה מסודרת">
          <div className="history-controls">
            <label>
              מ־
              <input
                type="date"
                value={historyFromDate}
                disabled={allYears}
                onChange={(e) => {
                  setHistoryFromDate(e.target.value);
                  setHistoryFilterDirty(true);
                }}
              />
            </label>
            <label>
              עד־
              <input
                type="date"
                value={historyToDate}
                disabled={allYears}
                onChange={(e) => {
                  setHistoryToDate(e.target.value);
                  setHistoryFilterDirty(true);
                }}
              />
            </label>
            <button className={allYears ? "choice-btn selected" : "choice-btn"} onClick={handleToggleAllYears}>
              {allYears ? "כל השנים" : "הצג כל השנים"}
            </button>
            <button className="choice-btn" onClick={applyHistoryFilters}>
              הצג
            </button>
          </div>
          {historyLoading && <p className="note">טוען נתונים...</p>}
          {!historyLoading && historyResult && (
            <>
              <div className="history-summary-row">
                <span>סה"כ אימונים: {historyResult.summary.totalCount}</span>
                <span>סה"כ ק"מ: {historyResult.summary.totalKm}</span>
                <span>קצב ממוצע: {historyResult.summary.avgPace ? formatPace(historyResult.summary.avgPace) : "-"}</span>
                <span>קצב שיא: {formatPace(historyResult.summary.bestPace)}</span>
              </div>
              <div className="history-table">
                <div className="history-row header">
                  <button onClick={() => toggleHistorySort("date")}>תאריך {historySortIndicator("date")}</button>
                  <button onClick={() => toggleHistorySort("distance")}>מרחק {historySortIndicator("distance")}</button>
                  <button onClick={() => toggleHistorySort("pace")}>קצב {historySortIndicator("pace")}</button>
                  <button onClick={() => toggleHistorySort("time")}>זמן {historySortIndicator("time")}</button>
                  <button onClick={() => toggleHistorySort("tss")}>TSS {historySortIndicator("tss")}</button>
                  <span>נעל</span>
                  <span>מקור</span>
                </div>
                {sortedHistoryWorkouts.length > 0 ? (
                  sortedHistoryWorkouts.map((work) => (
                    <Link key={work.id} href={workoutDetailPath(work.id)} className="history-row history-link">
                      <span>{formatDisplayDate(work.startAt)}</span>
                      <span>{formatDistanceKm(work.distanceDisplayKm ?? (work.distanceM != null ? work.distanceM / 1000 : null))}</span>
                      <span>{formatPace(work.paceMinPerKm)}</span>
                      <span>{formatDuration(work.durationSec)}</span>
                      <span>{work.tssLike}</span>
                      <span>{work.shoeName ?? "-"}</span>
                      <span>{work.source}</span>
                    </Link>
                  ))
                ) : (
                  <div className="history-row empty">
                    <span>אין אימונים בטווח שנבחר.</span>
                  </div>
                )}
              </div>
            </>
          )}
          {!historyLoading && !historyResult && <p className="note">בצע פילוח כדי לראות אימונים.</p>}
        </Section>
      )}

      {sport === "run" && (
        <div className="two-col-panels">
          <Section title="מיון לפי נעל" subtitle="כמות ריצות וק״מ לכל נעל">
            <ul className="list">
              {(data?.runShoes ?? []).map((shoe) => (
                <li key={shoe.id} className="metric-row">
                  <span>{shoe.name}</span>
                  <strong>{shoe.runs} ריצות · {shoe.km} ק"מ</strong>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="ריצות היום לפי נעל" subtitle="מעקב יומי על שיוך נעליים">
            <ul className="list">
              {(data?.todayRuns ?? []).map((run) => (
                <li key={run.id} className="metric-row">
                  <span>
                    {formatDisplayDate(run.startAt)} · {run.distanceKm} ק"מ
                  </span>
                  <strong>{run.shoeName}</strong>
                </li>
              ))}
              {(!data?.todayRuns || data.todayRuns.length === 0) && <li>אין ריצות היום.</li>}
            </ul>
          </Section>
        </div>
      )}

      {sport === "run" && data?.pbs && data.pbs.length > 0 && (
        <Section title="שיאים אישיים" subtitle="Top5 לכל מרחק שנבדק">
          <div className="pb-grid">
            {data.pbs.map((pb) => (
              <div key={`${pb.distanceKey}-${pb.date ?? pb.bestTimeSec}`} className="pb-card">
                <div className="pb-distance">
                  <Link href={`/analytics/pb/${pb.distanceKey}`} className="pb-distance-link">
                    {pb.distanceLabel}
                  </Link>
                </div>
                <div className="pb-time">{formatDuration(pb.bestTimeSec)}</div>
                <div className="pb-details">
                  <span>{pb.distanceKm.toFixed(1)} ק"מ</span>
                  <span>{pb.paceMinPerKm ? formatPace(pb.paceMinPerKm) : "-"}</span>
                </div>
                <div className="pb-meta">
                  <span>{pb.date ? formatDisplayDate(pb.date) : "תאריך לא ידוע"}</span>
                  <span className="pb-source">
                    {pb.source === "rolling_segment" ? "חלק מריצה" : pb.source === "whole_workout" ? "ריצה" : "-"}
                  </span>
                </div>
                {pb.workoutId && (
                  <Link href={workoutDetailPath(pb.workoutId)} className="pb-link">
                    לאימון
                  </Link>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {sport === "swim" && (
        <Section title="הערה לשחייה" subtitle="לפי ההגדרה, שחייה מוצגת מהשנה הנוכחית והלאה">
          <p className="note">אם תרצה, אפשר לפתוח בהמשך גם שנים קודמות לשחייה.</p>
        </Section>
      )}
    </>
  );
}
