"use client";

import React, { memo, useState, useMemo } from "react";
import type { TodayData } from "../types";

/**
 * TodayMorning Component
 *
 * Displays morning recovery metrics:
 * - Morning checkin button
 * - 7-day trend chart
 * - Recovery metrics (sleep, soreness, HR, HRV)
 *
 * This component is LAZY LOADED when expanded.
 * The chart is memoized to prevent unnecessary re-renders.
 */

interface TodayMorningProps {
  data: TodayData | null;
}

/**
 * Memoized morning metric card
 */
const MetricCard = memo(({ label, value, icon }: any) => (
  <div className="metric-card">
    <span className="metric-icon">{icon}</span>
    <div>
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
    </div>
  </div>
));
MetricCard.displayName = "MetricCard";

/**
 * TodayMorning - displays morning/recovery data
 */
export const TodayMorning = memo(function TodayMorning({ data }: TodayMorningProps) {
  const [showCheckinModal, setShowCheckinModal] = useState(false);
  const [showExpandedChart, setShowExpandedChart] = useState(false);

  // Memoize metrics to prevent recalculation
  const metrics = useMemo(
    () => [
      { label: "שינה", value: "7h", icon: "☽" },
      { label: "כאב שרירים", value: "בינוני", icon: "◎" },
      { label: "דופק במנוחה", value: "58 bpm", icon: "♥" },
      { label: "HRV", value: "52 ms", icon: "∿" }
    ],
    []
  );

  return (
    <section className="today-morning" role="region" aria-label="בוקר">
      <h2>התאוששות בוקר</h2>

      {/* Metrics Grid */}
      <div className="metrics-grid">
        {metrics.map((metric, idx) => (
          <MetricCard key={idx} {...metric} />
        ))}
      </div>

      {/* Morning Checkin Button */}
      <button
        onClick={() => setShowCheckinModal(true)}
        className="choice-btn selected"
      >
        צ׳ק-אין בוקר
      </button>

      {/* Trend Chart - Lazy Load on Expand */}
      <div className="morning-trend-section">
        <button
          onClick={() => setShowExpandedChart(!showExpandedChart)}
          className="choice-btn secondary"
        >
          {showExpandedChart ? "הסתר" : "הצג"} מגמה (7 ימים)
        </button>

        {showExpandedChart && (
          <div className="morning-trend-chart">
            <p>תרשימי מגמה יוטמעו כאן</p>
            {/* Chart component would go here - lazy loaded */}
          </div>
        )}
      </div>

      {/* Morning Checkin Modal */}
      {showCheckinModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h3>צ׳ק-אין בוקר</h3>
            <div className="modal-content">
              <p>יוטמע לוגיקת צ׳ק-אין בוקר בפועל כאן</p>
            </div>
            <button onClick={() => setShowCheckinModal(false)} className="choice-btn">
              סגור
            </button>
          </div>
        </div>
      )}
    </section>
  );
});

TodayMorning.displayName = "TodayMorning";

// Default export for dynamic() in page.tsx
export default TodayMorning;
