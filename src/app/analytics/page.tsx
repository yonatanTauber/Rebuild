"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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

// ── BarChart component ──────────────────────────────────────────────────────
function BarChart({
  data,
  maxVal,
  labelKey,
  valueKey,
  highlightKey,
  height = 160
}: {
  data: Array<Record<string, unknown>>;
  maxVal: number;
  labelKey: string;
  valueKey: string;
  highlightKey?: string | number;
  height?: number;
}) {
  const W = 600, H = height, BAR_GAP = 4;
  const n = data.length;
  const barW = n > 0 ? Math.floor((W - BAR_GAP * (n - 1)) / n) : 20;
  return (
    <svg viewBox={`0 0 ${W} ${H + 28}`} className="anl-bar-svg" preserveAspectRatio="xMidYMid meet">
      {data.map((d, i) => {
        const val = Number(d[valueKey]) || 0;
        const bh = maxVal > 0 ? Math.max(4, (val / maxVal) * H) : 4;
        const x = i * (barW + BAR_GAP);
        const isHighlight =
          highlightKey !== undefined &&
          (d[labelKey] === highlightKey || d[labelKey] === String(highlightKey));
        return (
          <g key={i}>
            <rect
              x={x}
              y={H - bh}
              width={barW}
              height={bh}
              rx={4}
              fill="#72dcff"
              opacity={isHighlight ? 1 : 0.45}
            />
            {val > 0 && (
              <text
                x={x + barW / 2}
                y={H - bh - 4}
                textAnchor="middle"
                fontSize="9"
                fill="#72dcff"
                opacity={isHighlight ? 1 : 0.6}
              >
                {val}
              </text>
            )}
            <text x={x + barW / 2} y={H + 16} textAnchor="middle" fontSize="9" fill="#888">
              {String(d[labelKey])}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

const SPORTS = [
  { id: "run" as Sport, label: "ריצה" },
  { id: "swim" as Sport, label: "שחייה" },
  { id: "bike" as Sport, label: "אופניים" }
];

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

  // Computed formatted values for bento cards
  // Use rangeSummary (full selected range) — NOT historyResult (which is just the date-filter table)
  // Correct formula: time = km × pace(min/km) × 60 → seconds
  const totalTimeSec = data?.rangeSummary && data.rangeSummary.avgPace
    ? Math.round(data.rangeSummary.totalKm * data.rangeSummary.avgPace * 60)
    : null;
  const totalTimeFormatted = totalTimeSec != null ? formatDuration(totalTimeSec) : "–";

  const avgDurationSec =
    totalTimeSec != null && (data?.rangeSummary.totalCount ?? 0) > 0
      ? Math.round(totalTimeSec / data!.rangeSummary.totalCount)
      : null;
  const avgDurationFormatted = avgDurationSec != null ? formatDuration(avgDurationSec) : "–";

  // Monthly chart data with string labels
  const monthlyChartData = (data?.monthly ?? []).map((m) => ({
    label: monthLabel(m.month),
    km: m.km
  }));

  // Shoe dropdown for run
  const shoeDropdown =
    sport === "run" ? (
      <select
        className="anl-shoe-select"
        value={shoeId}
        onChange={(e) => setShoeId(e.target.value)}
      >
        <option value="">כל הנעליים</option>
        {(data?.runShoes ?? []).map((shoe) => (
          <option key={shoe.id} value={shoe.id}>
            {shoe.name} ({shoe.km} ק&quot;מ)
          </option>
        ))}
      </select>
    ) : null;

  // Max shoe km for bar ratio
  const maxShoeKm = useMemo(
    () => Math.max(1, ...(data?.runShoes ?? []).map((s) => s.km)),
    [data?.runShoes]
  );

  function prevYear() {
    if (data && canPrevYear) setYear(data.availableYears[yearIndex + 1]);
  }

  function nextYear() {
    if (data && canNextYear) setYear(data.availableYears[yearIndex - 1]);
  }

  return (
    <div className="anl-page" dir="rtl">
      {/* Hero header */}
      <div className="anl-hero">
        <span className="anl-session-label">ANALYTICS &amp; HISTORY</span>
        <h1 className="anl-title">נתונים והיסטוריה</h1>
        <p className="anl-subtitle">מבט מאקרו ומיקרו על נפח אימונים, מגמות ושיאים אישיים.</p>
      </div>

      {/* Controls bar */}
      <div className="anl-controls">
        <div className="anl-sport-chips">
          {SPORTS.map((s) => (
            <button
              key={s.id}
              className={`anl-chip ${sport === s.id ? "active" : ""}`}
              onClick={() => setSport(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="anl-year-nav">
          <button className="anl-chip" onClick={prevYear} disabled={!canPrevYear}>
            ‹ שנה קודמת
          </button>
          <strong className="anl-year-display">{data?.selectedYear ?? year}</strong>
          <button className="anl-chip" onClick={nextYear} disabled={!canNextYear}>
            שנה הבאה ›
          </button>
        </div>
        <button
          className={`anl-chip ${allYears ? "active" : ""}`}
          onClick={handleToggleAllYears}
        >
          {allYears ? "✓ כל השנים" : "הצג כל השנים"}
        </button>
        {shoeDropdown}
      </div>

      {/* Range summary strip */}
      <div className="anl-range-strip">
        <span>טווח: {allYears ? "כל השנים" : `${fromYear ?? year}–${toYear ?? year}`}</span>
        <span>· {data?.rangeSummary.totalKm ?? 0} ק&quot;מ</span>
        <span>· קצב {data?.rangeSummary.avgPace ? formatPace(data.rangeSummary.avgPace) : "-"}</span>
        <span>· {data?.rangeSummary.totalCount ?? 0} אימונים</span>
      </div>

      {/* Bento 4 metrics */}
      <div className="anl-bento">
        <div className="anl-metric">
          <span className="anl-metric-lbl">זמן כולל</span>
          <strong className="anl-metric-val">{totalTimeFormatted}</strong>
        </div>
        <div className="anl-metric">
          <span className="anl-metric-lbl">משך ממוצע</span>
          <strong className="anl-metric-val">{avgDurationFormatted}</strong>
        </div>
        <div className="anl-metric">
          <span className="anl-metric-lbl">קצב ממוצע</span>
          <strong className="anl-metric-val">
            {data?.rangeSummary.avgPace ? formatPace(data.rangeSummary.avgPace) : "–"}
          </strong>
        </div>
        <div className="anl-metric">
          <span className="anl-metric-lbl">מרחק כולל</span>
          <strong className="anl-metric-val anl-metric-cyan">
            {data?.rangeSummary.totalKm ?? 0}
            <small> ק&quot;מ</small>
          </strong>
        </div>
      </div>

      {/* Main 2-col: yearly chart + summary stack */}
      <div className="anl-main-grid">
        <section className="anl-card anl-yearly-card">
          <h2 className="anl-card-title">
            מבט על שנתי <span className="anl-card-sub">ק&quot;מ לפי שנה</span>
          </h2>
          <BarChart
            data={(data?.yearly ?? []).map((y) => ({ year: String(y.year), km: y.km }))}
            maxVal={yearlyMax}
            labelKey="year"
            valueKey="km"
            highlightKey={String(data?.selectedYear ?? year)}
          />
        </section>

        <aside className="anl-summary-stack">
          <div className="anl-summary-card">
            <span>ק&quot;מ השנה ({data?.currentYear ?? year})</span>
            <strong className="anl-cyan">{data?.summary.currentYearKm ?? 0}</strong>
          </div>
          <div className="anl-summary-card">
            <span>ק&quot;מ החודש</span>
            <strong>{data?.summary.currentMonthKm ?? 0}</strong>
          </div>
          <div className="anl-summary-card">
            <span>ק&quot;מ בשנת ניתוח</span>
            <strong>{data?.summary.selectedYearKm ?? 0}</strong>
          </div>
        </aside>
      </div>

      {/* Monthly micro chart */}
      <section className="anl-card">
        <h2 className="anl-card-title">
          מיקרו חודשי <span className="anl-card-sub">{data?.selectedYear ?? year}</span>
        </h2>
        <BarChart
          data={monthlyChartData}
          maxVal={monthlyMax}
          labelKey="label"
          valueKey="km"
          height={140}
        />
      </section>

      {/* History section — run only */}
      {sport === "run" && (
        <section className="anl-card">
          <h2 className="anl-card-title">
            היסטוריית אימונים <span className="anl-card-sub">חיפוש לפי תאריך</span>
          </h2>
          <div className="anl-hist-controls">
            <label className="anl-hist-label">
              מ־
              <input
                type="date"
                className="anl-date-input"
                value={historyFromDate}
                disabled={allYears}
                onChange={(e) => {
                  setHistoryFromDate(e.target.value);
                  setHistoryFilterDirty(true);
                }}
              />
            </label>
            <label className="anl-hist-label">
              עד
              <input
                type="date"
                className="anl-date-input"
                value={historyToDate}
                disabled={allYears}
                onChange={(e) => {
                  setHistoryToDate(e.target.value);
                  setHistoryFilterDirty(true);
                }}
              />
            </label>
            <button
              className={`anl-chip ${allYears ? "active" : ""}`}
              onClick={handleToggleAllYears}
            >
              {allYears ? "✓ כל השנים" : "הצג כל השנים"}
            </button>
            <button className="anl-chip" onClick={applyHistoryFilters}>
              הצג
            </button>
          </div>

          {historyLoading && (
            <p className="anl-loading">טוען נתונים...</p>
          )}

          {!historyLoading && historyResult && (
            <>
              <div className="anl-hist-summary">
                <span className="anl-hist-pill">אימונים {historyResult.summary.totalCount}</span>
                <span className="anl-hist-pill">ק&quot;מ {historyResult.summary.totalKm}</span>
                <span className="anl-hist-pill">
                  קצב ממוצע {historyResult.summary.avgPace ? formatPace(historyResult.summary.avgPace) : "-"}
                </span>
                <span className="anl-hist-pill">
                  קצב שיא {formatPace(historyResult.summary.bestPace)}
                </span>
              </div>

              <div className="anl-hist-table-wrap">
                <table className="anl-hist-table">
                  <thead>
                    <tr>
                      <th>
                        <button onClick={() => toggleHistorySort("date")}>
                          תאריך {historySortIndicator("date")}
                        </button>
                      </th>
                      <th>
                        <button onClick={() => toggleHistorySort("distance")}>
                          מרחק {historySortIndicator("distance")}
                        </button>
                      </th>
                      <th>
                        <button onClick={() => toggleHistorySort("pace")}>
                          קצב {historySortIndicator("pace")}
                        </button>
                      </th>
                      <th>
                        <button onClick={() => toggleHistorySort("time")}>
                          זמן {historySortIndicator("time")}
                        </button>
                      </th>
                      <th>
                        <button onClick={() => toggleHistorySort("tss")}>
                          TSS {historySortIndicator("tss")}
                        </button>
                      </th>
                      <th>נעל</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedHistoryWorkouts.length > 0 ? (
                      sortedHistoryWorkouts.map((work) => (
                        <tr key={work.id}>
                          <td>
                            <Link href={workoutDetailPath(work.id)} className="anl-hist-link">
                              {formatDisplayDate(work.startAt)}
                            </Link>
                          </td>
                          <td>{formatDistanceKm(work.distanceDisplayKm ?? (work.distanceM != null ? work.distanceM / 1000 : null))}</td>
                          <td>{formatPace(work.paceMinPerKm)}</td>
                          <td>{formatDuration(work.durationSec)}</td>
                          <td>{work.tssLike ?? "–"}</td>
                          <td>{work.shoeName ?? "–"}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="anl-hist-empty">
                          אין אימונים בטווח שנבחר.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {!historyLoading && !historyResult && (
            <p className="anl-loading">בחר טווח תאריכים ולחץ הצג.</p>
          )}
        </section>
      )}

      {/* Personal Bests — run only */}
      {sport === "run" && data?.pbs && data.pbs.length > 0 && (
        <section className="anl-card">
          <h2 className="anl-card-title">
            שיאים אישיים <span className="anl-card-sub">Top לכל מרחק</span>
          </h2>
          <div className="anl-pb-grid">
            {data.pbs.map((pb) => (
              <div
                key={`${pb.distanceKey}-${pb.date ?? pb.bestTimeSec}`}
                className="anl-pb-card"
              >
                <span className="anl-pb-dist">
                  <Link href={`/analytics/pb/${pb.distanceKey}`} className="anl-pb-dist-link">
                    {pb.distanceLabel}
                  </Link>
                </span>
                <span className="anl-pb-time">{formatDuration(pb.bestTimeSec)}</span>
                <span className="anl-pb-pace">
                  {pb.paceMinPerKm ? `${formatPace(pb.paceMinPerKm)} דק/ק"מ` : "–"}
                </span>
                <span className="anl-pb-date">
                  {pb.date ? formatDisplayDate(pb.date) : "תאריך לא ידוע"}
                </span>
                {pb.workoutId && (
                  <Link href={workoutDetailPath(pb.workoutId)} className="anl-pb-link">
                    לאימון ←
                  </Link>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Shoes — run only */}
      {sport === "run" && data?.runShoes && data.runShoes.length > 0 && (
        <section className="anl-card">
          <h2 className="anl-card-title">
            נעליים <span className="anl-card-sub">ק&quot;מ לפי נעל</span>
          </h2>
          <ul className="anl-shoe-list">
            {data.runShoes.map((shoe) => (
              <li key={shoe.id} className="anl-shoe-item">
                <div className="anl-shoe-row">
                  <span>{shoe.name}</span>
                  <span>
                    {shoe.runs} ריצות · {shoe.km} ק&quot;מ
                  </span>
                </div>
                <div className="anl-shoe-bar-track">
                  <div
                    className="anl-shoe-bar-fill"
                    style={{ width: `${Math.round((shoe.km / maxShoeKm) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
