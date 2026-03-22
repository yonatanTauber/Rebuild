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

  const BUCKET_COUNT = 10;

  const chart = useMemo(() => {
    const width = 920;
    const height = 240;
    const padLeft = 8;
    const padRight = 8;
    const padTop = 8;
    const padBottom = 30;
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

    // Compute bar buckets
    const bucketW = durationSec / BUCKET_COUNT;
    const bars = Array.from({ length: BUCKET_COUNT }, (_, i) => {
      const start = i * bucketW;
      const end = (i + 1) * bucketW;
      const slice = samples.filter((s) => s.sec >= start && s.sec < end);
      const avg = slice.length > 0 ? slice.reduce((acc, s) => acc + s.bpm, 0) / slice.length : yMin;
      const heightPct = clamp((avg - yMin) / ySpan, 0, 1);
      return { x: toX(start), width: (plotW / BUCKET_COUNT) - 3, heightPct, barH: heightPct * plotH };
    });

    const xTicks: number[] = [];
    const stepSec = durationSec <= 1800 ? 300 : durationSec <= 3600 ? 600 : 900;
    for (let sec = 0; sec <= durationSec; sec += stepSec) xTicks.push(sec);
    if (!xTicks.includes(durationSec)) xTicks.push(durationSec);

    return { width, height, padLeft, padRight, padTop, padBottom, plotW, plotH, durationSec, yMin, yMax, ySpan, toX, toY, path, xTicks, bars };
  }, [samples]);

  const active = useMemo(() => {
    const sec = hoverSec ?? chart.durationSec;
    return findNearestSample(samples, sec);
  }, [samples, hoverSec, chart.durationSec]);

  const activeX = active ? chart.toX(active.sec) : null;
  const activeY = active ? chart.toY(active.bpm) : null;

  return (
    <div className="hr-chart-card interactive hr-chart-card-kinetic">
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
        {/* Amber bars */}
        {chart.bars.map((bar, i) => (
          <rect
            key={i}
            x={bar.x}
            y={chart.padTop + chart.plotH - bar.barH}
            width={bar.width}
            height={bar.barH}
            fill="#ed8200"
            opacity={0.25 + bar.heightPct * 0.45}
            rx={3}
          />
        ))}

        {/* Orange trend line */}
        <path d={chart.path} fill="none" stroke="#fd8b00" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* X-axis time labels */}
        {chart.xTicks.map((sec) => (
          <text key={`x-${sec}`} x={chart.toX(sec)} y={chart.height - 8} textAnchor="middle" className="hr-chart-tick">
            {formatClock(sec)}
          </text>
        ))}

        {active && activeX != null && activeY != null && (
          <>
            <line x1={activeX} x2={activeX} y1={chart.padTop} y2={chart.height - chart.padBottom} stroke="#fd8b00" strokeWidth="1" strokeDasharray="4,4" opacity={0.6} />
            <circle cx={activeX} cy={activeY} r={5} fill="#fd8b00" />
          </>
        )}
      </svg>

      {active && (
        <div className="hr-chart-tooltip">
          <span>{formatClock(active.sec)}</span>
          <strong>{Math.round(active.bpm)} bpm</strong>
        </div>
      )}
    </div>
  );
}
