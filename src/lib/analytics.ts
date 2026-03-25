import { getTopEfforts, getWorkouts } from "@/lib/db";
import { formatISODate } from "@/lib/date";
import type { Sport, Workout } from "@/lib/types";
import { PB_DISTANCES } from "@/lib/pb-engine";
import { cloudEnabled, cloudGetTopEfforts, cloudGetWorkoutsSince } from "@/lib/cloud-db";

function km(workout: Workout) {
  return Math.max(0, (workout.distanceM ?? 0) / 1000);
}

function paceMinPerKm(workout: Workout) {
  const distanceKm = km(workout);
  if (distanceKm <= 0 || workout.durationSec <= 0) return null;
  return workout.durationSec / 60 / distanceKm;
}

function inYear(workout: Workout, year: number) {
  return new Date(workout.startAt).getFullYear() === year;
}

function toOneDec(value: number) {
  return Math.round(value * 10) / 10;
}

type BuildRangeArgs = {
  sport: Sport;
  year?: number;
  fromYear?: number;
  toYear?: number;
  fromDate?: string;
  toDate?: string;
  shoeId?: string | null;
  allYears?: boolean;
};

function wholeWorkoutToleranceKm(targetKm: number) {
  if (targetKm <= 3) return 0.1;
  if (targetKm <= 5) return 0.12;
  if (targetKm <= 10) return 0.18;
  if (targetKm <= 16) return 0.28;
  if (targetKm <= 25) return 0.4;
  if (targetKm >= 30) return 1.2;
  return 0.6;
}

function buildCloudWholeWorkoutPbs(workouts: Workout[]) {
  const runs = workouts.filter((w) => w.sport === "run" && (w.distanceM ?? 0) > 0 && w.durationSec > 0);
  return PB_DISTANCES.map((target) => {
    const tolerance = wholeWorkoutToleranceKm(target.km);
    const candidates = runs.filter((w) => Math.abs(((w.distanceM ?? 0) / 1000) - target.km) <= tolerance);
    const best = candidates.sort((a, b) => a.durationSec - b.durationSec || Date.parse(b.startAt) - Date.parse(a.startAt))[0];
    const pace = best ? best.durationSec / 60 / target.km : null;
    return {
      distanceKey: target.key,
      distanceLabel: target.label,
      distanceKm: target.km,
      bestTimeSec: best ? Math.round(best.durationSec) : null,
      paceMinPerKm: pace != null ? toOneDec(pace) : null,
      workoutId: best?.id ?? null,
      date: best?.startAt?.slice(0, 10) ?? null,
      source: best ? ("whole_workout" as const) : null
    };
  });
}

async function buildCloudPbs() {
  const pbs = [];
  for (const target of PB_DISTANCES) {
    const includeSegments = target.key === "1k" || target.key === "3k";
    const top = await cloudGetTopEfforts(target.key, 1, includeSegments);
    const best = top[0];
    pbs.push({
      distanceKey: target.key,
      distanceLabel: target.label,
      distanceKm: target.km,
      bestTimeSec: best ? Math.round(best.timeSec) : null,
      paceMinPerKm: best ? toOneDec(best.paceMinPerKm) : null,
      workoutId: best?.workoutId ?? null,
      date: best?.workoutStartAt?.slice(0, 10) ?? null,
      source: best?.source ?? null
    });
  }
  return pbs;
}

