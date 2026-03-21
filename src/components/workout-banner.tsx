export type WorkoutBannerMetricItem = {
  title: string;
  value: string;
};

export type WorkoutBannerMetrics = {
  topLeading?: WorkoutBannerMetricItem | null;
  topTrailing?: WorkoutBannerMetricItem | null;
  bottomLeading?: WorkoutBannerMetricItem | null;
  bottomTrailing?: WorkoutBannerMetricItem | null;
};

export type WorkoutBannerMetricsInput = {
  sport: string;
  durationSec: number;
  distanceKm?: number | null;
  paceMinPerKm?: number | null;
  avgHr?: number | null;
  load?: number | null;
};

function formatDuration(sec: number) {
  const safe = Math.max(0, Math.round(sec));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function normalizedSportKey(sport: string) {
  const key = String(sport || "").trim().toLowerCase();
  if (["run", "ריצה"].includes(key)) return "run";
  if (["bike", "אופניים"].includes(key)) return "bike";
  if (["swim", "swimming", "pool_swim", "pool swim", "שחייה"].includes(key)) return "swim";
  if (["strength", "strength_training", "strength training", "gym", "כוח", "כח"].includes(key)) return "strength";
  return key || "run";
}

function sportBannerImage(sport: string) {
  const key = normalizedSportKey(sport);
  if (key === "run") return "/banners/run_banner.jpg";
  if (key === "swim") return "/banners/swim_banner.jpg";
  if (key === "strength") return "/banners/strength_banner.jpg";
  return null;
}

function scoreChip(score: number) {
  return (
    <div className="workout-banner-score" aria-label={`ציון ${score}`}>
      <span>ציון</span>
      <strong>{score}</strong>
    </div>
  );
}

function metricChip(metric: WorkoutBannerMetricItem, trailing = false) {
  return (
    <div className={trailing ? "workout-banner-chip trail" : "workout-banner-chip"} key={`${metric.title}-${metric.value}`}>
      <span>{metric.title}</span>
      <strong>{metric.value}</strong>
    </div>
  );
}

export function buildWorkoutBannerMetrics(input: WorkoutBannerMetricsInput): WorkoutBannerMetrics {
  const sport = normalizedSportKey(input.sport);
  const items: WorkoutBannerMetricItem[] = [{ title: "משך", value: formatDuration(input.durationSec) }];

  if (sport !== "strength") {
    if (input.distanceKm != null && Number.isFinite(input.distanceKm) && input.distanceKm > 0) {
      items.push({ title: "מרחק", value: `${input.distanceKm.toFixed(1)} ק״מ` });
    }
    if (input.paceMinPerKm != null && Number.isFinite(input.paceMinPerKm) && input.paceMinPerKm > 0) {
      const totalSec = Math.round(input.paceMinPerKm * 60);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      items.push({ title: "קצב", value: `${min}:${String(sec).padStart(2, "0")}` });
    }
  }

  if (input.avgHr != null && Number.isFinite(input.avgHr) && input.avgHr > 0) {
    items.push({ title: "דופק", value: `${Math.round(input.avgHr)} bpm` });
  }
  if (input.load != null && Number.isFinite(input.load)) {
    items.push({ title: "עומס", value: `${Math.round(input.load)}` });
  }

  const unique: WorkoutBannerMetricItem[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!item.value || item.value === "-" || seen.has(item.title)) continue;
    seen.add(item.title);
    unique.push(item);
  }
  const limited = unique.slice(0, 4);
  return {
    topLeading: limited[0] ?? null,
    topTrailing: limited[1] ?? null,
    bottomLeading: limited[2] ?? null,
    bottomTrailing: limited[3] ?? null
  };
}

export function WorkoutBanner({
  sport,
  metrics,
  runScore,
  className
}: {
  sport: string;
  metrics: WorkoutBannerMetrics;
  runScore?: number | null;
  className?: string;
}) {
  const sportKey = normalizedSportKey(sport);
  const banner = sportBannerImage(sport);
  const allMetrics = [metrics.topLeading, metrics.topTrailing, metrics.bottomLeading, metrics.bottomTrailing].filter(
    Boolean
  ) as WorkoutBannerMetricItem[];
  const firstRow = allMetrics.slice(0, 2);
  const secondRow = allMetrics.slice(2, 4);

  return (
    <div className={["workout-banner", `workout-banner--${sportKey}`, className].filter(Boolean).join(" ")}>
      {banner ? (
        <div className="workout-banner-bg" style={{ backgroundImage: `url(${banner})` }} aria-hidden />
      ) : (
        <div className={`workout-banner-bg workout-banner-fallback sport-${sportKey}`} aria-hidden />
      )}
      <div className={sportKey === "swim" ? "workout-banner-overlay swim" : "workout-banner-overlay"}>
        {sportKey === "swim" ? (
          <div className="workout-banner-metrics-swim">
            {firstRow.length > 0 && <div className="workout-banner-row">{firstRow.map((item) => metricChip(item))}</div>}
            {secondRow.length > 0 && (
              <div className="workout-banner-row">{secondRow.map((item) => metricChip(item))}</div>
            )}
          </div>
        ) : (
          <>
            <div className="workout-banner-row">
              {metrics.topLeading ? metricChip(metrics.topLeading) : <span />}
              {metrics.topTrailing ? metricChip(metrics.topTrailing, true) : <span />}
            </div>
            <div className="workout-banner-row bottom">
              {metrics.bottomLeading ? metricChip(metrics.bottomLeading) : <span />}
              {metrics.bottomTrailing ? metricChip(metrics.bottomTrailing, true) : <span />}
            </div>
          </>
        )}
      </div>
      {sportKey !== "run" && runScore != null && Number.isFinite(runScore) ? (
        <div className="workout-banner-score-wrap">{scoreChip(Math.round(runScore))}</div>
      ) : null}
    </div>
  );
}
