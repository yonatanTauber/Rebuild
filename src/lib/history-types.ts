export type HistoryFilter = {
  from: string;
  to: string;
  minDistance: string;
  maxDistance: string;
  minPace: string;
  maxPace: string;
  sport: "run" | "bike" | "swim" | "strength";
};

export type HistoryWorkout = {
  id: string;
  sport: "run" | "bike" | "swim" | "strength";
  startAt: string;
  distanceM: number | null;
  distanceDisplayKm?: number | null;
  distanceRawKm?: number | null;
  distanceOfficialKm?: number | null;
  durationSec: number;
  durationForPaceSec?: number | null;
  movingDurationSec?: number | null;
  pauseDurationSec?: number | null;
  tssLike: number;
  paceMinPerKm: number | null;
  source?: string;
  shoeName?: string | null;
};

export type HistorySummary = {
  totalCount: number;
  totalKm: number;
  avgPace: number | null;
  bestPace: number | null;
};

export type HistoryResult = {
  filters: { from: string; to: string; sport?: string };
  summary: HistorySummary;
  workouts: HistoryWorkout[];
};
