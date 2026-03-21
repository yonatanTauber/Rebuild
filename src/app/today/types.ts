import type { CoachAgentReport } from "@/lib/coach-agent";

export type TodayData = {
  readinessScore: number;
  fatigueScore: number;
  fitnessScore: number;
  stateTag?: "overtraining_risk" | "on_the_spot" | "peaking" | "losing_momentum";
  stateLabel?: string;
  stateHint?: string;
  recommendation: string;
  explanation: string;
  alerts: string[];
  todayWorkouts?: Array<{
    id: string;
    sport: "run" | "bike" | "swim" | "strength";
    startAt: string;
    durationSec: number;
    distanceM: number | null;
    distanceDisplayKm?: number | null;
    distanceRawKm?: number | null;
    distanceOfficialKm?: number | null;
    durationForPaceSec?: number | null;
    movingDurationSec?: number | null;
    pauseDurationSec?: number | null;
    paceDisplayMinPerKm?: number | null;
    avgHr?: number | null;
    tssLike?: number | null;
    runScore?: number | null;
    runScoreLabel?: string | null;
  }>;
  coachAgent?: CoachAgentReport | null;
};

export type Recommendation = {
  workoutType: string;
  durationMin: number;
  intensityZone: string;
  explanationFactors: string[];
  confidence: number;
  longExplanation: string;
  rationaleDetails: string[];
  dayStatus?: "target_done" | "can_add_short" | "more_possible";
  dayStatusText?: string;
  primarySession: {
    sport: "run" | "bike" | "swim";
    sessionName: string;
    durationMin: number;
    target: string;
    structure: string;
    why: string;
  };
  alternativeSessions: Array<{
    sport: "run" | "bike" | "swim";
    sessionName: string;
    durationMin: number;
    target: string;
    structure: string;
    why: string;
  }>;
};
