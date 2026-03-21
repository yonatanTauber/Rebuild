import fs from "node:fs";
import readline from "node:readline";
import { upsertAthleteProfile } from "@/lib/db";
import type { AthleteProfile } from "@/lib/types";

type MetricKey = "restingHr" | "hrv" | "vo2max";

type MetricBucket = {
  all: number[];
  recent365: number[];
};

type ImportSummary = {
  sourceFile: string;
  scannedRecords: number;
  parsedAt: string;
  metrics: {
    restingHr: { count: number; recent365Count: number; baseline: number | null };
    hrv: { count: number; recent365Count: number; baseline: number | null };
    vo2max: { count: number; recent365Count: number; baseline: number | null };
    sleepHours: { daysCount: number; recent365DaysCount: number; baseline: number | null };
  };
};

const TYPE_TO_KEY: Record<string, MetricKey> = {
  HKQuantityTypeIdentifierRestingHeartRate: "restingHr",
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: "hrv",
  HKQuantityTypeIdentifierVO2Max: "vo2max"
};

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2));
  }
  return Number(sorted[mid].toFixed(2));
}

function parseAttributes(line: string) {
  const attrs: Record<string, string> = {};
  const regex = /([A-Za-z0-9_:-]+)="([^"]*)"/g;
  let match: RegExpExecArray | null = regex.exec(line);
  while (match) {
    attrs[match[1]] = match[2];
    match = regex.exec(line);
  }
  return attrs;
}

function pickBaseline(bucket: MetricBucket) {
  if (bucket.recent365.length >= 20) return median(bucket.recent365);
  return median(bucket.all);
}

export async function importAppleHealthProfile(exportXmlPath: string) {
  if (!fs.existsSync(exportXmlPath)) {
    throw new Error(`Export file not found: ${exportXmlPath}`);
  }

  const now = Date.now();
  const cutoff365 = now - 365 * 24 * 60 * 60 * 1000;

  const metrics: Record<MetricKey, MetricBucket> = {
    restingHr: { all: [], recent365: [] },
    hrv: { all: [], recent365: [] },
    vo2max: { all: [], recent365: [] }
  };

  const sleepByDay = new Map<string, number>();
  let scannedRecords = 0;

  const rl = readline.createInterface({
    input: fs.createReadStream(exportXmlPath, { encoding: "utf8" }),
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (!line.includes("<Record ")) continue;
    scannedRecords += 1;

    const attrs = parseAttributes(line);
    const type = attrs.type;
    if (!type) continue;

    const startDateStr = attrs.startDate;
    const startTs = startDateStr ? Date.parse(startDateStr) : NaN;
    const isRecent = Number.isFinite(startTs) && startTs >= cutoff365;

    const key = TYPE_TO_KEY[type];
    if (key) {
      const raw = Number(attrs.value);
      if (Number.isFinite(raw) && raw > 0) {
        metrics[key].all.push(raw);
        if (isRecent) metrics[key].recent365.push(raw);
      }
      continue;
    }

    if (type === "HKCategoryTypeIdentifierSleepAnalysis" && attrs.value?.includes("Asleep")) {
      const endTs = attrs.endDate ? Date.parse(attrs.endDate) : NaN;
      if (!Number.isFinite(startTs) || !Number.isFinite(endTs) || endTs <= startTs) continue;

      const durationHours = (endTs - startTs) / 3600000;
      if (durationHours <= 0 || durationHours > 18) continue;

      const day = new Date(startTs).toISOString().slice(0, 10);
      sleepByDay.set(day, (sleepByDay.get(day) ?? 0) + durationHours);
    }
  }

  const sleepAll = Array.from(sleepByDay.values()).filter((h) => h > 2.5 && h < 12.5);
  const sleepRecent = Array.from(sleepByDay.entries())
    .filter(([day]) => Date.parse(`${day}T00:00:00.000Z`) >= cutoff365)
    .map(([, hours]) => hours)
    .filter((h) => h > 2.5 && h < 12.5);

  const profile: AthleteProfile = {
    restingHrBaseline: pickBaseline(metrics.restingHr),
    hrvBaseline: pickBaseline(metrics.hrv),
    vo2MaxBaseline: pickBaseline(metrics.vo2max),
    sleepHoursBaseline: sleepRecent.length >= 20 ? median(sleepRecent) : median(sleepAll)
  };

  const summary: ImportSummary = {
    sourceFile: exportXmlPath,
    scannedRecords,
    parsedAt: new Date().toISOString(),
    metrics: {
      restingHr: {
        count: metrics.restingHr.all.length,
        recent365Count: metrics.restingHr.recent365.length,
        baseline: profile.restingHrBaseline ?? null
      },
      hrv: {
        count: metrics.hrv.all.length,
        recent365Count: metrics.hrv.recent365.length,
        baseline: profile.hrvBaseline ?? null
      },
      vo2max: {
        count: metrics.vo2max.all.length,
        recent365Count: metrics.vo2max.recent365.length,
        baseline: profile.vo2MaxBaseline ?? null
      },
      sleepHours: {
        daysCount: sleepAll.length,
        recent365DaysCount: sleepRecent.length,
        baseline: profile.sleepHoursBaseline ?? null
      }
    }
  };

  upsertAthleteProfile({
    ...profile,
    sourceSummaryJson: JSON.stringify(summary)
  });

  return {
    profile,
    summary
  };
}
