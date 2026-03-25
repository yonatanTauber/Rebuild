"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDisplayDate } from "@/lib/date";
import { workoutDetailPath } from "@/lib/url";
import type { HistoryResult, HistoryWorkout } from "@/lib/history-types";

type Sport = "run" | "swim" | "bike";
type HistorySortField = "date" | "distance" | "pace" | "time" | "tss";
type Direction = "asc" | "desc";
type DateRange = { from: string; to: string };
type DrilldownRange = DateRange & { label: string };

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
  daily: Array<{ day: number; km: number; workouts: number }>;
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

const MONTH_LABELS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function monthLabel(month: number) {
  return MONTH_LABELS[month - 1] ?? String(month);
}

function buildMonthRange(year: number, fromMonth: number, toMonth: number): DateRange {
  const startMonth = Math.min(fromMonth, toMonth);
  const endMonth = Math.max(fromMonth, toMonth);
  const start = `${year}-${String(startMonth).padStart(2, "0")}-01`;
  const endDay = new Date(year, endMonth, 0).getDate();
  return {
    from: start,
    to: `${year}-${String(endMonth).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`
  };
}

function buildYearRange(fromYear: number, toYear: number): DateRange {
  const startYear = Math.min(fromYear, toYear);
  const endYear = Math.max(fromYear, toYear);
  return {
    from: `${startYear}-01-01`,
    to: `${endYear}-12-31`
  };
}