export async function buildAnalytics(args: BuildRangeArgs) {
  const { sport, fromYear, toYear, fromDate, toDate, shoeId, allYears } = args;
  const today = formatISODate();
  const todayDate = new Date(`${today}T00:00:00.000Z`);
  const currentYear = todayDate.getUTCFullYear();
  const currentMonth = todayDate.getUTCMonth() + 1;

  const sourceWorkouts = cloudEnabled()
    ? (await cloudGetWorkoutsSince("1900-01-01T00:00:00.000Z")) as Workout[]
    : getWorkouts(100000);
  const allSportWorkouts = sourceWorkouts.filter((w) => w.sport === sport);
  const workouts =
    sport === "run" && shoeId
      ? allSportWorkouts.filter((w) => (shoeId === "unassigned" ? !w.shoeId : (w.shoeId ?? "") === shoeId))
      : allSportWorkouts;

  const yearSet = new Set<number>();
  for (const w of workouts) {
    yearSet.add(new Date(w.startAt).getFullYear());
  }

  let availableYears = Array.from(yearSet).sort((a, b) => b - a);
  if (sport === "swim") {
    availableYears = availableYears.filter((y) => y >= currentYear);
    if (!availableYears.length) availableYears = [currentYear];
  }
  if (!availableYears.length) availableYears = [currentYear];

  const ascendingYears = [...availableYears].sort((a, b) => a - b);
  const earliestYear = ascendingYears[0] ?? currentYear;
  const latestYear = ascendingYears[ascendingYears.length - 1] ?? currentYear;

  const defaultFromYear = allYears ? earliestYear : fromYear ?? latestYear;
  const defaultToYear = allYears ? latestYear : toYear ?? defaultFromYear;
  const rangeFromYear = Math.min(defaultFromYear, defaultToYear);
  const rangeToYear = Math.max(defaultFromYear, defaultToYear);

  const targetYear = args.year ?? rangeToYear;
  const safeYear = availableYears.includes(targetYear) ? targetYear : availableYears[0];

  const yearlyMap = new Map<number, { km: number; workouts: number }>();
  for (const w of workouts) {
    const y = new Date(w.startAt).getFullYear();
    if (sport === "swim" && y < currentYear) continue;
    const prev = yearlyMap.get(y) ?? { km: 0, workouts: 0 };
    prev.km += km(w);
    prev.workouts += 1;
    yearlyMap.set(y, prev);
  }

  const yearly = Array.from(yearlyMap.entries())
    .map(([y, data]) => ({ year: y, km: toOneDec(data.km), workouts: data.workouts }))
    .sort((a, b) => a.year - b.year);

  const rangeStart = fromDate ? new Date(`${fromDate}T00:00:00.000Z`) : null;
  const rangeEnd = toDate ? new Date(`${toDate}T23:59:59.999Z`) : null;

  const rangeWorkouts = workouts.filter((w) => {
    const startedAt = new Date(w.startAt);
    if (rangeStart && startedAt < rangeStart) return false;
    if (rangeEnd && startedAt > rangeEnd) return false;
    if (rangeStart || rangeEnd) return true;
    const y = startedAt.getFullYear();
    return y >= rangeFromYear && y <= rangeToYear;
  });
  const selectedYearWorkouts = workouts.filter((w) => inYear(w, safeYear));
  const monthly = Array.from({ length: 12 }).map((_, idx) => {
    const month = idx + 1;
    const monthWorkouts = selectedYearWorkouts.filter((w) => new Date(w.startAt).getMonth() + 1 === month);
    const monthKm = monthWorkouts.reduce((sum, w) => sum + km(w), 0);
    const paces = monthWorkouts.map(paceMinPerKm).filter((x): x is number => x != null);
    const avgPace = paces.length ? toOneDec(paces.reduce((s, p) => s + p, 0) / paces.length) : null;
    return {
      month,
      km: toOneDec(monthKm),
      workouts: monthWorkouts.length,
      avgPaceMinPerKm: avgPace
    };
  });

  const yearKm = monthly.reduce((sum, m) => sum + m.km, 0);
  const monthKm = monthly.find((m) => m.month === currentMonth)?.km ?? 0;
  const allYearWorkouts = workouts.filter((w) => inYear(w, currentYear));
  const currentYearKm = toOneDec(allYearWorkouts.reduce((sum, w) => sum + km(w), 0));

  const rangeKm = toOneDec(rangeWorkouts.reduce((sum, w) => sum + km(w), 0));
  const rangeWorkoutsCount = rangeWorkouts.length;
  const rangePaces = rangeWorkouts.map(paceMinPerKm).filter((x): x is number => x != null);
  const rangeAvgPace = rangePaces.length ? toOneDec(rangePaces.reduce((s, p) => s + p, 0) / rangePaces.length) : null;

  const runWorkouts = rangeWorkouts.filter((w) => w.sport === "run" && (w.distanceM ?? 0) > 0);

  const distanceBuckets = [
    { id: "short", label: "עד 5 ק\"מ", min: 0, max: 5 },
    { id: "mid", label: "5-10 ק\"מ", min: 5, max: 10 },
    { id: "long", label: "10-15 ק\"מ", min: 10, max: 15 },
    { id: "very_long", label: "15-21.1 ק\"מ", min: 15, max: 21.1 },
    { id: "ultra", label: "21.1+ ק\"מ", min: 21.1, max: Number.POSITIVE_INFINITY }
  ];

  const durationBuckets = [
    { id: "d1", label: "עד 30 דק'", min: 0, max: 30 },
    { id: "d2", label: "30-45 דק'", min: 30, max: 45 },
    { id: "d3", label: "45-60 דק'", min: 45, max: 60 },
    { id: "d4", label: "60-90 דק'", min: 60, max: 90 },
    { id: "d5", label: "90+ דק'", min: 90, max: Number.POSITIVE_INFINITY }
  ];

  const paceBuckets = [
    { id: "p1", label: "<4:30 דק'/ק\"מ", min: 0, max: 4.5 },
    { id: "p2", label: "4:30-5:00", min: 4.5, max: 5 },
    { id: "p3", label: "5:00-5:30", min: 5, max: 5.5 },
    { id: "p4", label: "5:30-6:00", min: 5.5, max: 6 },
    { id: "p5", label: "6:00+", min: 6, max: Number.POSITIVE_INFINITY }
  ];

  const runBreakdown = {
    byDistance: distanceBuckets.map((bucket) => {
      const rows = runWorkouts.filter((w) => {
        const d = km(w);
        return d >= bucket.min && d < bucket.max;
      });
      return {
        id: bucket.id,
        label: bucket.label,
        count: rows.length,
        km: toOneDec(rows.reduce((sum, w) => sum + km(w), 0))
      };
    }),
    byDuration: durationBuckets.map((bucket) => {
      const rows = runWorkouts.filter((w) => {
        const durationMin = w.durationSec / 60;
        return durationMin >= bucket.min && durationMin < bucket.max;
      });
      return {
        id: bucket.id,
        label: bucket.label,
        count: rows.length
      };
    }),
    byPace: paceBuckets.map((bucket) => {
      const rows = runWorkouts.filter((w) => {
        const p = paceMinPerKm(w);
        if (p == null) return false;
        return p >= bucket.min && p < bucket.max;
      });
      return {
        id: bucket.id,
        label: bucket.label,
        count: rows.length
      };
    })
  };

  const runShoesMap = new Map<string, { id: string; name: string; runs: number; km: number }>();
  for (const row of runWorkouts) {
    const id = row.shoeId ?? "unassigned";
    const name = row.shoeName ?? "ללא שיוך";
    const prev = runShoesMap.get(id) ?? { id, name, runs: 0, km: 0 };
    prev.runs += 1;
    prev.km += km(row);
    runShoesMap.set(id, prev);
  }
  const runShoes = Array.from(runShoesMap.values())
    .map((row) => ({ ...row, km: toOneDec(row.km) }))
    .sort((a, b) => b.km - a.km);

  const todayRuns = runWorkouts
    .filter((w) => w.startAt.slice(0, 10) === today)
    .map((w) => ({
      id: w.id,
      startAt: w.startAt,
      distanceKm: toOneDec(km(w)),
      durationSec: w.durationSec,
      shoeName: w.shoeName ?? "ללא שיוך"
    }));

  const pbs = cloudEnabled()
    ? await buildCloudPbs()
    : PB_DISTANCES.map((target) => {
        const includeSegments = target.key === "1k" || target.key === "3k";
        const [best] = getTopEfforts(target.key, 1, includeSegments);
        return {
          distanceKey: target.key,
          distanceLabel: target.label,
          distanceKm: target.km,
          bestTimeSec: best ? Math.round(best.timeSec) : null,
          paceMinPerKm: best ? toOneDec(best.paceMinPerKm) : null,
          workoutId: best?.workoutId ?? null,
          date: best?.workoutStartAt?.slice(0, 10) ?? null,
          source: best?.source ?? null
        };
      });

  const rangeSummary = {
    totalCount: rangeWorkoutsCount,
    totalKm: rangeKm,
    avgPace: rangeAvgPace
  };

  return {
    sport,
    selectedShoeId: shoeId,
    currentYear,
    selectedYear: safeYear,
    availableYears,
    rangeFromYear,
    rangeToYear,
    rangeSummary,
    summary: {
      selectedYearKm: toOneDec(yearKm),
      currentYearKm,
      currentMonthKm: toOneDec(monthKm)
    },
    yearly,
    monthly,
    runBreakdown,
    runShoes,
    todayRuns,
    pbs
  };
}
