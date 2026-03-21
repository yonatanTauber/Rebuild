"use client";

import { useMemo, useState } from "react";

type HrSample = {
  sec: number;
  bpm: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatClock(sec: number) {
  const rounded = Math.max(0, Math.round(sec));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function findNearestSample(samples: HrSample[], sec: number) {
  if (!samples.length) return null;
  let left = 0;
  let right = samples.length - 1;
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (samples[mid].sec < sec) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }
  const candidate = samples[left];
  const prev = samples[Math.max(0, left - 1)];
  if (!candidate) return prev ?? null;
  if (!prev) return candidate;
  return Math.abs(candidate.sec - sec) < Math.abs(prev.sec - sec) ? candidate : prev;
}

export default function HeartRateChart({ samples }: { samples: HrSample[] }) {
  const [hoverSec, setHoverSec] = useState<number | null>(null);

  const chart = useMemo(() => {
    const width = 920;
    const height = 260;
    const padLeft = 56;
    const padRight = 16;
    const padTop = 12;
    const padBottom = 34;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;
    const durationSec = Math.max(1, samples[samples.length - 1]?.sec ?? 1);

    const minBpm = Math.min(...samples.map((s) => s.bpm));
    const maxBpm = Math.max(...samples.map((s) => s.bpm));
    const yMin = Math.floor((minBpm - 4) / 10) * 10;
    const yMax = Math.ceil((maxBpm + 4) / 10) * 10;
    const ySpan = Math.max(10, yMax - yMin);

    const toX = (sec: number) => padLeft + (clamp(sec, 0, durationSec) / durationSec) * plotW;
    const toY = (bpm: number) => padTop + (1 - (clamp(bpm, yMin, yMax) - yMin) / ySpan) * plotH;

    const path = samples
      .map((sample, idx) => `${idx === 0 ? "M" : "L"}${toX(sample.sec).toFixed(2)},${toY(sample.bpm).toFixed(2)}`)
      .join(" ");

    const yTicks: number[] = [];
    for (let bpm = yMin; bpm <= yMax; bpm += 10) {
      yTicks.push(bpm);
    }

    const xTicks: number[] = [];
    const stepSec = 600;
    for (let sec = 0; sec <= durationSec; sec += stepSec) {
      xTicks.push(sec);
    }
    if (!xTicks.includes(durationSec)) xTicks.push(durationSec);

    return { width, height, padLeft, padRight, padTop, padBottom, plotW, plotH, durationSec, yMin, yMax, ySpan, toX, toY, path, yTicks, xTicks };
  }, [samples]);

  const active = useMemo(() => {
    const sec = hoverSec ?? chart.durationSec;
    return findNearestSample(samples, sec);
  }, [samples, hoverSec, chart.durationSec]);

  const activeX = active ? chart.toX(active.sec) : null;
  const activeY = active ? chart.toY(active.bpm) : null;

  return (
    <div className="hr-chart-card interactive">
      <svg
        className="hr-chart"
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        role="img"
        aria-label="Heart rate over run"
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          if (rect.width <= 0) return;
          const xPx = event.clientX - rect.left;
          const ratio = clamp(xPx / rect.width, 0, 1);
          setHoverSec(ratio * chart.durationSec);
        }}
        onMouseLeave={() => setHoverSec(null)}
      >
        {chart.yTicks.map((bpm) => (
          <g key={`y-${bpm}`}>
            <line x1={chart.padLeft} x2={chart.width - chart.padRight} y1={chart.toY(bpm)} y2={chart.toY(bpm)} className="hr-chart-grid" />
            <text x={chart.padLeft - 8} y={chart.toY(bpm) + 4} className="hr-chart-tick">{bpm}</text>
          </g>
        ))}

        {chart.xTicks.map((sec) => (
          <g key={`x-${sec}`}>
            <line x1={chart.toX(sec)} x2={chart.toX(sec)} y1={chart.padTop} y2={chart.height - chart.padBottom} className="hr-chart-grid v" />
            <text x={chart.toX(sec)} y={chart.height - 8} textAnchor="middle" className="hr-chart-tick">
              {formatClock(sec)}
            </text>
          </g>
        ))}

        <path d={chart.path} fill="none" className="hr-chart-line" />

        {active && activeX != null && activeY != null && (
          <>
            <line x1={activeX} x2={activeX} y1={chart.padTop} y2={chart.height - chart.padBottom} className="hr-chart-cursor" />
            <circle cx={activeX} cy={activeY} r={4} className="hr-chart-dot" />
          </>
        )}
      </svg>

      {active && (
        <div className="hr-chart-tooltip">
          <span>זמן: {formatClock(active.sec)}</span>
          <strong>דופק: {Math.round(active.bpm)} bpm</strong>
        </div>
      )}
    </div>
  );
}
