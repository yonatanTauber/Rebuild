import Link from "next/link";
import FeedbackInline from "@/components/workout-feedback-inline";
import HeartRateChart from "@/components/heart-rate-chart";
import WorkoutOfficialDurationEditor from "@/components/workout-official-duration-editor";
import WorkoutShoeInline from "@/components/workout-shoe-inline";
import WorkoutRouteMap from "@/components/workout-route-map-lazy";
import { WorkoutBanner, buildWorkoutBannerMetrics } from "@/components/workout-banner";
import { Section } from "@/components/cards";
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
  return `${min}:${String(sec).padStart(2, "0")} דק'/ק"מ`;
}

function formatDistanceKm(distanceKm: number | null) {
  if (distanceKm == null || !Number.isFinite(distanceKm)) return "-";
  const rounded = Math.round(distanceKm * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(2)} ק"מ`;
}

function formatShoeKm(km: number | null | undefined) {
  if (km == null || !Number.isFinite(km)) return "-";
  return `${km.toFixed(1)} ק"מ`;
}

function effortDistanceLabel(distanceKey: string, distanceKm: number) {
  if (distanceKey === "half") return "חצי מרתון";
  return `${Number.isInteger(distanceKm) ? distanceKm.toFixed(0) : distanceKm.toFixed(1)} ק"מ`;
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
  const showRunScoreTop = Boolean(isRun && hrScore);
  const bannerMetrics = buildWorkoutBannerMetrics({
    sport: workout.sport,
    durationSec: workout.durationSec,
    distanceKm: detail.distanceOfficialKm ?? detail.distanceRawKm,
    paceMinPerKm: runDisplayPaceMinPerKm,
    avgHr: displayAvgHr,
    load: workout.tssLike
  });

  const sportIconChar = workout.sport === "run" ? "🏃" : workout.sport === "bike" ? "🚴" : workout.sport === "strength" ? "💪" : "🏊";
  const sportColorVal = workout.sport === "run" ? "#72dcff" : workout.sport === "bike" ? "#fdd848" : workout.sport === "strength" ? "#fd8b00" : "#c3ffcd";
  const displayDistanceKm = detail.distanceOfficialKm ?? detail.distanceRawKm;

  return (
    <div className="workout-kinetic-page">
      <div className="workout-kinetic-back-bar">
        {adjacent.previous ? (
          <Link href={workoutDetailPath(adjacent.previous.id)} className="workout-kinetic-adj-btn" title="אימון קודם">‹</Link>
        ) : (
          <span className="workout-kinetic-adj-btn disabled">‹</span>
        )}
        <Link href="/log" className="workout-kinetic-back-link">← יומן אימונים</Link>
        {adjacent.next ? (
          <Link href={workoutDetailPath(adjacent.next.id)} className="workout-kinetic-adj-btn" title="אימון הבא">›</Link>
        ) : (
          <span className="workout-kinetic-adj-btn disabled">›</span>
        )}
      </div>

      <div className="workout-kinetic-hero">
        <div className="workout-kinetic-hero-left">
          <span className="workout-kinetic-session-label">SESSION OVERVIEW</span>
          <h1 style={{ color: sportColorVal }}>{sportLabel(workout.sport)}</h1>
          <p>{formatDisplayDateTime(workout.startAt)}</p>
        </div>
        <div className="workout-kinetic-hero-right">
          <span className="workout-kinetic-sport-icon">{sportIconChar}</span>
        </div>
      </div>

      <div className="workout-kinetic-bento">
        {displayDistanceKm != null ? (
          <div className="workout-kinetic-metric">
            <span className="workout-kinetic-metric-label">מרחק</span>
            <span className="workout-kinetic-metric-number">{displayDistanceKm.toFixed(2)}</span>
            <span className="workout-kinetic-metric-unit">ק"מ</span>
          </div>
        ) : null}
        <div className="workout-kinetic-metric">
          <span className="workout-kinetic-metric-label">זמן</span>
          <span className="workout-kinetic-metric-number">{formatClock(runDisplayDurationSec)}</span>
          <span className="workout-kinetic-metric-unit">שע:דק:שנ</span>
        </div>
        {displayAvgHr != null ? (
          <div className="workout-kinetic-metric">
            <span className="workout-kinetic-metric-label">דופק ממוצע</span>
            <span className="workout-kinetic-metric-number">{Math.round(displayAvgHr)}</span>
            <span className="workout-kinetic-metric-unit">bpm</span>
          </div>
        ) : null}
        <div className="workout-kinetic-metric">
          <span className="workout-kinetic-metric-label">עומס</span>
          <span className="workout-kinetic-metric-number">{Math.round(workout.tssLike)}</span>
          <span className="workout-kinetic-metric-unit">TSS</span>
        </div>
      </div>

      <div className={showRunScoreTop ? "workout-detail-top-grid has-score" : "workout-detail-top-grid"}>
        <div className="workout-detail-banner-shell">
          <WorkoutBanner sport={workout.sport} metrics={bannerMetrics} runScore={null} />
        </div>
        {isRun && hrScore ? (
          <section className="run-score-hero">
            <div className="run-score-main">
              <p>ציון ריצה</p>
              <strong>{hrScore.score}</strong>
              <span>{hrScore.label}</span>
            </div>
            <div className="run-score-bar">
              <span className="run-score-fill" style={{ width: `${hrScore.score}%` }} />
            </div>
            <p className="note">
              ציון = בסיס 80 + רציפות {hrScore.breakdown.continuity >= 0 ? "+" : ""}
              {hrScore.breakdown.continuity} + יציבות קצב {hrScore.breakdown.stability >= 0 ? "+" : ""}
              {hrScore.breakdown.stability} + עומס דופק {hrScore.breakdown.load >= 0 ? "+" : ""}
              {hrScore.breakdown.load} + משוב אישי {hrScore.breakdown.feedback >= 0 ? "+" : ""}
              {hrScore.breakdown.feedback}
            </p>
            {hrScore.reasons.length > 0 ? (
              <p className="note">מה השפיע הכי הרבה: {hrScore.reasons.slice(0, 3).join(" · ")}</p>
            ) : null}
          </section>
        ) : null}
      </div>

      {hasRouteMap ? (
        <div className="two-col-panels">
          <Section title="סיכום אימון" subtitle="כל המידע שזמין כרגע במערכת">
            <ul className="kv compact-kv">
              <li>סוג: {sportLabel(workout.sport)}</li>
              <li>תאריך ושעה: {formatDisplayDateTime(workout.startAt)}</li>
              <li>משך אימון (כולל עצירות): {formatClock(workout.durationSec)}</li>
              {detail.movingDurationSec != null ? (
                <li>{isRun ? "משך ריצה בפועל" : "משך תנועה בפועל"}: {formatClock(detail.movingDurationSec)}</li>
              ) : null}
              {showPauseRow ? <li>זמן עצירות: {formatClock(detail.pauseDurationSec)}</li> : null}
              {isRun ? (
                <li>
                  זמן רשמי: {formatClock(runDisplayDurationSec)}
                  <WorkoutOfficialDurationEditor
                    workoutId={workout.id}
                    currentOfficialDurationSec={runDisplayDurationSec}
                  />
                </li>
              ) : null}
              {showDistanceGap ? (
                <>
                  <li>מרחק רשמי: {formatDistanceKm(detail.distanceOfficialKm)}</li>
                  <li>מרחק GPS בפועל: {formatDistanceKm(detail.distanceRawKm)}</li>
                </>
              ) : (
                <li>מרחק: {formatDistanceKm(detail.distanceOfficialKm ?? detail.distanceRawKm)}</li>
              )}
              {isRun ? <li>קצב ריצה בפועל: {formatPace(runDisplayPaceMinPerKm)}</li> : null}
              <li>דופק ממוצע: {displayAvgHr != null ? Math.round(displayAvgHr) : "-"}</li>
              <li>דופק מקס': {displayMaxHr != null ? Math.round(displayMaxHr) : "-"}</li>
              <li>טיפוס: {workout.elevationM ? `${Math.round(workout.elevationM)} מ'` : "-"}</li>
              <li>עומס: {Math.round(workout.tssLike)}</li>
              <li>מקור: {workout.source}</li>
              <li>
                נעל:{" "}
                {isRun ? (
                  <WorkoutShoeInline
                    workoutId={workout.id}
                    currentShoeId={workout.shoeId ?? null}
                    compact
                  />
                ) : (
                  workout.shoeName ?? "-"
                )}
              </li>
              {isRun && workout.shoeId && workout.shoeKmAtAssign != null ? (
                <li>ק״מ בנעל אחרי האימון הזה: {formatShoeKm(workout.shoeKmAtAssign)}</li>
              ) : isRun && workout.shoeId ? (
                <li>ק״מ באימון הזה עדיין לא קובע. בחר נעל מחדש פעם אחת כדי לשמור ערך קבוע.</li>
              ) : null}
            </ul>
          </Section>

          <Section title="מפת מסלול" subtitle="תוצג כשקיימים נתוני מסלול לאימון">
            <WorkoutRouteMap segments={detail.routeSegments} />
          </Section>
        </div>
      ) : (
        <Section title="סיכום אימון" subtitle="כל המידע שזמין כרגע במערכת">
          <ul className="kv compact-kv">
            <li>סוג: {sportLabel(workout.sport)}</li>
            <li>תאריך ושעה: {formatDisplayDateTime(workout.startAt)}</li>
            <li>משך אימון: {formatClock(workout.durationSec)}</li>
            {workout.sport !== "strength" ? (
              <li>מרחק: {formatDistanceKm(detail.distanceOfficialKm ?? detail.distanceRawKm)}</li>
            ) : null}
            <li>דופק ממוצע: {displayAvgHr != null ? Math.round(displayAvgHr) : "-"}</li>
            <li>דופק מקס': {displayMaxHr != null ? Math.round(displayMaxHr) : "-"}</li>
            {workout.sport === "run" || workout.sport === "bike" ? (
              <li>טיפוס: {workout.elevationM ? `${Math.round(workout.elevationM)} מ'` : "-"}</li>
            ) : null}
            <li>עומס: {Math.round(workout.tssLike)}</li>
            <li>מקור: {workout.source}</li>
          </ul>
        </Section>
      )}

      {isRun && (
        <div className="two-col-panels">
          <Section title="משוב אחרי אימון" subtitle="תקציר קומפקטי עם אפשרות עריכה">
            <FeedbackInline
              workoutId={workout.id}
              sport={workout.sport as "run" | "bike" | "swim" | "strength"}
              date={workout.startAt.slice(0, 10)}
            />
          </Section>

          <Section title="חלוקת קילומטרים" subtitle="כל ק״מ בנפרד לפי זמן, קצב ודופק">
            {splits.length > 0 ? (
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
                    <span>{formatPace(split.paceMinPerKm)}</span>
                    <span>{split.avgHr ?? "-"}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="note">אין מספיק נתוני מסלול כדי לחשב חלוקת קילומטרים.</p>
            )}
          </Section>
        </div>
      )}

      {!isRun && (
        <Section title="משוב אחרי אימון" subtitle="סיכום תחושה ומאמץ">
          <FeedbackInline
            workoutId={workout.id}
            sport={workout.sport as "run" | "bike" | "swim" | "strength"}
            date={workout.startAt.slice(0, 10)}
          />
        </Section>
      )}

      {isRun && (
        <Section title="המקטעים הטובים באימון הזה" subtitle="זמני שיא בתוך האימון לפי מרחק">
          {bestEfforts.length > 0 ? (
            <div className="efforts-grid">
              {bestEfforts.map((effort) => (
                <article key={effort.id} className="effort-card">
                  <div className="effort-topline">
                    <strong>{effortDistanceLabel(effort.distanceKey, effort.distanceKm)}</strong>
                    <span>{formatClock(effort.timeSec)}</span>
                  </div>
                  <div className="effort-meta">
                    <span>{formatPace(effort.paceMinPerKm)}</span>
                  </div>
                  {effort.segmentStartSec != null && effort.segmentEndSec != null && (
                    <div className="effort-meta">
                      <span>מתוך {formatClock(effort.segmentStartSec)} עד {formatClock(effort.segmentEndSec)}</span>
                    </div>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <p className="note">אין עדיין מקטעים מחושבים לריצה הזו.</p>
          )}
        </Section>
      )}

      {isRun && (
        <Section title="גרף דופק" subtitle="דופק לאורך הריצה, לפי הנתונים שנקלטו בקובץ">
          {hrSamples.length > 1 ? (
            <HeartRateChart samples={hrSamples} />
          ) : (
            <p className="note">אין נתוני דופק מפורטים בקובץ של האימון הזה.</p>
          )}
        </Section>
      )}

      <Link href="/log" className="note">
        חזרה ליומן
      </Link>
    </div>
  );
}

