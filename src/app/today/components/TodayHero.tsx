"use client";

import React, { memo, useMemo } from "react";
import { ScoreCard } from "@/components/cards";
import type { TodayData, Recommendation } from "../types";

/**
 * TodayHero Component
 *
 * Displays the above-the-fold critical content:
 * - Three score cards (Readiness, Fatigue, Fitness)
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

// Memoized score card to prevent unnecessary renders
const ScoreCardMemo = memo(({ label, value, tone }: any) => (
  <ScoreCard title={label} value={value} tone={tone} />
));
ScoreCardMemo.displayName = "ScoreCardMemo";

/**
 * Calculate tone (color) based on score value
 * Cached to prevent recalculation
 */
function getToneByScore(score: number | null | undefined): "red" | "yellow" | "orange" | "black" {
  if (score == null || !Number.isFinite(score)) return "yellow";
  const normalized = Math.max(0, Math.min(100, score));
  if (normalized >= 70) return "black";
  if (normalized >= 55) return "yellow";
  return "red";
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
  // Memoize tone calculations
  const readinessTone = useMemo(() => getToneByScore(data?.readinessScore), [data?.readinessScore]);
  const fatigueTone = useMemo(() => getToneByScore(data?.fatigueScore), [data?.fatigueScore]);
  const fitnessTone = useMemo(() => getToneByScore(data?.fitnessScore), [data?.fitnessScore]);

  const readinessLabel = useMemo(() => getLabelByScore(data?.readinessScore), [data?.readinessScore]);

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

  return (
    <section className="today-hero compact" role="region" aria-label="סיכום היום">
      {/* Score Cards Grid */}
      <div className="grid-3 score-strip">
        <ScoreCardMemo
          label="גמישות"
          value={data.readinessScore ?? "-"}
          tone={readinessTone}
        />
        <ScoreCardMemo
          label="עייפות"
          value={data.fatigueScore ?? "-"}
          tone={fatigueTone}
        />
        <ScoreCardMemo
          label="כושר"
          value={data.fitnessScore ?? "-"}
          tone={fitnessTone}
        />
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
          {data.coachAgent.summary && (
            <p>{data.coachAgent.summary}</p>
          )}
          {data.coachAgent.recommendations && (
            <ul>
              {data.coachAgent.recommendations.map((rec, idx) => (
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
