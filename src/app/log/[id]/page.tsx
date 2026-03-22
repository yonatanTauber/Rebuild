import Link from "next/link";
import FeedbackInline from "@/components/workout-feedback-inline";
import HeartRateChart from "@/components/heart-rate-chart";
import WorkoutOfficialDurationEditor from "@/components/workout-official-duration-editor";
import WorkoutShoeInline from "@/components/workout-shoe-inline";
import WorkoutRouteMap from "@/components/workout-route-map-lazy";
import {
  getAdjacentWorkoutIds,
  getTopEffortsForWorkout,
  getWorkoutById,
  getWorkoutFeedback,
  getWorkoutOfficialDurationSec
} from "@/lib/db";
import {
  cloudEnabled,
  cloudGetAdjacentWorkoutIds,
  cloudGetWorkoutById,
  cloudGetWorkoutFeedback,
  cloudGetWorkoutOfficialDurationSec
} from "@/lib/cloud-db";
import { formatDisplayDateTime } from "@/lib/date";
import { computeRunScore } from "@/lib/run-score";
import { decodeRouteParam, workoutDetailPath } from "@/lib/url";
import { getWorkoutDetailData } from "@/lib/workout-detail";
import { getCloudWorkoutDetailData } from "@/lib/strava-workout-detail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sportLabel(sport: string) {
  if (sport === "run") return "ריצה";
  if (sport === "bike") return "אופניים";
  if (sport === "strength") return "כוח";
  return "שחייה";
}

