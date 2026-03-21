import { computeScores } from '@/lib/engine';
import { addDaysISO, formatLocalISODate, parseLocalISODate, startOfTrainingWeekISO, weekdayISO } from '@/lib/date';
import { getDb, getTopEfforts } from '@/lib/db';
import type { PBDistanceKey, Sport } from '@/lib/types';

type InsightRangeKey = '30d' | '12w' | '365d' | 'all';
export type InsightPresetKey =
  | 'pain_after_run'
  | 'best_morning_runs'
  | 'pb_context'
  | 'fueling_vs_good_runs'
  | 'load_vs_drop'
  | 'period_compare';

export type InsightVisualSpec =
  | {
      kind: 'bars';
      label: string;
      valueSuffix?: string;
      series: Array<{ label: string; value: number; tone?: 'default' | 'accent' | 'muted' }>;
    }
  | {
      kind: 'compare';
      label: string;
      left: { label: string; value: string };
      right: { label: string; value: string };
      metrics: Array<{ label: string; left: string; right: string }>;
    };

export type InsightEvidenceRow = {
  id: string;
  title: string;
  subtitle?: string;
  metrics: Array<{ label: string; value: string }>;
  href?: string;
};

export type InsightResult = {
  id: string;
  title: string;
  question: string;
  summary: string;
  summaryDetail?: string;
  visualSpec: InsightVisualSpec;
  rows: InsightEvidenceRow[];
  sampleSize: number;
  links: Array<{ label: string; href: string }>;
};

export type InsightQueryAggregate = 'count' | 'sum' | 'avg' | 'min' | 'max' | 'rate';
export type InsightQueryEntity = 'day' | 'workout';
export type InsightGroupBy = 'none' | 'month' | 'week' | 'weekday' | 'sport' | 'shoe' | 'pain_area' | 'meal_slot' | 'fueling_item';
export type InsightMetricKey =
  | 'workoutCount'
  | 'totalLoad'
  | 'runKm'
  | 'runMinutes'
  | 'readiness'
  | 'fatigue'
  | 'fitness'
  | 'sleepHours'
  | 'sleepQuality'
  | 'hrv'
  | 'restingHr'
  | 'mood'
  | 'sorenessGlobal'
  | 'actualKcal'
  | 'actualProteinG'
  | 'actualCarbsG'
  | 'actualFatG'
  | 'fuelingCarbsG'
  | 'fuelingEntries'
  | 'distanceKm'
  | 'durationMin'
  | 'paceMinPerKm'
  | 'avgHr'
  | 'maxHr'
  | 'elevationM'
  | 'tssLike'
  | 'trimp'
  | 'hasPain'
  | 'hasPreRunMeal'
  | 'hasFueling'
  | 'hasBestEffort';

export type InsightQueryInput = {
  entity: InsightQueryEntity;
  aggregate: InsightQueryAggregate;
  metric: InsightMetricKey;
  groupBy: InsightGroupBy;
  range: InsightRangeKey;
  sport?: Sport | 'all';
  from?: string;
  to?: string;
  filters?: {
    sport?: Sport | 'all';
    minDistanceKm?: number;
    maxDistanceKm?: number;
    minDurationMin?: number;
    maxDurationMin?: number;
    minLoad?: number;
    maxLoad?: number;
    minReadiness?: number;
    maxReadiness?: number;
    minFatigue?: number;
    maxFatigue?: number;
    minFitness?: number;
    maxFitness?: number;
    minAvgHr?: number;
    maxAvgHr?: number;
    minPace?: number;
    maxPace?: number;
    hasPain?: boolean;
    painArea?: string;
    timeOfDay?: 'morning' | 'midday' | 'evening' | 'night';
    shoeId?: string;
    mealSlot?: 'breakfast' | 'pre_run' | 'lunch' | 'dinner' | 'snack';
    hasPreRunMeal?: boolean;
    hasFueling?: boolean;
  };
};

export type InsightOptions = {
  rangeOptions: Array<{ value: InsightRangeKey; label: string }>;
  presetOptions: Array<{ value: InsightPresetKey; label: string; question: string }>;
  entityOptions: Array<{ value: InsightQueryEntity; label: string }>;
  aggregateOptions: Array<{ value: InsightQueryAggregate; label: string }>;
  metricOptions: Array<{ value: InsightMetricKey; label: string; entity: InsightQueryEntity[]; kind: 'number' | 'boolean'; aggregates: InsightQueryAggregate[] }>;
  groupOptions: Array<{ value: InsightGroupBy; label: string; entity: InsightQueryEntity[] }>;
  sportOptions: Array<{ value: Sport | 'all'; label: string }>;
  timeOfDayOptions: Array<{ value: 'morning' | 'midday' | 'evening' | 'night'; label: string }>;
  mealSlotOptions: Array<{ value: 'breakfast' | 'pre_run' | 'lunch' | 'dinner' | 'snack'; label: string }>;
  shoes: Array<{ id: string; name: string }>;
  painAreas: string[];
  fuelingItems: string[];
};

type InsightDayRow = {
  date: string;
  recoveryRpe: number | null;
  sleepHours: number | null;
  sleepQuality: number | null;
  hrv: number | null;
  restingHr: number | null;
  mood: number | null;
  sorenessGlobal: number | null;
  sorenessByArea: string;
  recoveryNotes: string;
  hasPain: boolean;
  workoutCount: number;
  runCount: number;
  bikeCount: number;
  swimCount: number;
  totalLoad: number;
  totalTrimp: number;
  totalDistanceKm: number;
  runKm: number;
  runMinutes: number;
  bikeMinutes: number;
  swimMinutes: number;
  avgRunHr: number | null;
  avgWorkoutHr: number | null;
  maxWorkoutHr: number | null;
  targetKcal: number;
  targetProteinG: number;
  targetCarbsG: number;
  targetFatG: number;
  hydrationMl: number;
  acceptedMealCount: number;
  actualKcal: number;
  actualProteinG: number;
  actualCarbsG: number;
  actualFatG: number;
  acceptedMealSlots: string[];
  fuelingCarbsG: number;
  fuelingKcal: number;
  fuelingEntries: number;
  readiness: number;
  fatigue: number;
  fitness: number;
  painAreas: string[];
  hasPreRunMeal: boolean;
};

type InsightWorkoutRow = {
  id: string;
  date: string;
  startAt: string;
  hourOfDay: number | null;
  source: string;
  sport: Sport;
  durationSec: number;
  durationMin: number;
  distanceKm: number;
  paceMinPerKm: number | null;
  avgHr: number | null;
  maxHr: number | null;
  elevationM: number | null;
  tssLike: number;
  trimp: number;
  shoeId: string | null;
  shoeName: string;
  perceivedEffort: string | null;
  bodyFeel: string | null;
  breathingFeel: string | null;
  fuelingCarbsG: number;
  fuelingKcal: number;
  fuelingEntries: number;
  fuelingItems: string[];
  bestEffortCount: number;
  bestEffortKeys: string[];
  readiness: number;
  fatigue: number;
  fitness: number;
  hasPain: boolean;
  painAreas: string[];
  hasPreRunMeal: boolean;
  acceptedMealSlots: string[];
};

type InsightDataset = {
  days: InsightDayRow[];
  workouts: InsightWorkoutRow[];
};

type GroupAccumulator = {
  label: string;
  values: number[];
  truthy: number;
  total: number;
};