function rangeLabelFallback(allYears: boolean, fromYear: number, toYear: number) {
  if (allYears) return "כל השנים";
  return fromYear === toYear ? String(fromYear) : `${fromYear}–${toYear}`;
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

function computeHistorySummary(workouts: HistoryWorkout[]) {
  const totalKm = workouts.reduce(
    (sum, workout) => sum + (workout.distanceDisplayKm ?? (workout.distanceM ? workout.distanceM / 1000 : 0)),
    0
  );
  const paceDurationSec = workouts.reduce(
    (sum, workout) =>
      sum +
      (workout.durationForPaceSec ??
        workout.movingDurationSec ??
        workout.durationSec),
    0
  );
  const bestPace = workouts.reduce<number | null>((best, workout) => {
    const pace = workout.paceMinPerKm;
    if (pace == null || !Number.isFinite(pace)) return best;
    return best == null ? pace : Math.min(best, pace);
  }, null);

  return {
    totalCount: workouts.length,
    totalKm: Math.round(totalKm * 10) / 10,
    avgPace: workouts.length && totalKm > 0 ? Math.round((paceDurationSec / 60 / totalKm) * 10) / 10 : null,
    bestPace: bestPace != null ? Math.round(bestPace * 100) / 100 : null
  };
}

// ── BarChart component ──────────────────────────────────────────────────────
function BarChart({
  data,
  maxVal,
  labelKey,
  valueKey,
  highlightKey,
  height = 160,
  compact = false,
  onBarClick
}: {
  data: Array<Record<string, unknown>>;
  maxVal: number;
  labelKey: string;
  valueKey: string;
  highlightKey?: string | number;
  height?: number;
  compact?: boolean;
  onBarClick?: (index: number, datum: Record<string, unknown>) => void;
}) {
  const W = 600, H = height, BAR_GAP = 4;
  const TOP_PAD = 18; // space above bars for labels
  const n = data.length;
  const barW = n > 0 ? Math.floor((W - BAR_GAP * (n - 1)) / n) : 20;
  const valueFontSize = compact ? 7 : 9;
  const labelFontSize = compact ? 8 : 9;
  return (
    <svg
      viewBox={`0 0 ${W} ${H + TOP_PAD + 20}`}
      className="anl-bar-svg"
      preserveAspectRatio="xMidYMid meet"
    >
      {data.map((d, i) => {
        const val = Number(d[valueKey]) || 0;
        const bh = maxVal > 0 ? Math.max(4, (val / maxVal) * H) : 4;
        const x = i * (barW + BAR_GAP);
        const barY = TOP_PAD + H - bh;
        const isHighlight =
          highlightKey !== undefined &&
          (d[labelKey] === highlightKey || d[labelKey] === String(highlightKey));
        const labelY = Math.max(TOP_PAD - 2, barY - 4);
        return (
          <g
            key={i}
            style={{ cursor: onBarClick ? "pointer" : "default" }}
            onClick={() => onBarClick?.(i, d)}
          >
            <rect
              x={x}
              y={barY}
              width={barW}
              height={bh}
              rx={4}
              fill="#72dcff"
              opacity={isHighlight ? 1 : 0.4}
            />
            {!compact && val > 0 && (
              <text
                x={x + barW / 2}
                y={labelY}
                textAnchor="middle"
                fontSize={valueFontSize}
                fill="#72dcff"
                opacity={isHighlight ? 1 : 0.55}
              >
                {val}
              </text>
            )}
            <text
              x={x + barW / 2}
              y={TOP_PAD + H + 14}
              textAnchor="middle"
              fontSize={labelFontSize}
              fill={isHighlight ? "#72dcff" : "#888"}
              fontWeight={isHighlight ? "700" : "400"}
            >
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
  const router = useRouter();
  const currentCalendarYear = new Date().getFullYear();
  const [isCompactChart, setIsCompactChart] = useState(false);

  const [sport, setSport] = useState<Sport>("run");
  const [selectedYears, setSelectedYears] = useState<number[]>([currentCalendarYear]);
  const [selectedMonths, setSelectedMonths] = useState<number[]>([]);
  const [allYears, setAllYears] = useState(false);
  const [shoeId, setShoeId] = useState<string>("");
  const [data, setData] = useState<AnalyticsResponse | null>(null);

  const [historyResult, setHistoryResult] = useState<HistoryResult | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyDrilldown, setHistoryDrilldown] = useState<DrilldownRange | null>(null);
  const [historySort, setHistorySort] = useState<{ field: HistorySortField; direction: Direction }>({
    field: "date",
    direction: "desc"
  });

  useEffect(() => {
    const media = window.matchMedia("(max-width: 430px)");
    const sync = () => setIsCompactChart(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const availableYears = data?.availableYears ?? [currentCalendarYear];
  const ascendingYears = useMemo(() => [...availableYears].sort((a, b) => a - b), [availableYears]);
  const singleYearSelection = !allYears && selectedYears.length === 1;

  const activeYearRange = useMemo(() => {
    if (allYears) {
      return {
        fromYear: ascendingYears[0] ?? currentCalendarYear,
        toYear: ascendingYears[ascendingYears.length - 1] ?? currentCalendarYear
      };
    }
    if (selectedYears.length === 0) {
      return { fromYear: currentCalendarYear, toYear: currentCalendarYear };
    }
    if (selectedYears.length === 1) {
      return { fromYear: selectedYears[0], toYear: selectedYears[0] };
    }
    return {
      fromYear: Math.min(selectedYears[0], selectedYears[1]),
      toYear: Math.max(selectedYears[0], selectedYears[1])
    };
  }, [allYears, ascendingYears, currentCalendarYear, selectedYears]);

  const activeDateRange = useMemo(() => {
    if (allYears) {
      return buildYearRange(activeYearRange.fromYear, activeYearRange.toYear);
    }
    if (singleYearSelection && selectedMonths.length > 0) {
      const [fromMonth, toMonth = selectedMonths[0]] = selectedMonths;
      return buildMonthRange(selectedYears[0], fromMonth, toMonth);
    }
    return buildYearRange(activeYearRange.fromYear, activeYearRange.toYear);
  }, [activeYearRange.fromYear, activeYearRange.toYear, allYears, selectedMonths, selectedYears, singleYearSelection]);

  const historyDisplayRange = historyDrilldown ?? {
    ...activeDateRange,
    label: rangeLabelFallback(allYears, activeYearRange.fromYear, activeYearRange.toYear)
  };

  // ── Load analytics overview ────────────────────────────────────────────
  useEffect(() => {
    void loadOverview();
  }, [
    activeDateRange.from,
    activeDateRange.to,
    activeYearRange.fromYear,
    activeYearRange.toYear,
    allYears,
    selectedYears,
    shoeId,
    sport,
    singleYearSelection
  ]);

  async function loadOverview() {
    const displayYear = singleYearSelection ? selectedYears[0] : activeYearRange.toYear;
    const params = new URLSearchParams({ sport, year: String(displayYear) });
    if (allYears) {
      params.set("allYears", "true");
    } else {
      params.set("fromYear", String(activeYearRange.fromYear));
      params.set("toYear", String(activeYearRange.toYear));
      params.set("fromDate", activeDateRange.from);
      params.set("toDate", activeDateRange.to);
    }
    if (sport === "run" && shoeId) params.set("shoeId", shoeId);
    const res = await fetch(`/api/analytics/overview?${params.toString()}`);
    const json = (await res.json()) as AnalyticsResponse;
    setData(json);
  }

  // ── Load history table ────────────────────────────────────────────────
  useEffect(() => {
    void loadHistoryTable();
  }, [historyDisplayRange.from, historyDisplayRange.to, sport]);

  async function loadHistoryTable() {
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams({ sport });
      params.set("from", `${historyDisplayRange.from}T00:00:00.000Z`);
      params.set("to", `${historyDisplayRange.to}T23:59:59.999Z`);
      const res = await fetch(`/api/analytics/history?${params.toString()}`);
      if (!res.ok) throw new Error("history fetch failed");
      setHistoryResult((await res.json()) as HistoryResult);
    } catch (error) {
      console.error(error);
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    setHistoryDrilldown(null);
  }, [activeDateRange.from, activeDateRange.to, sport, shoeId, allYears]);

  useEffect(() => {
    if (!data?.availableYears?.length) return;
    const allowed = new Set(data.availableYears);
    setSelectedYears((prev) => {
      const valid = prev.filter((year) => allowed.has(year));
      const next = valid.length ? valid.slice(0, 2) : [data.availableYears[0]];
      if (prev.length === next.length && prev.every((value, index) => value === next[index])) {
        return prev;
      }
      return next;
    });
  }, [data?.availableYears]);

  useEffect(() => {
    if (!singleYearSelection && selectedMonths.length) {
      setSelectedMonths([]);
    }
  }, [selectedMonths.length, singleYearSelection]);

  function handleToggleAllYears() {
    setAllYears((prev) => !prev);
    setSelectedMonths([]);
  }

  function handleYearChipClick(year: number) {
    setAllYears(false);
    setSelectedMonths([]);
    setSelectedYears((prev) => {
      if (prev.length === 1) {
        return prev[0] === year ? prev : [prev[0], year];
      }
      return [year];
    });
  }

  function handleMonthChipClick(month: number) {
    if (!singleYearSelection) return;
    setSelectedMonths((prev) => {
      if (prev.length === 0) return [month];
      if (prev.length === 1) return prev[0] === month ? prev : [prev[0], month];
      return [month];
    });
  }

  function handleBarDrilldown(index: number, datum: Record<string, unknown>) {
    if (singleYearSelection && selectedMonthRange && selectedMonthRange.fromMonth === selectedMonthRange.toMonth) {
      const day = Number(datum.day);
      if (!Number.isFinite(day)) return;
      const year = selectedYears[0];
      const month = selectedMonthRange.fromMonth;
      const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      setHistoryDrilldown((prev) =>
        prev?.from === date && prev?.to === date
          ? null
          : {
              from: date,
              to: date,
              label: `${String(day).padStart(2, "0")}-${String(month).padStart(2, "0")}-${String(year).slice(-2)}`
            }
      );
      return;
    }

    if (singleYearSelection) {
      const month = Number(datum.month);
      if (!Number.isFinite(month)) return;
      const nextRange = buildMonthRange(selectedYears[0], month, month);
      const nextLabel = `${monthLabel(month)} ${selectedYears[0]}`;
      setHistoryDrilldown((prev) =>
        prev?.from === nextRange.from && prev?.to === nextRange.to ? null : { ...nextRange, label: nextLabel }
      );
      return;
    }

    const year = Number(datum.year);
    if (!Number.isFinite(year)) return;
    const nextRange = buildYearRange(year, year);
    const nextLabel = String(year);
    setHistoryDrilldown((prev) =>
      prev?.from === nextRange.from && prev?.to === nextRange.to ? null : { ...nextRange, label: nextLabel }
    );
  }

  // ── Computed values ────────────────────────────────────────────────────
  const filteredHistoryWorkouts = useMemo(() => {
    const workouts = historyResult?.workouts ?? [];
    if (sport !== "run" || !shoeId) return workouts;
    return workouts.filter((workout) => {
      const normalizedShoeId =
        shoeId === "unassigned"
          ? !workout.shoeName || workout.shoeName === "ללא שיוך"
          : (data?.runShoes ?? []).find((shoe) => shoe.id === shoeId)?.name === workout.shoeName;
      return normalizedShoeId;
    });
  }, [data?.runShoes, historyResult?.workouts, shoeId, sport]);

  const sortedHistoryWorkouts = useMemo(() => {
    const dir = historySort.direction === "asc" ? 1 : -1;
    return [...filteredHistoryWorkouts].sort((a, b) => {
      const valA = historySortValue(a, historySort.field);
      const valB = historySortValue(b, historySort.field);
      if (valA === valB) return Date.parse(b.startAt) - Date.parse(a.startAt);
      return dir * (valA - valB);
    });
  }, [filteredHistoryWorkouts, historySort]);

  const historySummary = useMemo(() => computeHistorySummary(filteredHistoryWorkouts), [filteredHistoryWorkouts]);

  function toggleHistorySort(field: HistorySortField) {
    setHistorySort((prev) =>
      prev.field === field
        ? { field, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { field, direction: "desc" }
    );
  }

  function historySortIndicator(field: HistorySortField) {
    if (historySort.field !== field) return "";
    return historySort.direction === "asc" ? "▲" : "▼";
  }

  // Bento: use rangeSummary (already covers fromYear..toYear range)
  const totalTimeSec =
    data?.rangeSummary?.avgPace && data.rangeSummary.totalKm
      ? Math.round(data.rangeSummary.totalKm * data.rangeSummary.avgPace * 60)
      : null;
  const avgDurationSec =
    totalTimeSec != null && (data?.rangeSummary.totalCount ?? 0) > 0
      ? Math.round(totalTimeSec / data!.rangeSummary.totalCount)
      : null;

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

  const maxShoeKm = useMemo(
    () => Math.max(1, ...(data?.runShoes ?? []).map((s) => s.km)),
    [data?.runShoes]
  );

  const selectedMonthRange =
    singleYearSelection && selectedMonths.length
      ? {
          fromMonth: Math.min(...selectedMonths),
          toMonth: Math.max(...selectedMonths)
        }
      : null;

  const rangeLabel = allYears
    ? "כל השנים"
    : selectedMonthRange
    ? selectedMonthRange.fromMonth === selectedMonthRange.toMonth
      ? `${monthLabel(selectedMonthRange.fromMonth)} ${selectedYears[0]}`
      : `${monthLabel(selectedMonthRange.fromMonth)}–${monthLabel(selectedMonthRange.toMonth)} ${selectedYears[0]}`
    : activeYearRange.fromYear === activeYearRange.toYear
    ? String(activeYearRange.fromYear)
    : `${activeYearRange.fromYear}–${activeYearRange.toYear}`;

  const chartData = useMemo(() => {
    if (singleYearSelection && selectedMonthRange && selectedMonthRange.fromMonth === selectedMonthRange.toMonth) {
      return (data?.daily ?? []).map((dayRow) => ({
        day: dayRow.day,
        label: String(dayRow.day),
        km: dayRow.km
      }));
    }

    if (singleYearSelection) {
      return (data?.monthly ?? [])
        .filter((monthRow) => {
          if (!selectedMonthRange) return true;
          return monthRow.month >= selectedMonthRange.fromMonth && monthRow.month <= selectedMonthRange.toMonth;
        })
        .map((monthRow) => ({
          month: monthRow.month,
          label: monthLabel(monthRow.month),
          km: monthRow.km
        }));
    }

    return (data?.yearly ?? [])
      .filter((yearRow) => yearRow.year >= activeYearRange.fromYear && yearRow.year <= activeYearRange.toYear)
      .map((yearRow) => ({
        year: yearRow.year,
        label: String(yearRow.year),
        km: yearRow.km
      }));
  }, [
    activeYearRange.fromYear,
    activeYearRange.toYear,
    data?.daily,
    data?.monthly,
    data?.yearly,
    selectedMonthRange,
    singleYearSelection
  ]);

  const chartMax = useMemo(() => maxValue(chartData.map((item) => item.km as number)), [chartData]);
  const historyScopeLabel = historyDrilldown?.label ?? rangeLabel;

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
        {shoeDropdown}
      </div>

      <section className="anl-card">
        <div className="anl-timeboard">
          <div className="anl-timeboard-head">
            <div>
              <h2 className="anl-card-title">טווח ניתוח</h2>
              <p className="anl-timeboard-sub">בחר שנה אחת, כמה שנים רצופות, או חודש בתוך שנה אחת.</p>
            </div>
            <div className="anl-selection-meta">
              <span className="anl-selection-badge">{rangeLabel}</span>
              <span className="anl-selection-hint">
                {data?.rangeSummary.totalCount ?? 0} אימונים · {data?.rangeSummary.totalKm ?? 0} ק&quot;מ
              </span>
            </div>
          </div>

          <div className="anl-timeboard-row">
            <button
              className={`anl-time-chip anl-time-chip-strong ${allYears ? "active" : ""}`}
              onClick={handleToggleAllYears}
            >
              ALL TIME
            </button>
            <div className="anl-time-chip-group">
              {availableYears.map((year) => {
                const isActive =
                  allYears ||
                  (selectedYears.length === 1
                    ? selectedYears[0] === year
                    : year >= activeYearRange.fromYear && year <= activeYearRange.toYear);
                return (
                  <button
                    key={year}
                    className={`anl-time-chip ${isActive ? "active" : ""}`}
                    onClick={() => handleYearChipClick(year)}
                  >
                    {year}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="anl-timeboard-row anl-timeboard-row-months">
            <div className="anl-time-chip-group">
              {MONTH_LABELS.map((label, index) => {
                const month = index + 1;
                const isActive =
                  singleYearSelection &&
                  selectedMonthRange != null &&
                  month >= selectedMonthRange.fromMonth &&
                  month <= selectedMonthRange.toMonth;
                return (
                  <button
                    key={label}
                    className={`anl-time-chip anl-time-chip-month ${isActive ? "active" : ""}`}
                    disabled={!singleYearSelection}
                    onClick={() => handleMonthChipClick(month)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {!singleYearSelection && (
              <span className="anl-selection-hint">חודשים פעילים רק כשנבחרת שנה אחת.</span>
            )}
          </div>
        </div>
      </section>

      <div className="anl-bento">
        <div className="anl-metric">
          <span className="anl-metric-lbl">זמן כולל</span>
          <strong className="anl-metric-val">{totalTimeSec != null ? formatDuration(totalTimeSec) : "–"}</strong>
        </div>
        <div className="anl-metric">
          <span className="anl-metric-lbl">משך ממוצע</span>
          <strong className="anl-metric-val">{avgDurationSec != null ? formatDuration(avgDurationSec) : "–"}</strong>
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

      <section className="anl-card">
        <h2 className="anl-card-title">
          {singleYearSelection && selectedMonthRange && selectedMonthRange.fromMonth === selectedMonthRange.toMonth
            ? "מבט יומי"
            : singleYearSelection
            ? "מבט חודשי"
            : "מבט שנתי"}
          <span className="anl-card-sub">
            {singleYearSelection && selectedMonthRange && selectedMonthRange.fromMonth === selectedMonthRange.toMonth
              ? `לחץ על יום כדי להציג את האימונים שלו`
              : singleYearSelection
              ? `לחץ על חודש כדי להציג את האימונים שלו`
              : `לחץ על שנה כדי להציג את האימונים שלה`}
          </span>
        </h2>
        <BarChart
          data={chartData}
          maxVal={chartMax}
          labelKey="label"
          valueKey="km"
          height={isCompactChart ? 128 : 160}
          compact={isCompactChart}
          onBarClick={handleBarDrilldown}
        />
      </section>

      {/* History section */}
      {sport === "run" && (
        <section className="anl-card anl-hist-section">
          <h2 className="anl-card-title">
            היסטוריית אימונים{" "}
            <span className="anl-card-sub">
              {historyScopeLabel} · {historyDisplayRange.from} → {historyDisplayRange.to}
            </span>
          </h2>

          {historyLoading && <p className="anl-loading">טוען נתונים...</p>}

          {!historyLoading && historyResult && (
            <>
              <div className="anl-hist-summary">
                <span className="anl-hist-pill">אימונים {historySummary.totalCount}</span>
                <span className="anl-hist-pill">ק&quot;מ {historySummary.totalKm}</span>
                <span className="anl-hist-pill">
                  קצב ממוצע {historySummary.avgPace ? formatPace(historySummary.avgPace) : "-"}
                </span>
                <span className="anl-hist-pill">
                  קצב שיא {formatPace(historySummary.bestPace)}
                </span>
              </div>

              <div className="anl-hist-table-wrap">
                <table className="anl-hist-table">
                  <thead>
                    <tr>
                      <th><button onClick={() => toggleHistorySort("date")}>תאריך {historySortIndicator("date")}</button></th>
                      <th><button onClick={() => toggleHistorySort("distance")}>מרחק {historySortIndicator("distance")}</button></th>
                      <th><button onClick={() => toggleHistorySort("pace")}>קצב {historySortIndicator("pace")}</button></th>
                      <th><button onClick={() => toggleHistorySort("time")}>זמן {historySortIndicator("time")}</button></th>
                      <th><button onClick={() => toggleHistorySort("tss")}>TSS {historySortIndicator("tss")}</button></th>
                      <th>נעל</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedHistoryWorkouts.length > 0 ? (
                      sortedHistoryWorkouts.map((work) => (
                        <tr
                          key={work.id}
                          className="anl-hist-row"
                          onClick={() => router.push(workoutDetailPath(work.id))}
                          title="לחץ לפתיחת האימון"
                        >
                          <td className="anl-hist-date-cell">{formatDisplayDate(work.startAt)}</td>
                          <td>{formatDistanceKm(work.distanceDisplayKm ?? (work.distanceM != null ? work.distanceM / 1000 : null))}</td>
                          <td>{formatPace(work.paceMinPerKm)}</td>
                          <td>{formatDuration(work.durationSec)}</td>
                          <td>{work.tssLike ?? "–"}</td>
                          <td>{work.shoeName ?? "–"}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="anl-hist-empty">אין אימונים בטווח שנבחר.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
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
                className={`anl-pb-card${pb.workoutId ? " anl-pb-card-link" : ""}`}
                onClick={() => pb.workoutId && router.push(workoutDetailPath(pb.workoutId))}
                title={pb.workoutId ? "לחץ לפתיחת האימון" : undefined}
              >
                <span className="anl-pb-dist">{pb.distanceLabel}</span>
                <span className="anl-pb-time">{formatDuration(pb.bestTimeSec)}</span>
                <span className="anl-pb-pace">
                  {pb.paceMinPerKm ? `${formatPace(pb.paceMinPerKm)} דק/ק"מ` : "–"}
                </span>
                <span className="anl-pb-date">
                  {pb.date ? formatDisplayDate(pb.date) : "תאריך לא ידוע"}
                </span>
                {pb.workoutId && (
                  <span className="anl-pb-go">לאימון ←</span>
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
                  <span>{shoe.runs} ריצות · {shoe.km} ק&quot;מ</span>
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
