"use client";

import React, { memo, useMemo } from "react";
import type { TodayData, Recommendation } from "../types";

/**
 * TodayHero Component
 *
 * Displays the above-the-fold critical content:
 * - Bento grid: Readiness hero card with SVG ring, Fatigue and Fitness half-width cards
 * - Training state banner
 * - Recommendation section
 * - Coach agent insights
 *
 * This component loads immediately with the page.
 * Heavy calculations are memoized to prevent unnecessary re-renders.
 */

interface TodayHeroProps {
  data: TodayData | null;
  loading?: boolean;
  onDateChange?: (date: string) => void;
}

/**
 * Get human-readable label for readiness score
 */
function getLabelByScore(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) return "בדיקה";
  if (score >= 85) return "יום חזק";
  if (score >= 70) return "יום טוב";
  if (score >= 55) return "יום בינוני";
  return "יום קשה";
}

export const TodayHero = memo(function TodayHero({ data, loading, onDateChange }: TodayHeroProps) {
  const readinessLabel = useMemo(() => getLabelByScore(data?.readinessScore), [data?.readinessScore]);

  const readiness = data?.readinessScore ?? 0;
  const fatigue = data?.fatigueScore ?? 0;
  const fitness = data?.fitnessScore ?? 0;

  // Training state banner styling
  const stateClassName = useMemo(
    () => `training-state-banner ${data?.stateTag ?? "on_the_spot"}`,
    [data?.stateTag]
  );

  if (loading) {
    return (
      <div className="today-hero compact">
        <div>טוען...</div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  // SVG ring calculation: circumference of r=40 is 2*PI*40 ≈ 251.2
  const circumference = 251.2;
  const strokeDashoffset = circumference - (circumference * readiness / 100);

  return (
    <section className="today-hero compact" role="region" aria-label="סיכום היום">
      {/* Bento Grid Score Cards */}
      <div className="grid grid-cols-2 gap-4" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "1rem", marginTop: "1rem" }}>
        {/* Hero Score: Readiness - full width */}
        <div
          className="col-span-2"
          style={{
            gridColumn: "span 2",
            background: "#20201f",
            borderRadius: "0.75rem",
            padding: "1.5rem",
            display: "flex",
            flexDirection: "row-reverse",
            alignItems: "center",
            justifyContent: "space-between",
            overflow: "hidden",
            position: "relative",
          }}
        >
          <div style={{ position: "relative", zIndex: 10, textAlign: "right" }}>
            <h3 style={{ color: "#adaaaa", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "4px", margin: "0 0 4px" }}>
              מוכנות
            </h3>
            <div style={{ display: "flex", alignItems: "baseline", gap: "4px", flexDirection: "row-reverse" }}>
              <span style={{ fontSize: "3rem", fontWeight: 800, color: "#c3ffcd", fontFamily: "var(--font-display), 'Be Vietnam Pro', sans-serif" }}>
                {readiness}/100
              </span>
            </div>
            <p style={{ color: "#5bef90", fontSize: "12px", marginTop: "8px", margin: "8px 0 0" }}>
              {readinessLabel}
            </p>
          </div>

          <div style={{ position: "relative" }}>
            <svg width="96" height="96" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="48" cy="48" r="40" fill="transparent" stroke="#262626" strokeWidth="8" />
              <circle
                cx="48"
                cy="48"
                r="40"
                fill="transparent"
                stroke="#c3ffcd"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
              />
            </svg>
          </div>

          {/* Ambient glow */}
          <div style={{
            position: "absolute",
            right: "-40px",
            bottom: "-40px",
            width: "160px",
            height: "160px",
            background: "rgba(195,255,205,0.05)",
            filter: "blur(40px)",
            borderRadius: "50%",
          }} />
        </div>

        {/* Fatigue - half width */}
        <div style={{
          background: "#1a1a1a",
          borderRadius: "12px",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          height: "160px",
          textAlign: "right",
        }}>
          <div>
            <h3 style={{ color: "#adaaaa", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", marginBottom: "8px", margin: "0 0 8px" }}>
              עייפות
            </h3>
            <div style={{ display: "flex", alignItems: "baseline", gap: "4px", flexDirection: "row-reverse" }}>
              <span style={{ fontSize: "2rem", fontWeight: 700, color: "#fd8b00", fontFamily: "var(--font-display), 'Be Vietnam Pro', sans-serif" }}>
                {fatigue}
              </span>
              <span style={{ color: "rgba(253,139,0,0.6)", fontSize: "11px" }}>%</span>
            </div>
          </div>
          <div style={{ width: "100%", background: "#262626", height: "6px", borderRadius: "999px", overflow: "hidden" }}>
            <div style={{ width: `${fatigue}%`, background: "#fd8b00", height: "100%" }} />
          </div>
        </div>

        {/* Fitness - half width */}
        <div style={{
          background: "#1a1a1a",
          borderRadius: "12px",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          height: "160px",
          textAlign: "right",
        }}>
          <div>
            <h3 style={{ color: "#adaaaa", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", marginBottom: "8px", margin: "0 0 8px" }}>
              כושר
            </h3>
            <div style={{ display: "flex", alignItems: "baseline", gap: "4px", flexDirection: "row-reverse" }}>
              <span style={{ fontSize: "2rem", fontWeight: 700, color: "#72dcff", fontFamily: "var(--font-display), 'Be Vietnam Pro', sans-serif" }}>
                {fitness}
              </span>
              <span style={{ color: "rgba(114,220,255,0.6)", fontSize: "11px" }}>VO2</span>
            </div>
          </div>
          <div style={{ width: "100%", background: "#262626", height: "6px", borderRadius: "999px", overflow: "hidden" }}>
            <div style={{ width: `${fitness}%`, background: "#72dcff", height: "100%" }} />
          </div>
        </div>
      </div>

      {/* Training State Banner */}
      {data.stateTag && (
        <div className={stateClassName} role="status">
          <strong>{data.stateLabel}</strong>
          {data.stateHint && <span>{data.stateHint}</span>}
        </div>
      )}

      {/* Recommendation Section */}
      {data.recommendation && (
        <div className="panel recommendation-section" role="region" aria-label="מלצה יומית">
          <h2>המלצה</h2>
          <p className="recommendation-main">{data.recommendation}</p>

          {data.explanation && (
            <details>
              <summary>הסברים</summary>
              <p className="explanation">{data.explanation}</p>
            </details>
          )}

          {data.alerts && data.alerts.length > 0 && (
            <div className="alerts">
              {data.alerts.map((alert, idx) => (
                <div key={idx} className="alert" role="alert">
                  ⚠️ {alert}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Coach Agent Report */}
      {data.coachAgent && (
        <div className="panel coach-report" role="region" aria-label="דוח המאמן">
          <h3>💬 המאמן אומר</h3>
          {data.coachAgent.dailyNarrative && (
            <p>{data.coachAgent.dailyNarrative}</p>
          )}
          {data.coachAgent.reasoning && (
            <ul>
              {data.coachAgent.reasoning.map((rec, idx) => (
                <li key={idx}>{rec}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
});

TodayHero.displayName = "TodayHero";