const db = getDb();
const weekdayLabels = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const rangeLabels: Record<InsightRangeKey, string> = {
  '30d': '30 יום',
  '12w': '12 שבועות',
  '365d': '365 יום',
  all: 'כל השנים'
};
const presetDefinitions: Array<{ value: InsightPresetKey; label: string; question: string }> = [
  { value: 'pain_after_run', label: 'כאב אחרי ריצה', question: 'מה קדם לכאב אחרי ריצה' },
  { value: 'best_morning_runs', label: 'בקרים טובים', question: 'באילו בקרים אני רץ הכי טוב' },
  { value: 'pb_context', label: 'לפני שיא', question: 'מה היה לפני שיא או ריצה חזקה' },
  { value: 'fueling_vs_good_runs', label: 'תזונה ותדלוק', question: 'איך תדלוק ותזונה קשורים לריצות טובות' },
  { value: 'load_vs_drop', label: 'עומס מול ירידה', question: 'איזה עומס יוצר אצלי ירידה בביצועים' },
  { value: 'period_compare', label: 'השוואת תקופות', question: 'איך נראית התקופה האחרונה מול התקופה שלפניה' }
];
const metricDefinitions: Array<{ value: InsightMetricKey; label: string; entity: InsightQueryEntity[]; kind: 'number' | 'boolean'; aggregates: InsightQueryAggregate[] }> = [
  { value: 'workoutCount', label: 'מספר אימונים', entity: ['day'], kind: 'number', aggregates: ['count', 'sum', 'avg', 'min', 'max'] },
  { value: 'totalLoad', label: 'עומס', entity: ['day'], kind: 'number', aggregates: ['sum', 'avg', 'min', 'max'] },
  { value: 'runKm', label: 'ק"מ ריצה', entity: ['day'], kind: 'number', aggregates: ['sum', 'avg', 'min', 'max'] },
  { value: 'runMinutes', label: 'דקות ריצה', entity: ['day'], kind: 'number', aggregates: ['sum', 'avg', 'min', 'max'] },
  { value: 'readiness', label: 'Readiness', entity: ['day', 'workout'], kind: 'number', aggregates: ['avg', 'min', 'max'] },
  { value: 'fatigue', label: 'Fatigue', entity: ['day', 'workout'], kind: 'number', aggregates: ['avg', 'min', 'max'] },
  { value: 'fitness', label: 'Fitness', entity: ['day', 'workout'], kind: 'number', aggregates: ['avg', 'min', 'max'] },
  { value: 'sleepHours', label: 'שעות שינה', entity: ['day'], kind: 'number', aggregates: ['avg', 'min', 'max'] },
  { value: 'sleepQuality', label: 'איכות שינה', entity: ['day'], kind: 'number', aggregates: ['avg', 'min', 'max'] },
  { value: 'hrv', label: 'HRV', entity: ['day'], kind: 'number', aggregates: ['avg', 'min', 'max'] },
  { value: 'restingHr', label: 'דופק מנוחה', entity: ['day'], kind: 'number', aggregates: ['avg', 'min', 'max'] },
  { value: 'mood', label: 'מצב רוח', entity: ['day'], kind: 'number', aggregates: ['avg', 'min', 'max'] },
  { value: 'sorenessGlobal', label: 'כאב כללי', entity: ['day'], kind: 'number', aggregates: ['avg', 'min', 'max'] },
  { value: 'actualKcal', label: 'קלוריות בפועל', entity: ['day'], kind: 'number', aggregates: ['sum', 'avg', 'min', 'max'] },
  { value: 'actualProteinG', label: 'חלבון בפועל', entity: ['day'], kind: 'number', aggregates: ['sum', 'avg', 'min', 'max'] },
  { value: 'actualCarbsG', label: 'פחמימה בפועל', entity: ['day'], kind: 'number', aggregates: ['sum', 'avg', 'min', 'max'] },
  { value: 'actualFatG', label: 'שומן בפועל', entity: ['day'], kind: 'number', aggregates: ['sum', 'avg', 'min', 'max'] },
  { value: 'fuelingCarbsG', label: 'פחמימה בתדלוק', entity: ['day', 'workout'], kind: 'number', aggregates: ['sum', 'avg', 'min', 'max'] },
  { value: 'fuelingEntries', label: 'מספר פריטי תדלוק', entity: ['day', 'workout'], kind: 'number', aggregates: ['sum', 'avg', 'min', 'max'] },
  { value: 'distanceKm', label: 'מרחק', entity: ['workout'], kind: 'number', aggregates: ['sum', 'avg', 'min', 'max'] },
  { value: 'durationMin', label: 'משך', entity: ['workout'], kind: 'number', aggregates: ['sum', 'avg', 'min', 'max'] },
  { value: 'paceMinPerKm', label: 'קצב', entity: ['workout'], kind: 'number', aggregates: ['avg', 'min', 'max'] },
  { value: 'avgHr', label: 'דופק ממוצע', entity: ['workout'], kind: 'number', aggregates: ['avg', 'min', 'max'] },
  { value: 'maxHr', label: 'דופק מקסימלי', entity: ['workout'], kind: 'number', aggregates: ['avg', 'min', 'max'] },
  { value: 'elevationM', label: 'טיפוס', entity: ['workout'], kind: 'number', aggregates: ['sum', 'avg', 'min', 'max'] },
  { value: 'tssLike', label: 'עומס אימון', entity: ['workout'], kind: 'number', aggregates: ['sum', 'avg', 'min', 'max'] },
  { value: 'trimp', label: 'TRIMP', entity: ['workout'], kind: 'number', aggregates: ['sum', 'avg', 'min', 'max'] },
  { value: 'hasPain', label: 'יש כאב', entity: ['day', 'workout'], kind: 'boolean', aggregates: ['count', 'rate'] },
  { value: 'hasPreRunMeal', label: 'יש מזון לפני ריצה', entity: ['day', 'workout'], kind: 'boolean', aggregates: ['count', 'rate'] },
  { value: 'hasFueling', label: 'יש תדלוק', entity: ['workout'], kind: 'boolean', aggregates: ['count', 'rate'] },
  { value: 'hasBestEffort', label: 'יש שיא/מקטע', entity: ['workout'], kind: 'boolean', aggregates: ['count', 'rate'] }
];
const groupDefinitions: Array<{ value: InsightGroupBy; label: string; entity: InsightQueryEntity[] }> = [
  { value: 'none', label: 'ללא קיבוץ', entity: ['day', 'workout'] },
  { value: 'month', label: 'חודש', entity: ['day', 'workout'] },
  { value: 'week', label: 'שבוע', entity: ['day', 'workout'] },
  { value: 'weekday', label: 'יום בשבוע', entity: ['day', 'workout'] },
  { value: 'sport', label: 'ענף', entity: ['workout'] },
  { value: 'shoe', label: 'נעל', entity: ['workout'] },
  { value: 'pain_area', label: 'אזור כאב', entity: ['day', 'workout'] },
  { value: 'meal_slot', label: 'ארוחה', entity: ['day', 'workout'] },
  { value: 'fueling_item', label: 'תדלוק', entity: ['workout'] }
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function parseCsv(value: string | null | undefined) {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function fmt(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return '-';
  return new Intl.NumberFormat('he-IL', { maximumFractionDigits: digits, minimumFractionDigits: digits === 0 ? 0 : 0 }).format(value);
}

function fmtDuration(minutes: number | null | undefined) {
  if (minutes == null || !Number.isFinite(minutes)) return '-';
  const rounded = Math.round(minutes);
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')} ש׳`;
  return `${m} דק׳`;
}

function fmtPace(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '-';
  const min = Math.floor(value);
  const sec = Math.round((value - min) * 60);
  return `${min}:${String(sec).padStart(2, '0')} דק׳/ק״מ`;
}

function labelMealSlot(slot: string) {
  if (slot === 'breakfast') return 'בוקר';
  if (slot === 'pre_run') return 'לפני ריצה';
  if (slot === 'lunch') return 'צהריים';
  if (slot === 'dinner') return 'ערב';
  if (slot === 'snack') return 'נשנוש';
  return slot;
}

function labelSport(sport: string) {
  if (sport === 'run') return 'ריצה';
  if (sport === 'bike') return 'אופניים';
  if (sport === 'swim') return 'שחייה';
  return sport;
}

function labelRange(range: InsightRangeKey) {
  return rangeLabels[range];
}

function getRangeBounds(range: InsightRangeKey, customFrom?: string, customTo?: string) {
  if (customFrom || customTo) {
    return { from: customFrom ?? null, to: customTo ?? null };
  }
  const today = formatLocalISODate(new Date());
  if (range === 'all') {
    const row = db.prepare(`SELECT MIN(date) as minDate, MAX(date) as maxDate FROM insight_day_view`).get() as { minDate: string | null; maxDate: string | null };
    return { from: row.minDate ?? null, to: row.maxDate ?? today };
  }
  const days = range === '30d' ? 30 : range === '12w' ? 84 : 365;
  return { from: addDaysISO(today, -(days - 1)), to: today };
}

function scoreCache() {
  const cache = new Map<string, ReturnType<typeof computeScores>>();
  return (date: string) => {
    const hit = cache.get(date);
    if (hit) return hit;
    const next = computeScores(date);
    cache.set(date, next);
    return next;
  };
}

function loadDataset(range: InsightRangeKey, from?: string, to?: string): InsightDataset {
  const bounds = getRangeBounds(range, from, to);
  const params: Array<string> = [];
  const clauses: string[] = [];
  if (bounds.from) {
    clauses.push('date >= ?');
    params.push(bounds.from);
  }
  if (bounds.to) {
    clauses.push('date <= ?');
    params.push(bounds.to);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const dayRows = db.prepare(`SELECT * FROM insight_day_view ${where} ORDER BY date DESC`).all(...params) as Array<Record<string, unknown>>;
  const scoresForDate = scoreCache();
  const days: InsightDayRow[] = dayRows.map((row) => {
    const date = String(row.date);
    const scores = scoresForDate(date);
    const painAreas = parseCsv((row.sorenessByArea as string | null | undefined) ?? '').map((item) => item.replace(/^[-•\s]+/, ''));
    const acceptedMealSlots = parseCsv((row.acceptedMealSlots as string | null | undefined) ?? '');
    return {
      date,
      recoveryRpe: row.recoveryRpe == null ? null : Number(row.recoveryRpe),
      sleepHours: row.sleepHours == null ? null : Number(row.sleepHours),
      sleepQuality: row.sleepQuality == null ? null : Number(row.sleepQuality),
      hrv: row.hrv == null ? null : Number(row.hrv),
      restingHr: row.restingHr == null ? null : Number(row.restingHr),
      mood: row.mood == null ? null : Number(row.mood),
      sorenessGlobal: row.sorenessGlobal == null ? null : Number(row.sorenessGlobal),
      sorenessByArea: String(row.sorenessByArea ?? ''),
      recoveryNotes: String(row.recoveryNotes ?? ''),
      hasPain: Boolean(Number(row.hasPain ?? 0)),
      workoutCount: Number(row.workoutCount ?? 0),
      runCount: Number(row.runCount ?? 0),
      bikeCount: Number(row.bikeCount ?? 0),
      swimCount: Number(row.swimCount ?? 0),
      totalLoad: Number(row.totalLoad ?? 0),
      totalTrimp: Number(row.totalTrimp ?? 0),
      totalDistanceKm: Number(row.totalDistanceKm ?? 0),
      runKm: Number(row.runKm ?? 0),
      runMinutes: Number(row.runMinutes ?? 0),
      bikeMinutes: Number(row.bikeMinutes ?? 0),
      swimMinutes: Number(row.swimMinutes ?? 0),
      avgRunHr: row.avgRunHr == null ? null : Number(row.avgRunHr),
      avgWorkoutHr: row.avgWorkoutHr == null ? null : Number(row.avgWorkoutHr),
      maxWorkoutHr: row.maxWorkoutHr == null ? null : Number(row.maxWorkoutHr),
      targetKcal: Number(row.targetKcal ?? 0),
      targetProteinG: Number(row.targetProteinG ?? 0),
      targetCarbsG: Number(row.targetCarbsG ?? 0),
      targetFatG: Number(row.targetFatG ?? 0),
      hydrationMl: Number(row.hydrationMl ?? 0),
      acceptedMealCount: Number(row.acceptedMealCount ?? 0),
      actualKcal: Number(row.actualKcal ?? 0),
      actualProteinG: Number(row.actualProteinG ?? 0),
      actualCarbsG: Number(row.actualCarbsG ?? 0),
      actualFatG: Number(row.actualFatG ?? 0),
      acceptedMealSlots,
      fuelingCarbsG: Number(row.fuelingCarbsG ?? 0),
      fuelingKcal: Number(row.fuelingKcal ?? 0),
      fuelingEntries: Number(row.fuelingEntries ?? 0),
      readiness: scores.readinessScore,
      fatigue: scores.fatigueScore,
      fitness: scores.fitnessScore,
      painAreas,
      hasPreRunMeal: acceptedMealSlots.includes('pre_run')
    };
  });
  const dayMap = new Map(days.map((row) => [row.date, row]));
  const workoutRows = db.prepare(`SELECT * FROM insight_workout_view ${where} ORDER BY startAt DESC`).all(...params) as Array<Record<string, unknown>>;
  const workouts: InsightWorkoutRow[] = workoutRows.map((row) => {
    const date = String(row.date);
    const parentDay = dayMap.get(date);
    return {
      id: String(row.id),
      date,
      startAt: String(row.startAt),
      hourOfDay: row.hourOfDay == null ? null : Number(row.hourOfDay),
      source: String(row.source),
      sport: String(row.sport) as Sport,
      durationSec: Number(row.durationSec ?? 0),
      durationMin: Number(row.durationSec ?? 0) / 60,
      distanceKm: Number(row.distanceKm ?? 0),
      paceMinPerKm: row.paceMinPerKm == null ? null : Number(row.paceMinPerKm),
      avgHr: row.avgHr == null ? null : Number(row.avgHr),
      maxHr: row.maxHr == null ? null : Number(row.maxHr),
      elevationM: row.elevationM == null ? null : Number(row.elevationM),
      tssLike: Number(row.tssLike ?? 0),
      trimp: Number(row.trimp ?? 0),
      shoeId: row.shoeId ? String(row.shoeId) : null,
      shoeName: String(row.shoeName ?? 'ללא שיוך'),
      perceivedEffort: row.perceivedEffort ? String(row.perceivedEffort) : null,
      bodyFeel: row.bodyFeel ? String(row.bodyFeel) : null,
      breathingFeel: row.breathingFeel ? String(row.breathingFeel) : null,
      fuelingCarbsG: Number(row.fuelingCarbsG ?? 0),
      fuelingKcal: Number(row.fuelingKcal ?? 0),
      fuelingEntries: Number(row.fuelingEntries ?? 0),
      fuelingItems: parseCsv((row.fuelingItems as string | null | undefined) ?? ''),
      bestEffortCount: Number(row.bestEffortCount ?? 0),
      bestEffortKeys: parseCsv((row.bestEffortKeys as string | null | undefined) ?? ''),
      readiness: parentDay?.readiness ?? scoresForDate(date).readinessScore,
      fatigue: parentDay?.fatigue ?? scoresForDate(date).fatigueScore,
      fitness: parentDay?.fitness ?? scoresForDate(date).fitnessScore,
      hasPain: parentDay?.hasPain ?? false,
      painAreas: parentDay?.painAreas ?? [],
      hasPreRunMeal: parentDay?.hasPreRunMeal ?? false,
      acceptedMealSlots: parentDay?.acceptedMealSlots ?? []
    };
  });

  return { days, workouts };
}

function workoutMatchesSport(row: InsightWorkoutRow, sport?: Sport | 'all') {
  if (!sport || sport === 'all') return true;
  return row.sport === sport;
}

function dayMatchesSport(row: InsightDayRow, sport?: Sport | 'all') {
  if (!sport || sport === 'all') return true;
  if (sport === 'run') return row.runCount > 0;
  if (sport === 'bike') return row.bikeCount > 0;
  return row.swimCount > 0;
}

function quantile(sortedValues: number[], q: number) {
  if (!sortedValues.length) return null;
  const idx = clamp(Math.floor(sortedValues.length * q), 0, sortedValues.length - 1);
  return sortedValues[idx];
}

function topEffortMap() {
  const map = new Map<string, Array<{ distanceKey: PBDistanceKey; timeSec: number; source: string }>>();
  const targets: Array<{ key: PBDistanceKey; includeSegments: boolean }> = [
    { key: '1k', includeSegments: true },
    { key: '3k', includeSegments: true },
    { key: '5k', includeSegments: false },
    { key: '10k', includeSegments: false },
    { key: '15k', includeSegments: false },
    { key: 'half', includeSegments: false },
    { key: '25k', includeSegments: false },
    { key: '30k', includeSegments: false }
  ];
  for (const target of targets) {
    for (const effort of getTopEfforts(target.key, 8, target.includeSegments)) {
      const current = map.get(effort.workoutId) ?? [];
      current.push({ distanceKey: effort.distanceKey, timeSec: effort.timeSec, source: effort.source });
      map.set(effort.workoutId, current);
    }
  }
  return map;
}

function buildPainAfterRun(dataset: InsightDataset, sport: Sport | 'all' = 'run'): InsightResult {
  const dayMap = new Map(dataset.days.map((row) => [row.date, row]));
  const relevant = dataset.days
    .filter((day) => day.hasPain)
    .map((day) => {
      const prev = dayMap.get(addDaysISO(day.date, -1));
      const sameDayHasSport = dayMatchesSport(day, sport);
      const prevDayHasSport = prev ? dayMatchesSport(prev, sport) : false;
      return { day, prev, qualifies: sameDayHasSport || prevDayHasSport };
    })
    .filter((row) => row.qualifies);

  const commonAreas = new Map<string, number>();
  for (const item of relevant) {
    for (const area of item.day.painAreas) {
      commonAreas.set(area, (commonAreas.get(area) ?? 0) + 1);
    }
  }

  const avgPrevLoad = relevant.reduce((sum, item) => sum + (item.prev?.totalLoad ?? 0), 0) / Math.max(1, relevant.length);
  const avgPrevKm = relevant.reduce((sum, item) => sum + (item.prev?.runKm ?? item.day.runKm ?? 0), 0) / Math.max(1, relevant.length);
  const commonAreaSeries = Array.from(commonAreas.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, value]) => ({ label, value, tone: 'accent' as const }));

  return {
    id: 'pain_after_run',
    title: 'מה קדם לכאב אחרי ריצה',
    question: 'באילו ימים כאב הופיע אחרי ריצה או יום עם עומס ריצה',
    summary: relevant.length
      ? `כאב הופיע ${relevant.length} פעמים אחרי יום עם ריצה. לפני הימים האלה העומס הממוצע היה ${fmt(avgPrevLoad, 0)} והקילומטראז׳ הממוצע ${fmt(avgPrevKm, 1)} ק״מ.`
      : 'אין מספיק ימים עם כאב אחרי ריצה בטווח הזה כדי לזהות דפוס ברור.',
    summaryDetail: relevant.length
      ? 'הטבלה למטה מראה את יום הכאב, אזורי הכאב, ומה היה ביום שלפניו.'
      : 'כדאי להמשיך לצבור צ׳ק-אין בוקר ודיווחי כאב כדי לקבל תובנות חזקות יותר.',
    visualSpec: {
      kind: 'bars',
      label: 'אזורי הכאב השכיחים',
      series: commonAreaSeries.length ? commonAreaSeries : [{ label: 'אין מספיק נתונים', value: 0, tone: 'muted' }]
    },
    rows: relevant.slice(0, 10).map(({ day, prev }) => ({
      id: day.date,
      title: day.date,
      subtitle: day.painAreas.join(' · ') || 'כאב כללי',
      href: `/today?date=${day.date}`,
      metrics: [
        { label: 'עומס קודם', value: fmt(prev?.totalLoad ?? 0, 0) },
        { label: 'ק״מ ריצה קודם', value: `${fmt(prev?.runKm ?? day.runKm, 1)} ק״מ` },
        { label: 'Readiness', value: fmt(prev?.readiness ?? day.readiness, 0) },
        { label: 'שינה', value: prev?.sleepHours != null ? `${fmt(prev.sleepHours, 1)} ש׳` : '-' }
      ]
    })),
    sampleSize: relevant.length,
    links: relevant.length ? [{ label: 'לראות את יום הכאב האחרון', href: `/today?date=${relevant[0].day.date}` }] : []
  };
}

function buildBestMorningRuns(dataset: InsightDataset): InsightResult {
  const runs = dataset.workouts.filter((w) => w.sport === 'run' && w.distanceKm >= 3 && w.paceMinPerKm != null);
  const sortedPaces = runs.map((r) => r.paceMinPerKm as number).sort((a, b) => a - b);
  const threshold = quantile(sortedPaces, 0.25) ?? null;
  const fastRuns = threshold == null ? [] : runs.filter((run) => (run.paceMinPerKm as number) <= threshold);
  const otherRuns = threshold == null ? runs : runs.filter((run) => (run.paceMinPerKm as number) > threshold);

  const avg = (rows: InsightWorkoutRow[], field: 'readiness' | 'sleepHours' | 'hrv' | 'restingHr') => {
    const values = rows
      .map((row) => {
        if (field === 'readiness') return row.readiness;
        const day = dataset.days.find((d) => d.date === row.date);
        if (!day) return null;
        return day[field];
      })
      .filter((value): value is number => value != null && Number.isFinite(value));
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  };

  return {
    id: 'best_morning_runs',
    title: 'באילו בקרים אני רץ הכי טוב',
    question: 'איך נראים הבקרים שלפני הריצות המהירות יותר שלך',
    summary: fastRuns.length
      ? `בריצות המהירות שלך הבוקר נוטה להיות חד יותר: readiness ממוצע ${fmt(avg(fastRuns, 'readiness'), 0)}, שינה ${fmt(avg(fastRuns, 'sleepHours'), 1)} שעות, HRV ${fmt(avg(fastRuns, 'hrv'), 0)}.`
      : 'אין מספיק ריצות עם צ׳ק-אין בוקר כדי לזהות כרגע דפוס מובהק.',
    summaryDetail: fastRuns.length ? 'ההשוואה היא בין רבע הריצות המהירות שלך לבין שאר הריצות עם נתוני בוקר.' : undefined,
    visualSpec: {
      kind: 'compare',
      label: 'בוקר של ריצות מהירות מול שאר הריצות',
      left: { label: 'ריצות מהירות', value: `${fastRuns.length}` },
      right: { label: 'שאר הריצות', value: `${otherRuns.length}` },
      metrics: [
        { label: 'Readiness', left: fmt(avg(fastRuns, 'readiness'), 0), right: fmt(avg(otherRuns, 'readiness'), 0) },
        { label: 'שעות שינה', left: fmt(avg(fastRuns, 'sleepHours'), 1), right: fmt(avg(otherRuns, 'sleepHours'), 1) },
        { label: 'HRV', left: fmt(avg(fastRuns, 'hrv'), 0), right: fmt(avg(otherRuns, 'hrv'), 0) },
        { label: 'דופק מנוחה', left: fmt(avg(fastRuns, 'restingHr'), 0), right: fmt(avg(otherRuns, 'restingHr'), 0) }
      ]
    },
    rows: fastRuns.slice(0, 8).map((run) => ({
      id: run.id,
      title: `${run.date} · ${fmt(run.distanceKm, 1)} ק״מ`,
      subtitle: fmtPace(run.paceMinPerKm),
      href: `/log/${run.id}`,
      metrics: [
        { label: 'Readiness', value: fmt(run.readiness, 0) },
        { label: 'דופק ממוצע', value: run.avgHr != null ? fmt(run.avgHr, 0) : '-' },
        { label: 'תדלוק', value: run.fuelingEntries > 0 ? `${fmt(run.fuelingCarbsG, 0)} גר׳` : 'ללא' },
        { label: 'מזון לפני ריצה', value: run.hasPreRunMeal ? 'כן' : 'לא' }
      ]
    })),
    sampleSize: fastRuns.length,
    links: fastRuns.length ? [{ label: 'לריצה המהירה האחרונה', href: `/log/${fastRuns[0].id}` }] : []
  };
}

function buildPbContext(dataset: InsightDataset): InsightResult {
  const pbMap = topEffortMap();
  const candidateRuns = dataset.workouts
    .filter((workout) => workout.sport === 'run')
    .map((workout) => ({ workout, pbHits: pbMap.get(workout.id) ?? [] }))
    .filter(({ workout, pbHits }) => pbHits.length > 0 || (workout.distanceKm >= 5 && workout.paceMinPerKm != null))
    .sort((a, b) => {
      const aScore = a.pbHits.length ? 1 : 0;
      const bScore = b.pbHits.length ? 1 : 0;
      if (bScore !== aScore) return bScore - aScore;
      return Date.parse(b.workout.startAt) - Date.parse(a.workout.startAt);
    })
    .slice(0, 8);

  const withPreRun = candidateRuns.filter((item) => item.workout.hasPreRunMeal).length;
  const withFueling = candidateRuns.filter((item) => item.workout.fuelingEntries > 0).length;
  const avgReadiness = candidateRuns.reduce((sum, item) => sum + item.workout.readiness, 0) / Math.max(1, candidateRuns.length);

  return {
    id: 'pb_context',
    title: 'מה היה לפני שיא או ריצה חזקה',
    question: 'איזה תנאים חזרו לפני ריצות חזקות ושיאים',
    summary: candidateRuns.length
      ? `בריצות חזקות/שיאים readiness ממוצע היה ${fmt(avgReadiness, 0)}. ב-${withPreRun}/${candidateRuns.length} מהמקרים הייתה ארוחה מאושרת לפני ריצה, וב-${withFueling}/${candidateRuns.length} היה תדלוק תוך אימון.`
      : 'אין כרגע מספיק ריצות שיא או ריצות חזקות בטווח הנבחר.',
    summaryDetail: candidateRuns.length ? 'הטבלה מציגה את האירועים החזקים ביותר ומה הופיע סביבם.' : undefined,
    visualSpec: {
      kind: 'bars',
      label: 'מה הופיע סביב ריצות חזקות',
      series: [
        { label: 'מזון לפני ריצה', value: withPreRun, tone: 'accent' },
        { label: 'תדלוק תוך אימון', value: withFueling, tone: 'default' },
        { label: 'ללא תדלוק', value: Math.max(0, candidateRuns.length - withFueling), tone: 'muted' }
      ]
    },
    rows: candidateRuns.map(({ workout, pbHits }) => ({
      id: workout.id,
      title: `${workout.date} · ${fmt(workout.distanceKm, 1)} ק״מ`,
      subtitle: pbHits.length ? `שיאים: ${pbHits.map((hit) => hit.distanceKey).join(', ')}` : 'ריצה חזקה',
      href: `/log/${workout.id}`,
      metrics: [
        { label: 'קצב', value: fmtPace(workout.paceMinPerKm) },
        { label: 'Readiness', value: fmt(workout.readiness, 0) },
        { label: 'מזון לפני ריצה', value: workout.hasPreRunMeal ? 'כן' : 'לא' },
        { label: 'תדלוק', value: workout.fuelingEntries ? `${fmt(workout.fuelingCarbsG, 0)} גר׳` : 'ללא' }
      ]
    })),
    sampleSize: candidateRuns.length,
    links: candidateRuns.length ? [{ label: 'לשיא האחרון', href: `/log/${candidateRuns[0].workout.id}` }] : []
  };
}

function buildFuelingVsGoodRuns(dataset: InsightDataset): InsightResult {
  const runs = dataset.workouts.filter((workout) => workout.sport === 'run' && workout.distanceKm >= 8 && workout.paceMinPerKm != null);
  const fueled = runs.filter((run) => run.fuelingEntries > 0 || run.hasPreRunMeal);
  const plain = runs.filter((run) => run.fuelingEntries === 0 && !run.hasPreRunMeal);
  const avgMetric = (rows: InsightWorkoutRow[], metric: 'paceMinPerKm' | 'avgHr' | 'distanceKm') => {
    const values = rows.map((row) => row[metric]).filter((value): value is number => value != null && Number.isFinite(value));
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  };

  return {
    id: 'fueling_vs_good_runs',
    title: 'איך תדלוק ותזונה קשורים לריצות טובות',
    question: 'השוואה בין ריצות עם תזונה/תדלוק לבין ריצות דומות בלי זה',
    summary: fueled.length && plain.length
      ? `בריצות של 8 ק״מ ומעלה, כשיש מזון לפני ריצה או תדלוק, הקצב הממוצע הוא ${fmtPace(avgMetric(fueled, 'paceMinPerKm'))} מול ${fmtPace(avgMetric(plain, 'paceMinPerKm'))} בלי זה.`
      : 'אין עדיין מספיק ריצות עם וגם בלי תדלוק/תזונה כדי לבצע השוואה אמינה.',
    summaryDetail: fueled.length && plain.length ? 'זו השוואה תיאורית בלבד, עם נתונים מאושרים בלבד של ארוחות.' : undefined,
    visualSpec: {
      kind: 'compare',
      label: 'ריצות עם תזונה/תדלוק מול בלי',
      left: { label: 'עם', value: `${fueled.length}` },
      right: { label: 'בלי', value: `${plain.length}` },
      metrics: [
        { label: 'קצב ממוצע', left: fmtPace(avgMetric(fueled, 'paceMinPerKm')), right: fmtPace(avgMetric(plain, 'paceMinPerKm')) },
        { label: 'מרחק ממוצע', left: `${fmt(avgMetric(fueled, 'distanceKm'), 1)} ק״מ`, right: `${fmt(avgMetric(plain, 'distanceKm'), 1)} ק״מ` },
        { label: 'דופק ממוצע', left: fmt(avgMetric(fueled, 'avgHr'), 0), right: fmt(avgMetric(plain, 'avgHr'), 0) }
      ]
    },
    rows: fueled.slice(0, 8).map((run) => ({
      id: run.id,
      title: `${run.date} · ${fmt(run.distanceKm, 1)} ק״מ`,
      subtitle: fmtPace(run.paceMinPerKm),
      href: `/log/${run.id}`,
      metrics: [
        { label: 'מזון לפני ריצה', value: run.hasPreRunMeal ? 'כן' : 'לא' },
        { label: 'פחמימה בתדלוק', value: run.fuelingEntries ? `${fmt(run.fuelingCarbsG, 0)} גר׳` : '0' },
        { label: 'דופק ממוצע', value: run.avgHr != null ? fmt(run.avgHr, 0) : '-' },
        { label: 'עומס', value: fmt(run.tssLike, 0) }
      ]
    })),
    sampleSize: runs.length,
    links: []
  };
}

function buildLoadVsDrop(dataset: InsightDataset): InsightResult {
  const dayMap = new Map(dataset.days.map((row) => [row.date, row]));
  const withPriorLoad = dataset.workouts
    .filter((workout) => workout.sport === 'run' && workout.distanceKm >= 5 && workout.paceMinPerKm != null)
    .map((workout) => {
      const prevLoad = [1, 2, 3].reduce((sum, offset) => sum + (dayMap.get(addDaysISO(workout.date, -offset))?.totalLoad ?? 0), 0);
      return { workout, prevLoad };
    });
  const sortedLoads = withPriorLoad.map((row) => row.prevLoad).sort((a, b) => a - b);
  const highLoadCutoff = quantile(sortedLoads, 0.75) ?? 0;
  const high = withPriorLoad.filter((row) => row.prevLoad >= highLoadCutoff);
  const normal = withPriorLoad.filter((row) => row.prevLoad < highLoadCutoff);
  const avgPaceFor = (rows: Array<{ workout: InsightWorkoutRow; prevLoad: number }>) => {
    const values = rows.map((row) => row.workout.paceMinPerKm).filter((value): value is number => value != null);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  };
  const avgReadinessFor = (rows: Array<{ workout: InsightWorkoutRow; prevLoad: number }>) => {
    const values = rows.map((row) => row.workout.readiness);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  };

  return {
    id: 'load_vs_drop',
    title: 'איזה עומס יוצר אצלי ירידה בביצועים',
    question: 'איך נראית הריצה כשקדמו לה 3 ימים עמוסים יותר',
    summary: high.length && normal.length
      ? `אחרי 3 ימים עם עומס גבוה, הקצב הממוצע הוא ${fmtPace(avgPaceFor(high))} מול ${fmtPace(avgPaceFor(normal))} בימים קלים יותר, ו-readiness ממוצע ${fmt(avgReadinessFor(high), 0)} מול ${fmt(avgReadinessFor(normal), 0)}.`
      : 'אין מספיק ריצות עם פער עומסים מובהק כדי להעריך ירידת ביצועים כרגע.',
    summaryDetail: high.length && normal.length ? `סף עומס גבוה הוגדר כאן כ-${fmt(highLoadCutoff, 0)} ומעלה בשלושת הימים שלפני הריצה.` : undefined,
    visualSpec: {
      kind: 'compare',
      label: '3 ימים עמוסים מול שאר הימים',
      left: { label: 'עומס גבוה', value: `${high.length}` },
      right: { label: 'שאר הריצות', value: `${normal.length}` },
      metrics: [
        { label: 'קצב ממוצע', left: fmtPace(avgPaceFor(high)), right: fmtPace(avgPaceFor(normal)) },
        { label: 'Readiness', left: fmt(avgReadinessFor(high), 0), right: fmt(avgReadinessFor(normal), 0) },
        { label: 'עומס קודם', left: fmt(highLoadCutoff, 0), right: `<${fmt(highLoadCutoff, 0)}` }
      ]
    },
    rows: high.slice(0, 8).map(({ workout, prevLoad }) => ({
      id: workout.id,
      title: `${workout.date} · ${fmt(workout.distanceKm, 1)} ק״מ`,
      subtitle: fmtPace(workout.paceMinPerKm),
      href: `/log/${workout.id}`,
      metrics: [
        { label: 'עומס 3 ימים', value: fmt(prevLoad, 0) },
        { label: 'Readiness', value: fmt(workout.readiness, 0) },
        { label: 'דופק ממוצע', value: workout.avgHr != null ? fmt(workout.avgHr, 0) : '-' },
        { label: 'כאב באותו יום', value: workout.hasPain ? 'כן' : 'לא' }
      ]
    })),
    sampleSize: withPriorLoad.length,
    links: []
  };
}

function buildPeriodCompare(dataset: InsightDataset): InsightResult {
  const today = formatLocalISODate(new Date());
  const currentStart = addDaysISO(today, -29);
  const prevStart = addDaysISO(currentStart, -30);
  const prevEnd = addDaysISO(currentStart, -1);
  const currentDays = dataset.days.filter((day) => day.date >= currentStart && day.date <= today);
  const prevDays = dataset.days.filter((day) => day.date >= prevStart && day.date <= prevEnd);
  const currentRuns = dataset.workouts.filter((workout) => workout.sport === 'run' && workout.date >= currentStart && workout.date <= today && workout.paceMinPerKm != null);
  const prevRuns = dataset.workouts.filter((workout) => workout.sport === 'run' && workout.date >= prevStart && workout.date <= prevEnd && workout.paceMinPerKm != null);
  const avgRunPace = (rows: InsightWorkoutRow[]) => rows.length ? rows.reduce((sum, row) => sum + (row.paceMinPerKm ?? 0), 0) / rows.length : null;
  const avgDayMetric = (rows: InsightDayRow[], key: 'runKm' | 'totalLoad' | 'readiness') => rows.length ? rows.reduce((sum, row) => sum + row[key], 0) / rows.length : null;

  return {
    id: 'period_compare',
    title: 'השוואת תקופות',
    question: '30 הימים האחרונים מול 30 הימים שלפניהם',
    summary: currentDays.length && prevDays.length
      ? `ב-30 הימים האחרונים היה נפח ריצה יומי ממוצע של ${fmt(avgDayMetric(currentDays, 'runKm'), 1)} ק״מ מול ${fmt(avgDayMetric(prevDays, 'runKm'), 1)} ק״מ בתקופה שקדמה, עם readiness ${fmt(avgDayMetric(currentDays, 'readiness'), 0)} מול ${fmt(avgDayMetric(prevDays, 'readiness'), 0)}.`
      : 'אין שתי תקופות מלאות להשוואה כרגע.',
    summaryDetail: currentDays.length && prevDays.length ? 'ההשוואה היא חלון של 30 ימים מול 30 הימים שלפניו.' : undefined,
    visualSpec: {
      kind: 'compare',
      label: 'חלון נוכחי מול חלון קודם',
      left: { label: '30 ימים אחרונים', value: `${currentDays.length}` },
      right: { label: '30 ימים קודמים', value: `${prevDays.length}` },
      metrics: [
        { label: 'ק״מ ריצה ליום', left: fmt(avgDayMetric(currentDays, 'runKm'), 1), right: fmt(avgDayMetric(prevDays, 'runKm'), 1) },
        { label: 'עומס ליום', left: fmt(avgDayMetric(currentDays, 'totalLoad'), 0), right: fmt(avgDayMetric(prevDays, 'totalLoad'), 0) },
        { label: 'Readiness', left: fmt(avgDayMetric(currentDays, 'readiness'), 0), right: fmt(avgDayMetric(prevDays, 'readiness'), 0) },
        { label: 'קצב ריצה', left: fmtPace(avgRunPace(currentRuns)), right: fmtPace(avgRunPace(prevRuns)) }
      ]
    },
    rows: [
      {
        id: 'current',
        title: `${currentStart} → ${today}`,
        subtitle: 'תקופה נוכחית',
        href: `/analytics`,
        metrics: [
          { label: 'ק״מ ריצה', value: `${fmt(currentDays.reduce((sum, row) => sum + row.runKm, 0), 1)} ק״מ` },
          { label: 'עומס מצטבר', value: fmt(currentDays.reduce((sum, row) => sum + row.totalLoad, 0), 0) },
          { label: 'Readiness', value: fmt(avgDayMetric(currentDays, 'readiness'), 0) }
        ]
      },
      {
        id: 'previous',
        title: `${prevStart} → ${prevEnd}`,
        subtitle: 'תקופה קודמת',
        href: `/analytics`,
        metrics: [
          { label: 'ק״מ ריצה', value: `${fmt(prevDays.reduce((sum, row) => sum + row.runKm, 0), 1)} ק״מ` },
          { label: 'עומס מצטבר', value: fmt(prevDays.reduce((sum, row) => sum + row.totalLoad, 0), 0) },
          { label: 'Readiness', value: fmt(avgDayMetric(prevDays, 'readiness'), 0) }
        ]
      }
    ],
    sampleSize: currentDays.length + prevDays.length,
    links: [{ label: 'לנתונים והיסטוריה', href: '/analytics' }]
  };
}

export function getPresetInsights(range: InsightRangeKey = '12w', sport: Sport | 'all' = 'run') {
  const dataset = loadDataset(range);
  const scopedDataset: InsightDataset = sport === 'all'
    ? dataset
    : {
        days: dataset.days.filter((day) => dayMatchesSport(day, sport)),
        workouts: dataset.workouts.filter((workout) => workoutMatchesSport(workout, sport))
      };
  return [
    buildPainAfterRun(scopedDataset, sport),
    buildBestMorningRuns(scopedDataset),
    buildPbContext(scopedDataset),
    buildFuelingVsGoodRuns(scopedDataset),
    buildLoadVsDrop(scopedDataset),
    buildPeriodCompare(scopedDataset)
  ];
}

function metricValue(row: InsightDayRow | InsightWorkoutRow, metric: InsightMetricKey) {
  switch (metric) {
    case 'workoutCount':
      return 'workoutCount' in row ? row.workoutCount : null;
    case 'totalLoad':
      return 'totalLoad' in row ? row.totalLoad : row.tssLike;
    case 'runKm':
      return 'runKm' in row ? row.runKm : row.sport === 'run' ? row.distanceKm : 0;
    case 'runMinutes':
      return 'runMinutes' in row ? row.runMinutes : row.sport === 'run' ? row.durationMin : 0;
    case 'readiness':
      return row.readiness;
    case 'fatigue':
      return row.fatigue;
    case 'fitness':
      return row.fitness;
    case 'sleepHours':
      return 'sleepHours' in row ? row.sleepHours : null;
    case 'sleepQuality':
      return 'sleepQuality' in row ? row.sleepQuality : null;
    case 'hrv':
      return 'hrv' in row ? row.hrv : null;
    case 'restingHr':
      return 'restingHr' in row ? row.restingHr : null;
    case 'mood':
      return 'mood' in row ? row.mood : null;
    case 'sorenessGlobal':
      return 'sorenessGlobal' in row ? row.sorenessGlobal : null;
    case 'actualKcal':
      return 'actualKcal' in row ? row.actualKcal : null;
    case 'actualProteinG':
      return 'actualProteinG' in row ? row.actualProteinG : null;
    case 'actualCarbsG':
      return 'actualCarbsG' in row ? row.actualCarbsG : null;
    case 'actualFatG':
      return 'actualFatG' in row ? row.actualFatG : null;
    case 'fuelingCarbsG':
      return row.fuelingCarbsG;
    case 'fuelingEntries':
      return row.fuelingEntries;
    case 'distanceKm':
      return 'distanceKm' in row ? row.distanceKm : row.totalDistanceKm;
    case 'durationMin':
      return 'durationMin' in row ? row.durationMin : row.runMinutes + row.bikeMinutes + row.swimMinutes;
    case 'paceMinPerKm':
      return 'paceMinPerKm' in row ? row.paceMinPerKm : row.runKm > 0 ? row.runMinutes / row.runKm : null;
    case 'avgHr':
      return 'avgHr' in row ? row.avgHr : row.avgWorkoutHr;
    case 'maxHr':
      return 'maxHr' in row ? row.maxHr : row.maxWorkoutHr;
    case 'elevationM':
      return 'elevationM' in row ? row.elevationM : null;
    case 'tssLike':
      return 'tssLike' in row ? row.tssLike : row.totalLoad;
    case 'trimp':
      return 'trimp' in row ? row.trimp : row.totalTrimp;
    case 'hasPain':
      return row.hasPain ? 1 : 0;
    case 'hasPreRunMeal':
      return row.hasPreRunMeal ? 1 : 0;
    case 'hasFueling':
      return 'fuelingEntries' in row && row.fuelingEntries > 0 ? 1 : 0;
    case 'hasBestEffort':
      return 'bestEffortCount' in row && row.bestEffortCount > 0 ? 1 : 0;
    default:
      return null;
  }
}

function groupEntries(entity: InsightQueryEntity, rows: Array<InsightDayRow | InsightWorkoutRow>, groupBy: InsightGroupBy) {
  if (groupBy === 'none') {
    return rows.map((row) => ({ group: 'כל התקופה', row }));
  }
  if (groupBy === 'month') {
    return rows.map((row) => ({ group: row.date.slice(0, 7), row }));
  }
  if (groupBy === 'week') {
    return rows.map((row) => ({ group: startOfTrainingWeekISO(row.date), row }));
  }
  if (groupBy === 'weekday') {
    return rows.map((row) => ({ group: weekdayLabels[weekdayISO(row.date)] ?? row.date, row }));
  }
  if (groupBy === 'sport' && entity === 'workout') {
    return rows.map((row) => ({ group: labelSport((row as InsightWorkoutRow).sport), row }));
  }
  if (groupBy === 'shoe' && entity === 'workout') {
    return rows.map((row) => ({ group: (row as InsightWorkoutRow).shoeName || 'ללא שיוך', row }));
  }
  if (groupBy === 'pain_area') {
    return rows.flatMap((row) => {
      const areas = 'painAreas' in row && row.painAreas.length ? row.painAreas : ['ללא כאב'];
      return areas.map((group) => ({ group, row }));
    });
  }
  if (groupBy === 'meal_slot') {
    return rows.flatMap((row) => {
      const slots = 'acceptedMealSlots' in row && row.acceptedMealSlots.length ? row.acceptedMealSlots : ['ללא ארוחה'];
      return slots.map((slot) => ({ group: labelMealSlot(slot), row }));
    });
  }
  if (groupBy === 'fueling_item' && entity === 'workout') {
    return rows.flatMap((row) => {
      const items = (row as InsightWorkoutRow).fuelingItems.length ? (row as InsightWorkoutRow).fuelingItems : ['ללא תדלוק'];
      return items.map((group) => ({ group, row }));
    });
  }
  return rows.map((row) => ({ group: 'אחר', row }));
}

function filterDayRows(rows: InsightDayRow[], filters: NonNullable<InsightQueryInput['filters']>, sport: Sport | 'all' = 'all') {
  return rows.filter((row) => {
    if (!dayMatchesSport(row, filters.sport ?? sport)) return false;
    if (filters.minDistanceKm != null && row.totalDistanceKm < filters.minDistanceKm) return false;
    if (filters.maxDistanceKm != null && row.totalDistanceKm > filters.maxDistanceKm) return false;
    const totalMinutes = row.runMinutes + row.bikeMinutes + row.swimMinutes;
    if (filters.minDurationMin != null && totalMinutes < filters.minDurationMin) return false;
    if (filters.maxDurationMin != null && totalMinutes > filters.maxDurationMin) return false;
    if (filters.minLoad != null && row.totalLoad < filters.minLoad) return false;
    if (filters.maxLoad != null && row.totalLoad > filters.maxLoad) return false;
    if (filters.minReadiness != null && row.readiness < filters.minReadiness) return false;
    if (filters.maxReadiness != null && row.readiness > filters.maxReadiness) return false;
    if (filters.minFatigue != null && row.fatigue < filters.minFatigue) return false;
    if (filters.maxFatigue != null && row.fatigue > filters.maxFatigue) return false;
    if (filters.minFitness != null && row.fitness < filters.minFitness) return false;
    if (filters.maxFitness != null && row.fitness > filters.maxFitness) return false;
    if (filters.minAvgHr != null && (row.avgWorkoutHr ?? -Infinity) < filters.minAvgHr) return false;
    if (filters.maxAvgHr != null && (row.avgWorkoutHr ?? Infinity) > filters.maxAvgHr) return false;
    const pace = row.runKm > 0 ? row.runMinutes / row.runKm : null;
    if (filters.minPace != null && (pace ?? -Infinity) < filters.minPace) return false;
    if (filters.maxPace != null && (pace ?? Infinity) > filters.maxPace) return false;
    if (filters.hasPain != null && row.hasPain !== filters.hasPain) return false;
    if (filters.painArea && !row.painAreas.includes(filters.painArea)) return false;
    if (filters.mealSlot && !row.acceptedMealSlots.includes(filters.mealSlot)) return false;
    if (filters.hasPreRunMeal != null && row.hasPreRunMeal !== filters.hasPreRunMeal) return false;
    if (filters.hasFueling != null && (row.fuelingEntries > 0) !== filters.hasFueling) return false;
    return true;
  });
}

function matchesTimeOfDay(hour: number | null, timeOfDay?: 'morning' | 'midday' | 'evening' | 'night') {
  if (!timeOfDay) return true;
  if (hour == null) return false;
  if (timeOfDay === 'morning') return hour >= 5 && hour < 10;
  if (timeOfDay === 'midday') return hour >= 10 && hour < 15;
  if (timeOfDay === 'evening') return hour >= 15 && hour < 22;
  return hour >= 22 || hour < 5;
}

function filterWorkoutRows(rows: InsightWorkoutRow[], filters: NonNullable<InsightQueryInput['filters']>, sport: Sport | 'all' = 'all') {
  return rows.filter((row) => {
    if (!workoutMatchesSport(row, filters.sport ?? sport)) return false;
    if (filters.minDistanceKm != null && row.distanceKm < filters.minDistanceKm) return false;
    if (filters.maxDistanceKm != null && row.distanceKm > filters.maxDistanceKm) return false;
    if (filters.minDurationMin != null && row.durationMin < filters.minDurationMin) return false;
    if (filters.maxDurationMin != null && row.durationMin > filters.maxDurationMin) return false;
    if (filters.minLoad != null && row.tssLike < filters.minLoad) return false;
    if (filters.maxLoad != null && row.tssLike > filters.maxLoad) return false;
    if (filters.minReadiness != null && row.readiness < filters.minReadiness) return false;
    if (filters.maxReadiness != null && row.readiness > filters.maxReadiness) return false;
    if (filters.minFatigue != null && row.fatigue < filters.minFatigue) return false;
    if (filters.maxFatigue != null && row.fatigue > filters.maxFatigue) return false;
    if (filters.minFitness != null && row.fitness < filters.minFitness) return false;
    if (filters.maxFitness != null && row.fitness > filters.maxFitness) return false;
    if (filters.minAvgHr != null && (row.avgHr ?? -Infinity) < filters.minAvgHr) return false;
    if (filters.maxAvgHr != null && (row.avgHr ?? Infinity) > filters.maxAvgHr) return false;
    if (filters.minPace != null && (row.paceMinPerKm ?? -Infinity) < filters.minPace) return false;
    if (filters.maxPace != null && (row.paceMinPerKm ?? Infinity) > filters.maxPace) return false;
    if (filters.hasPain != null && row.hasPain !== filters.hasPain) return false;
    if (filters.painArea && !row.painAreas.includes(filters.painArea)) return false;
    if (!matchesTimeOfDay(row.hourOfDay, filters.timeOfDay)) return false;
    if (filters.shoeId && (row.shoeId ?? '') !== filters.shoeId) return false;
    if (filters.mealSlot && !row.acceptedMealSlots.includes(filters.mealSlot)) return false;
    if (filters.hasPreRunMeal != null && row.hasPreRunMeal !== filters.hasPreRunMeal) return false;
    if (filters.hasFueling != null && (row.fuelingEntries > 0) !== filters.hasFueling) return false;
    return true;
  });
}

function aggregateGroup(values: number[], truthy: number, total: number, aggregate: InsightQueryAggregate) {
  if (aggregate === 'count') return total;
  if (aggregate === 'rate') return total ? round((truthy / total) * 100, 1) : 0;
  if (!values.length) return 0;
  if (aggregate === 'sum') return round(values.reduce((sum, value) => sum + value, 0), 1);
  if (aggregate === 'avg') return round(values.reduce((sum, value) => sum + value, 0) / values.length, 1);
  if (aggregate === 'min') return round(Math.min(...values), 1);
  return round(Math.max(...values), 1);
}

function resultMetricLabel(metric: InsightMetricKey, aggregate: InsightQueryAggregate) {
  const metricLabel = metricDefinitions.find((item) => item.value === metric)?.label ?? metric;
  const aggregateLabel = aggregate === 'count' ? 'ספירה' : aggregate === 'sum' ? 'סכום' : aggregate === 'avg' ? 'ממוצע' : aggregate === 'min' ? 'מינימום' : aggregate === 'max' ? 'מקסימום' : 'שיעור';
  return `${aggregateLabel} · ${metricLabel}`;
}

function valueFormatter(metric: InsightMetricKey, aggregate: InsightQueryAggregate, value: number) {
  if (metric === 'paceMinPerKm') return fmtPace(value);
  if (aggregate === 'rate') return `${fmt(value, 1)}%`;
  if (metric === 'distanceKm' || metric === 'runKm') return `${fmt(value, 1)} ק״מ`;
  if (metric === 'durationMin' || metric === 'runMinutes') return fmtDuration(value);
  if (metric === 'actualProteinG' || metric === 'actualCarbsG' || metric === 'actualFatG' || metric === 'fuelingCarbsG') return `${fmt(value, 1)} גר׳`;
  if (metric === 'actualKcal') return `${fmt(value, 0)} קק״ל`;
  return fmt(value, aggregate === 'count' ? 0 : 1);
}

export function runInsightQuery(input: InsightQueryInput): InsightResult {
  const dataset = loadDataset(input.range, input.from, input.to);
  const filters = input.filters ?? {};
  const rows = input.entity === 'day'
    ? filterDayRows(dataset.days, filters, input.sport)
    : filterWorkoutRows(dataset.workouts, filters, input.sport);

  const grouped = new Map<string, GroupAccumulator>();
  for (const entry of groupEntries(input.entity, rows, input.groupBy)) {
    const current = grouped.get(entry.group) ?? { label: entry.group, values: [], truthy: 0, total: 0 };
    const value = metricValue(entry.row as any, input.metric);
    current.total += 1;
    if (typeof value === 'number' && Number.isFinite(value)) {
      current.values.push(value);
      if (value > 0) current.truthy += 1;
    }
    grouped.set(entry.group, current);
  }

  const items = Array.from(grouped.values()).map((group) => ({
    label: group.label,
    rawValue: aggregateGroup(group.values, group.truthy, group.total, input.aggregate),
    total: group.total
  }));

  const sorted = [...items].sort((a, b) => {
    if (input.metric === 'paceMinPerKm' && (input.aggregate === 'avg' || input.aggregate === 'min' || input.aggregate === 'max')) {
      return a.rawValue - b.rawValue;
    }
    return b.rawValue - a.rawValue;
  });

  const visualSeries = sorted.slice(0, 10).map((item, idx) => ({
    label: item.label,
    value: item.rawValue,
    tone: idx === 0 ? ('accent' as const) : ('default' as const)
  }));

  const metricLabel = resultMetricLabel(input.metric, input.aggregate);
  return {
    id: 'advanced_query',
    title: 'חיפוש מתקדם',
    question: metricLabel,
    summary: sorted.length
      ? `${metricLabel} עבור ${rows.length} ${input.entity === 'day' ? 'ימים' : 'אימונים'} בטווח ${labelRange(input.range)}.`
      : 'לא נמצאו נתונים עבור השאילתה הזו.',
    summaryDetail: sorted.length ? `הקיבוץ הוא לפי ${groupDefinitions.find((item) => item.value === input.groupBy)?.label ?? 'ללא קיבוץ'}.` : undefined,
    visualSpec: {
      kind: 'bars',
      label: metricLabel,
      series: visualSeries.length ? visualSeries : [{ label: 'אין נתונים', value: 0, tone: 'muted' }]
    },
    rows: sorted.slice(0, 12).map((item) => ({
      id: item.label,
      title: item.label,
      metrics: [
        { label: metricLabel, value: valueFormatter(input.metric, input.aggregate, item.rawValue) },
        { label: 'גודל מדגם', value: String(item.total) }
      ]
    })),
    sampleSize: rows.length,
    links: []
  };
}

export function getInsightOptions(): InsightOptions {
  const shoes = db
    .prepare(`SELECT id, name FROM running_shoes WHERE active = 1 ORDER BY isDefault DESC, name COLLATE NOCASE ASC`)
    .all() as Array<{ id: string; name: string }>;
  const painAreas = db
    .prepare(`SELECT DISTINCT name FROM pain_areas ORDER BY name COLLATE NOCASE ASC`)
    .all() as Array<{ name: string }>;
  const fuelingItems = db
    .prepare(`SELECT DISTINCT itemName FROM workout_fueling ORDER BY itemName COLLATE NOCASE ASC`)
    .all() as Array<{ itemName: string }>;

  return {
    rangeOptions: [
      { value: '30d', label: '30 יום' },
      { value: '12w', label: '12 שבועות' },
      { value: '365d', label: '365 יום' },
      { value: 'all', label: 'כל השנים' }
    ],
    presetOptions: presetDefinitions,
    entityOptions: [
      { value: 'day', label: 'יום' },
      { value: 'workout', label: 'אימון' }
    ],
    aggregateOptions: [
      { value: 'count', label: 'ספירה' },
      { value: 'sum', label: 'סכום' },
      { value: 'avg', label: 'ממוצע' },
      { value: 'min', label: 'מינימום' },
      { value: 'max', label: 'מקסימום' },
      { value: 'rate', label: 'שיעור' }
    ],
    metricOptions: metricDefinitions,
    groupOptions: groupDefinitions,
    sportOptions: [
      { value: 'all', label: 'כל הענפים' },
      { value: 'run', label: 'ריצה' },
      { value: 'swim', label: 'שחייה' },
      { value: 'bike', label: 'אופניים' }
    ],
    timeOfDayOptions: [
      { value: 'morning', label: 'בוקר' },
      { value: 'midday', label: 'צהריים' },
      { value: 'evening', label: 'ערב' },
      { value: 'night', label: 'לילה' }
    ],
    mealSlotOptions: [
      { value: 'breakfast', label: 'בוקר' },
      { value: 'pre_run', label: 'לפני ריצה' },
      { value: 'lunch', label: 'צהריים' },
      { value: 'dinner', label: 'ערב' },
      { value: 'snack', label: 'נשנוש' }
    ],
    shoes,
    painAreas: painAreas.map((row) => row.name),
    fuelingItems: fuelingItems.map((row) => row.itemName)
  };
}