function formatClock(sec: number | null) {
  if (sec == null || !Number.isFinite(sec)) return "-";
  const rounded = Math.round(sec);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatPace(paceMinPerKm: number | null) {
  if (paceMinPerKm == null || !Number.isFinite(paceMinPerKm)) return "-";
  const totalSec = Math.round(paceMinPerKm * 60);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

function formatDistanceKm(distanceKm: number | null) {
  if (distanceKm == null || !Number.isFinite(distanceKm)) return "-";
  const rounded = Math.round(distanceKm * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(2)}`;
}

function formatShoeKm(km: number | null | undefined) {
  if (km == null || !Number.isFinite(km)) return "-";
  return `${km.toFixed(1)} ק"מ`;
}

function effortDistanceLabel(distanceKey: string, distanceKm: number) {
  if (distanceKey === "half") return "חצי מרתון";
  return `${Number.isInteger(distanceKm) ? distanceKm.toFixed(0) : distanceKm.toFixed(1)} ק"מ`;
}

function hrLoadLabel(tss: number): string {
  if (tss < 20) return "קל (Recovery)";
  if (tss < 50) return "בינוני (Aerobic)";
  if (tss < 80) return "גבוה (Aerobic)";
  return "גבוה מאוד (Threshold)";
}

export default async function WorkoutDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workoutId = decodeRouteParam(id);
  const useCloud = cloudEnabled();
  const workout = useCloud ? await cloudGetWorkoutById(workoutId) : getWorkoutById(workoutId);

  if (!workout) {
    return (
      <>
        <header className="page-header">
          <h1>אימון לא נמצא</h1>
          <p>לא נמצאה רשומה תואמת.</p>
        </header>
        <Link href="/log">חזרה ליומן</Link>
      </>
    );
  }

  let detail = getWorkoutDetailData(workout);
  if (useCloud && workout.source === "strava") {
    try {
      detail = await getCloudWorkoutDetailData(workout);
    } catch (error) {
      console.error("strava-detail-failed", { workoutId: workout.id, error });
    }
  }
  const adjacent = useCloud ? await cloudGetAdjacentWorkoutIds(workout.id) : getAdjacentWorkoutIds(workout.id);
  const isRun = workout.sport === "run";
  const isBike = workout.sport === "bike";
  const hasRouteMap = isRun || isBike;
  const feedback = isRun ? (useCloud ? await cloudGetWorkoutFeedback(workout.id) : getWorkoutFeedback(workout.id)) : null;
  const allEfforts = useCloud ? [] : getTopEffortsForWorkout(workout.id);
  const bestEfforts = Array.from(
    allEfforts.reduce((map, effort) => {
      if (!map.has(effort.distanceKey)) {
        map.set(effort.distanceKey, effort);
      }
      return map;
    }, new Map<string, (typeof allEfforts)[number]>()).values()
  );
  const splits = isRun ? detail.splits : [];
  const hrSamples = detail.heartRateSamples;
  const displayAvgHr = detail.avgHrFromTrack ?? workout.avgHr ?? null;
  const displayMaxHr = detail.maxHrFromTrack ?? workout.maxHr ?? null;
  const hrScore = isRun
    ? computeRunScore({
        durationSec: workout.durationSec,
        avgHr: displayAvgHr,
        maxHr: displayMaxHr,
        movingDurationSec: detail.movingDurationSec,
        splits,
        feedback: feedback ?? undefined
      })
    : null;
  const officialDurationOverrideSec = useCloud
    ? await cloudGetWorkoutOfficialDurationSec(workout.id)
    : getWorkoutOfficialDurationSec(workout.id);
  const runDisplayDistanceKm = isRun ? detail.distanceOfficialKm ?? detail.distanceRawKm : null;
  const runDisplayDurationSec = isRun
    ? officialDurationOverrideSec ?? detail.movingDurationSec ?? workout.durationSec
    : workout.durationSec;
  const runDisplayPaceMinPerKm =
    runDisplayDistanceKm != null && runDisplayDistanceKm > 0 && runDisplayDurationSec > 0
      ? runDisplayDurationSec / 60 / runDisplayDistanceKm
      : null;
  const showPauseRow = (detail.pauseDurationSec ?? 0) >= 60;
  const distanceGapKm =
    detail.distanceOfficialKm != null && detail.distanceRawKm != null
      ? Math.abs(detail.distanceOfficialKm - detail.distanceRawKm)
      : 0;
  const showDistanceGap = distanceGapKm >= 0.03;
  const displayDistanceKm = detail.distanceOfficialKm ?? detail.distanceRawKm;

  const sportColor = workout.sport === "run" ? "#72dcff" : workout.sport === "bike" ? "#fdd848" : workout.sport === "strength" ? "#fd8b00" : "#c3ffcd";
  const sportIconChar = workout.sport === "run" ? "🏃" : workout.sport === "bike" ? "🚴" : workout.sport === "strength" ? "💪" : "🏊";

  // Find best pace km for highlight
  const bestPaceKm = splits.length > 0
    ? splits.reduce((best, s) => (s.paceMinPerKm != null && (best == null || s.paceMinPerKm < best.paceMinPerKm!)) ? s : best, splits[0])?.km
    : null;

  const displayHours = Math.floor(runDisplayDurationSec / 3600);
  const displayMins = Math.floor((runDisplayDurationSec % 3600) / 60);
  const timeDisplay = displayHours > 0
    ? `${displayHours}:${String(displayMins).padStart(2, "0")}`
    : `${displayMins}:${String(Math.round(runDisplayDurationSec % 60)).padStart(2, "0")}`;
  const timeUnit = displayHours > 0 ? "HRS" : "MIN";

  return (
    <div className="wkd-page">

      {/* ── Back / Adjacent nav ── */}
      <div className="wkd-back-bar">
        {adjacent.previous ? (
          <Link href={workoutDetailPath(adjacent.previous.id)} className="wkd-adj-btn">‹</Link>
        ) : (
          <span className="wkd-adj-btn disabled">‹</span>
        )}
        <Link href="/log" className="wkd-back-link">יומן אימונים ←</Link>
        {adjacent.next ? (
          <Link href={workoutDetailPath(adjacent.next.id)} className="wkd-adj-btn">›</Link>
        ) : (
          <span className="wkd-adj-btn disabled">›</span>
        )}
      </div>

      {/* ── Hero ── */}
      <div className="wkd-hero">
        <div className="wkd-hero-left">
          <span className="wkd-session-label">SESSION OVERVIEW</span>
          <h1 className="wkd-title">פרטי אימון</h1>
          <p className="wkd-subtitle" style={{ color: sportColor }}>
            {sportLabel(workout.sport)} · {formatDisplayDateTime(workout.startAt)}
          </p>
        </div>
        {isRun && hrScore ? (
          <div className="wkd-run-score-mini" aria-label="ציון אימון ומשוב אישי">
            <div className="wkd-run-score-mini-row">
              <span>ציון אימון</span>
              <strong>{hrScore.score}</strong>
            </div>
            <div className="wkd-run-score-mini-row feedback">
              <span>השפעת משוב אישי</span>
              <strong>{hrScore.breakdown.feedback >= 0 ? "+" : ""}{hrScore.breakdown.feedback}</strong>
            </div>
            {workout.shoeName ? (
              <div className="wkd-run-score-mini-row shoe">
                <span>נעל</span>
                <strong>{workout.shoeName}</strong>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="wkd-hero-right">
          <span className="wkd-sport-icon">{sportIconChar}</span>
        </div>
      </div>

      {/* ── Bento 2×2 metrics ── */}
      <div className="wkd-bento">
        <div className="wkd-metric wkd-metric-time">
          <span className="wkd-metric-label">זמן כולל</span>
          <div className="wkd-metric-value">
            <span className="wkd-metric-number">{timeDisplay}</span>
            <span className="wkd-metric-unit">{timeUnit}</span>
          </div>
        </div>
        <div className="wkd-metric wkd-metric-dist">
          <span className="wkd-metric-label">מרחק</span>
          <div className="wkd-metric-value">
            <span className="wkd-metric-unit">KM</span>
            <span className="wkd-metric-number">
              {displayDistanceKm != null ? formatDistanceKm(displayDistanceKm) : "-"}
            </span>
          </div>
        </div>
        <div className="wkd-metric wkd-metric-load">
          <span className="wkd-metric-label">עומס</span>
          <div className="wkd-metric-value">
            <span className="wkd-metric-number">{Math.round(workout.tssLike)}</span>
            <span className="wkd-metric-unit">TSS</span>
          </div>
        </div>
        <div className="wkd-metric wkd-metric-hr">
          <span className="wkd-metric-label">דופק ממוצע</span>
          <div className="wkd-metric-value">
            <span className="wkd-metric-unit">BPM</span>
            <span className="wkd-metric-number">
              {displayAvgHr != null ? Math.round(displayAvgHr) : "-"}
            </span>
          </div>
        </div>
      </div>

      {/* ── HR Chart (high on page) ── */}
      {isRun && (
        <section className="wkd-hr-section">
          <div className="wkd-section-header">
            <h2>ניתוח דופק (HR)</h2>
            <span className="wkd-hr-load">{hrLoadLabel(workout.tssLike)}</span>
          </div>
          {hrSamples.length > 1 ? (
            <HeartRateChart samples={hrSamples} />
          ) : (
            <p className="wkd-empty-note">אין נתוני דופק מפורטים לאימון זה.</p>
          )}
        </section>
      )}

      {/* ── Splits table (visible directly) ── */}
      {isRun && splits.length > 0 && (
        <section className="wkd-splits-section">
          <div className="wkd-section-header">
            <h2>סגמנטים (Splits)</h2>
          </div>
          <div className="wkd-splits-table">
            <div className="wkd-splits-row wkd-splits-head">
              <span>ק״מ</span>
              <span>קצב (PACE)</span>
              <span>דופק ממוצע</span>
              <span>זמן מצטבר</span>
            </div>
            {splits.map((split) => (
              <div key={split.km} className="wkd-splits-row">
                <span className="wkd-split-km">{split.km}</span>
                <span style={{ color: split.km === bestPaceKm ? "#72dcff" : "inherit" }}>
                  {formatPace(split.paceMinPerKm)}
                </span>
                <span>{split.avgHr != null ? `${split.avgHr} bpm` : "-"}</span>
                <span>{formatClock(split.cumulativeSec)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Run Score (fold) ── */}
      {isRun && hrScore && (
        <details className="wkd-fold">
          <summary className="wkd-fold-summary">
            ציון ריצה
            <span className="wkd-fold-icon">›</span>
          </summary>
          <div className="wkd-fold-body">
            <div className="run-score-hero">
              <div className="run-score-main">
                <p>ציון ריצה</p>
                <strong>{hrScore.score}</strong>
                <span>{hrScore.label}</span>
              </div>
              <div className="run-score-bar">
                <span className="run-score-fill" style={{ width: `${hrScore.score}%` }} />
              </div>
              <p className="note">
                ציון = בסיס 80 + רציפות {hrScore.breakdown.continuity >= 0 ? "+" : ""}{hrScore.breakdown.continuity} + יציבות קצב {hrScore.breakdown.stability >= 0 ? "+" : ""}{hrScore.breakdown.stability} + עומס דופק {hrScore.breakdown.load >= 0 ? "+" : ""}{hrScore.breakdown.load} + משוב אישי {hrScore.breakdown.feedback >= 0 ? "+" : ""}{hrScore.breakdown.feedback}
              </p>
              {hrScore.reasons.length > 0 && (
                <p className="note">מה השפיע: {hrScore.reasons.slice(0, 3).join(" · ")}</p>
              )}
            </div>
          </div>
        </details>
      )}

      {/* ── Workout Summary (fold) ── */}
      <details className="wkd-fold">
        <summary className="wkd-fold-summary">
          סיכום אימון
          <span className="wkd-fold-icon">›</span>
        </summary>
        <div className="wkd-fold-body">
          <ul className="kv compact-kv">
            <li>סוג: {sportLabel(workout.sport)}</li>
            <li>תאריך ושעה: {formatDisplayDateTime(workout.startAt)}</li>
            <li>משך אימון (כולל עצירות): {formatClock(workout.durationSec)}</li>
            {detail.movingDurationSec != null && (
              <li>{isRun ? "משך ריצה בפועל" : "משך תנועה בפועל"}: {formatClock(detail.movingDurationSec)}</li>
            )}
            {showPauseRow && <li>זמן עצירות: {formatClock(detail.pauseDurationSec)}</li>}
            {isRun && (
              <li>
                זמן רשמי: {formatClock(runDisplayDurationSec)}
                <WorkoutOfficialDurationEditor
                  workoutId={workout.id}
                  currentOfficialDurationSec={runDisplayDurationSec}
                />
              </li>
            )}
            {showDistanceGap ? (
              <>
                <li>מרחק רשמי: {formatDistanceKm(detail.distanceOfficialKm)} ק"מ</li>
                <li>מרחק GPS בפועל: {formatDistanceKm(detail.distanceRawKm)} ק"מ</li>
              </>
            ) : (
              <li>מרחק: {formatDistanceKm(displayDistanceKm)} ק"מ</li>
            )}
            {isRun && runDisplayPaceMinPerKm != null && (
              <li>קצב: {formatPace(runDisplayPaceMinPerKm)} דק'/ק"מ</li>
            )}
            <li>דופק ממוצע: {displayAvgHr != null ? Math.round(displayAvgHr) : "-"}</li>
            <li>דופק מקס': {displayMaxHr != null ? Math.round(displayMaxHr) : "-"}</li>
            <li>טיפוס: {workout.elevationM ? `${Math.round(workout.elevationM)} מ'` : "-"}</li>
            <li>עומס: {Math.round(workout.tssLike)}</li>
            <li>מקור: {workout.source}</li>
            <li>
              נעל:{" "}
              {isRun ? (
                <WorkoutShoeInline workoutId={workout.id} currentShoeId={workout.shoeId ?? null} compact />
              ) : (
                workout.shoeName ?? "-"
              )}
            </li>
            {isRun && workout.shoeId && workout.shoeKmAtAssign != null && (
              <li>ק״מ בנעל אחרי האימון הזה: {formatShoeKm(workout.shoeKmAtAssign)}</li>
            )}
          </ul>
        </div>
      </details>

      {/* ── Route Map (fold) ── */}
      {hasRouteMap && (
        <details className="wkd-fold">
          <summary className="wkd-fold-summary">
            מפת מסלול
            <span className="wkd-fold-icon">›</span>
          </summary>
          <div className="wkd-fold-body">
            <WorkoutRouteMap segments={detail.routeSegments} />
          </div>
        </details>
      )}

      {/* ── Feedback (fold) ── */}
      <details className="wkd-fold">
        <summary className="wkd-fold-summary">
          משוב אחרי אימון
          <span className="wkd-fold-icon">›</span>
        </summary>
        <div className="wkd-fold-body">
          <FeedbackInline
            workoutId={workout.id}
            sport={workout.sport as "run" | "bike" | "swim" | "strength"}
            date={workout.startAt.slice(0, 10)}
          />
        </div>
      </details>

      {/* ── All Splits (fold, if isRun) ── */}
      {isRun && splits.length > 0 && (
        <details className="wkd-fold">
          <summary className="wkd-fold-summary">
            חלוקת קילומטרים
            <span className="wkd-fold-icon">›</span>
          </summary>
          <div className="wkd-fold-body">
            <div className="history-table workout-splits-table">
              <div className="history-row header">
                <span>ק״מ</span>
                <span>זמן מקטע</span>
                <span>זמן מצטבר</span>
                <span>קצב</span>
                <span>דופק ממוצע</span>
              </div>
              {splits.map((split) => (
                <div key={split.km} className="history-row">
                  <span>{split.km}</span>
                  <span>{formatClock(split.splitSec)}</span>
                  <span>{formatClock(split.cumulativeSec)}</span>
                  <span>{formatPace(split.paceMinPerKm)} דק'/ק"מ</span>
                  <span>{split.avgHr ?? "-"}</span>
                </div>
              ))}
            </div>
          </div>
        </details>
      )}

      {/* ── Best Efforts (fold, if isRun) ── */}
      {isRun && bestEfforts.length > 0 && (
        <details className="wkd-fold">
          <summary className="wkd-fold-summary">
            המקטעים הטובים ביותר
            <span className="wkd-fold-icon">›</span>
          </summary>
          <div className="wkd-fold-body">
            <div className="efforts-grid">
              {bestEfforts.map((effort) => (
                <article key={effort.id} className="effort-card">
                  <div className="effort-topline">
                    <strong>{effortDistanceLabel(effort.distanceKey, effort.distanceKm)}</strong>
                    <span>{formatClock(effort.timeSec)}</span>
                  </div>
                  <div className="effort-meta">
                    <span>{formatPace(effort.paceMinPerKm)} דק'/ק"מ</span>
                  </div>
                  {effort.segmentStartSec != null && effort.segmentEndSec != null && (
                    <div className="effort-meta">
                      <span>{formatClock(effort.segmentStartSec)} – {formatClock(effort.segmentEndSec)}</span>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>
        </details>
      )}

    </div>
  );
}
