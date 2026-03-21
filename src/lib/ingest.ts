import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import readline from "node:readline";
import { createIngestRun, dedupeWorkouts, finishIngestRun, hasWorkoutByCanonicalKey, upsertWorkout } from "@/lib/db";
import { recalculateNutritionFrom } from "@/lib/nutrition-engine";
import { recomputeBestEffortsAll } from "@/lib/pb-engine";
import type { Sport, Workout } from "@/lib/types";

type ParsedWorkout = Omit<Workout, "id">;
const DEFAULT_HEALTHFIT_DIR = "/Users/Y.T.p/Library/Mobile Documents/iCloud~com~altifondo~HealthFit/Documents";
const DEFAULT_SMASHRUN_DIR = path.join(process.cwd(), "data", "smashrun-export");
const FIT_BYTES_PER_SECOND = 42;
const IS_VERCEL_RUNTIME = process.env.VERCEL === "1";

function normalizeFsPath(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  const unescaped = trimmed.replace(/\\ /g, " ").replace(/\\~/g, "~");
  if (unescaped.startsWith("~/")) {
    return path.join(process.env.HOME ?? "", unescaped.slice(2));
  }
  return unescaped;
}

export function getIngestDirectories() {
  const fallbackImportDir = IS_VERCEL_RUNTIME ? path.join("/tmp", "rebuild-import") : DEFAULT_HEALTHFIT_DIR;
  const fallbackSmashrunDir = IS_VERCEL_RUNTIME ? path.join("/tmp", "rebuild-smashrun") : DEFAULT_SMASHRUN_DIR;
  const importDir =
    normalizeFsPath(process.env.REBUILD_IMPORT_DIR ?? "") ||
    normalizeFsPath(process.env.NEXT_PUBLIC_REBUILD_IMPORT_DIR ?? "") ||
    fallbackImportDir;
  const smashrunDir = normalizeFsPath(process.env.REBUILD_SMASHRUN_DIR ?? "") || fallbackSmashrunDir;
  return { importDir, smashrunDir };
}

function listIngestFilesSafe(importDir: string) {
  try {
    if (!fs.existsSync(importDir)) {
      fs.mkdirSync(importDir, { recursive: true });
    }
    return fs
      .readdirSync(importDir)
      .filter((f) => !f.startsWith("."))
      .filter((f) => f.endsWith(".json") || f.endsWith(".fit") || f.endsWith(".gpx"))
      .sort();
  } catch {
    return [] as string[];
  }
}

function parseSport(value: string): Sport | null {
  const normalized = value.toLowerCase();
  if (
    normalized.includes("functional strength") ||
    normalized.includes("strength training") ||
    normalized.includes("strength") ||
    normalized.includes("kettlebell") ||
    normalized.includes("weight")
  ) {
    return "strength";
  }
  if (normalized.includes("run")) return "run";
  if (normalized.includes("ride") || normalized.includes("bike") || normalized.includes("cycling")) return "bike";
  if (normalized.includes("swim")) return "swim";
  return null;
}

function isUnsupportedTargetActivity(filename: string): boolean {
  const meta = parseFilenameMetadata(filename);
  if (!meta) return false;
  return parseSport(meta.activity) === null;
}

function parseDurationFromGpx(raw: string): number | null {
  const matches = Array.from(raw.matchAll(/<time>([^<]+)<\/time>/g));
  if (matches.length < 2) return null;

  const first = new Date(matches[0][1]).getTime();
  const last = new Date(matches[matches.length - 1][1]).getTime();
  if (!Number.isFinite(first) || !Number.isFinite(last) || last <= first) return null;
  return Math.max(60, Math.round((last - first) / 1000));
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function parseDistanceFromGpx(raw: string): number | null {
  const matches = Array.from(raw.matchAll(/<trkpt[^>]*lat="([^"]+)"[^>]*lon="([^"]+)"/g));
  if (matches.length < 2) return null;

  let total = 0;
  let prevLat = Number(matches[0][1]);
  let prevLon = Number(matches[0][2]);
  if (!Number.isFinite(prevLat) || !Number.isFinite(prevLon)) return null;

  for (let i = 1; i < matches.length; i += 1) {
    const lat = Number(matches[i][1]);
    const lon = Number(matches[i][2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    total += haversineMeters(prevLat, prevLon, lat, lon);
    prevLat = lat;
    prevLon = lon;
  }

  return total > 0 ? Math.round(total) : null;
}

function parseHeartRateStatsFromGpx(raw: string): { avgHr: number; maxHr: number } | null {
  const hrValues = Array.from(raw.matchAll(/<(?:gpxtpx:)?hr>(\d+(?:\.\d+)?)<\/(?:gpxtpx:)?hr>/gi))
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value > 0 && value < 255);

  if (!hrValues.length) return null;

  const avgHr = Math.round(hrValues.reduce((sum, value) => sum + value, 0) / hrValues.length);
  const maxHr = Math.round(Math.max(...hrValues));
  return { avgHr, maxHr };
}

function parseFilenameMetadata(filename: string) {
  const match = filename.match(
    /^(\d{4}-\d{2}-\d{2})-(\d{2})(\d{2})(\d{2})-(.+?)-(.+)\.(fit|gpx|json)$/i
  );
  if (!match) return null;

  const [, day, hh, mm, ss, activity, device, ext] = match;
  return {
    startAt: new Date(`${day}T${hh}:${mm}:${ss}.000Z`).toISOString(),
    activity,
    device,
    ext: ext.toLowerCase()
  };
}

function parseJsonFile(filepath: string, filename: string): ParsedWorkout | null {
  const raw = fs.readFileSync(filepath, "utf8");
  const hash = createHash("sha256").update(raw).digest("hex");
  const parsed = JSON.parse(raw) as Record<string, unknown>;

  if (!parsed.startAt || !parsed.durationSec || !parsed.source) {
    return null;
  }

  const sport = parseSport(String(parsed.sport ?? "run"));
  if (!sport) return null;
  const durationSec = Number(parsed.durationSec);
  const avgHr = parsed.avgHr ? Number(parsed.avgHr) : null;
  const tssLike = Math.max(10, Math.round((durationSec / 60) * ((avgHr ?? 130) / 130)));
  const canonicalStart = new Date(String(parsed.startAt)).toISOString();
  const canonicalKey = `${sport}|${canonicalStart}`;

  return {
    source: parsed.source === "bavel" ? "bavel" : parsed.source === "strava" ? "strava" : "healthfit",
    sport,
    startAt: canonicalStart,
    durationSec,
    distanceM: parsed.distanceM ? Number(parsed.distanceM) : null,
    avgHr,
    maxHr: parsed.maxHr ? Number(parsed.maxHr) : null,
    elevationM: parsed.elevationM ? Number(parsed.elevationM) : null,
    powerAvg: parsed.powerAvg ? Number(parsed.powerAvg) : null,
    paceAvg: parsed.paceAvg ? Number(parsed.paceAvg) : null,
    tssLike,
    trimp: tssLike,
    canonicalKey,
    rawFileHash: `${filename}:${hash}`,
    rawFilePath: filepath
  };
}

function parseHealthFitFile(filepath: string, filename: string): ParsedWorkout | null {
  const meta = parseFilenameMetadata(filename);
  if (!meta) return null;
  const sport = parseSport(meta.activity);
  if (!sport) return null;
  const rawBuffer = fs.readFileSync(filepath);
  const hash = createHash("sha256").update(rawBuffer).digest("hex");
  const text = meta.ext === "gpx" ? rawBuffer.toString("utf8") : "";

  const durationFromGpx = meta.ext === "gpx" ? parseDurationFromGpx(text) : null;
  const distanceFromGpx = meta.ext === "gpx" ? parseDistanceFromGpx(text) : null;
  const hrStatsFromGpx = meta.ext === "gpx" ? parseHeartRateStatsFromGpx(text) : null;
  const estimatedDuration =
    durationFromGpx ??
    Math.max(
      8 * 60,
      Math.round(rawBuffer.byteLength / FIT_BYTES_PER_SECOND)
    );
  const distanceGuess =
    sport === "strength"
      ? null
      : distanceFromGpx ??
        (sport === "run" ? estimatedDuration * 2.85 : sport === "bike" ? estimatedDuration * 6.8 : estimatedDuration * 0.7);
  const fallbackAvgHr = sport === "run" ? 145 : sport === "bike" ? 136 : sport === "strength" ? 124 : 128;
  const fallbackMaxHr = fallbackAvgHr + 20;
  const avgHr = hrStatsFromGpx?.avgHr ?? fallbackAvgHr;
  const maxHr = hrStatsFromGpx?.maxHr ?? fallbackMaxHr;
  const tssLike = Math.max(10, Math.round((estimatedDuration / 60) * (avgHr / 130)));
  const canonicalKey = `${sport}|${meta.startAt}`;

  return {
    source: meta.device.toLowerCase().includes("strava") ? "strava" : "healthfit",
    sport,
    startAt: meta.startAt,
    durationSec: estimatedDuration,
    distanceM: distanceGuess != null ? Math.round(distanceGuess) : null,
    avgHr,
    maxHr,
    elevationM: sport === "run" || sport === "bike" ? Math.round((distanceGuess ?? 0) / 220) : 0,
    powerAvg: null,
    paceAvg: null,
    tssLike,
    trimp: tssLike,
    canonicalKey,
    rawFileHash: `${filename}:${hash}`,
    rawFilePath: filepath
  };
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

function parseXmlDate(input: string) {
  if (!input) return null;
  const normalized = input.replace(" +", "+").replace(" ", "T");
  const ts = Date.parse(normalized);
  if (!Number.isFinite(ts)) return null;
  return new Date(ts).toISOString();
}

function parseDatePreserveUtc(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const candidate = trimmed.endsWith("Z") ? trimmed : `${trimmed}Z`;
  const ts = Date.parse(candidate);
  if (!Number.isFinite(ts)) return null;
  return new Date(ts).toISOString();
}

function distanceUnitToMeters(value: number, unit: string) {
  const u = unit.toLowerCase();
  if (u === "km") return value * 1000;
  if (u === "m") return value;
  if (u === "mi") return value * 1609.344;
  if (u === "yd") return value * 0.9144;
  if (u === "ft") return value * 0.3048;
  return value;
}

async function parseAppleHealthExportWorkouts(filepath: string): Promise<ParsedWorkout[]> {
  if (!fs.existsSync(filepath)) return [];

  const out: ParsedWorkout[] = [];
  const stream = fs.createReadStream(filepath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let current: {
    sport: Sport;
    startAt: string;
    durationSec: number;
    sourceName: string;
    distanceM: number | null;
  } | null = null;

  for await (const line of rl) {
    if (line.includes("<Workout ")) {
      const attrs = parseAttributes(line);
      const sport = parseSport(attrs.workoutActivityType ?? "");
      if (!sport) {
        current = null;
        continue;
      }

      const startAt = parseXmlDate(attrs.startDate ?? "");
      if (!startAt) {
        current = null;
        continue;
      }
      const sourceName = attrs.sourceName ?? "apple_health_export";

      let durationSec = 0;
      if (attrs.duration) {
        const raw = Number(attrs.duration);
        if (Number.isFinite(raw) && raw > 0) {
          const unit = (attrs.durationUnit ?? "min").toLowerCase();
          if (unit.includes("sec")) durationSec = Math.round(raw);
          else if (unit.includes("hour")) durationSec = Math.round(raw * 3600);
          else durationSec = Math.round(raw * 60);
        }
      }

      if (!durationSec && attrs.endDate) {
        const endAt = parseXmlDate(attrs.endDate);
        if (endAt) {
          const sec = Math.round((Date.parse(endAt) - Date.parse(startAt)) / 1000);
          durationSec = Math.max(60, sec);
        }
      }
      if (!durationSec) {
        current = null;
        continue;
      }

      current = {
        sport,
        startAt,
        durationSec,
        sourceName,
        distanceM: null
      };
      continue;
    }

    if (!current) continue;

    if (line.includes("<WorkoutStatistics ")) {
      const stats = parseAttributes(line);
      const type = stats.type ?? "";
      const sum = Number(stats.sum);
      if (!Number.isFinite(sum) || sum <= 0) continue;

      const isMatchingDistance =
        (current.sport === "run" && type.includes("DistanceWalkingRunning")) ||
        (current.sport === "bike" && type.includes("DistanceCycling")) ||
        (current.sport === "swim" && type.includes("DistanceSwimming"));
      const isGenericDistance = type.includes("Distance");
      if (!isMatchingDistance && !isGenericDistance) continue;

      const meters = Math.round(distanceUnitToMeters(sum, stats.unit ?? "m"));
      if (meters > 0) {
        current.distanceM = Math.max(current.distanceM ?? 0, meters);
      }
      continue;
    }

    if (line.includes("</Workout>")) {
      const baseHr = current.sport === "run" ? 145 : current.sport === "bike" ? 136 : current.sport === "strength" ? 124 : 128;
      const tssLike = Math.max(10, Math.round((current.durationSec / 60) * (baseHr / 130)));
      const canonicalKey = `${current.sport}|${current.startAt}`;
      const hash = createHash("sha1")
        .update(`${current.startAt}|${current.sport}|${current.durationSec}|${current.distanceM ?? 0}|${current.sourceName}`)
        .digest("hex");

      out.push({
        source: current.sourceName.toLowerCase().includes("strava") ? "strava" : "healthfit",
        sport: current.sport,
        startAt: current.startAt,
        durationSec: current.durationSec,
        distanceM: current.distanceM,
        avgHr: null,
        maxHr: null,
        elevationM: null,
        powerAvg: null,
        paceAvg: null,
        tssLike,
        trimp: tssLike,
        canonicalKey,
        rawFileHash: `apple_health_export:${hash}`,
        rawFilePath: filepath
      });
      current = null;
      continue;
    }

    if (line.includes("<Workout ")) {
      current = null;
      continue;
    }
  }

  return out;
}

function parseSmashrunTcxFile(filepath: string): ParsedWorkout | null {
  const raw = fs.readFileSync(filepath, "utf8");
  const hash = createHash("sha256").update(raw).digest("hex");

  if (!raw.includes('Sport="Running"')) return null;

  const idMatch = raw.match(/<Id>([^<]+)<\/Id>/);
  const startAt = parseDatePreserveUtc(idMatch?.[1] ?? "");
  if (!startAt) return null;

  const lapRegex = /<Lap\b[\s\S]*?<\/Lap>/g;
  const lapBlocks = raw.match(lapRegex) ?? [];
  if (!lapBlocks.length) return null;

  let totalTimeSec = 0;
  let totalDistanceM = 0;
  let weightedHr = 0;
  let hrWeightSec = 0;
  let maxHr = 0;
  let elevationGain = 0;

  for (const lap of lapBlocks) {
    const time = Number((lap.match(/<TotalTimeSeconds>([^<]+)<\/TotalTimeSeconds>/)?.[1] ?? "").trim());
    if (Number.isFinite(time) && time > 0) totalTimeSec += time;

    const dist = Number((lap.match(/<DistanceMeters>([^<]+)<\/DistanceMeters>/)?.[1] ?? "").trim());
    if (Number.isFinite(dist) && dist > 0) totalDistanceM += dist;

    const avgHr = Number((lap.match(/<AverageHeartRateBpm>[\s\S]*?<Value>([^<]+)<\/Value>[\s\S]*?<\/AverageHeartRateBpm>/)?.[1] ?? "").trim());
    if (Number.isFinite(avgHr) && avgHr > 0 && Number.isFinite(time) && time > 0) {
      weightedHr += avgHr * time;
      hrWeightSec += time;
    }

    const lapMaxHr = Number((lap.match(/<MaximumHeartRateBpm>[\s\S]*?<Value>([^<]+)<\/Value>[\s\S]*?<\/MaximumHeartRateBpm>/)?.[1] ?? "").trim());
    if (Number.isFinite(lapMaxHr) && lapMaxHr > maxHr) maxHr = lapMaxHr;

    const gain = Number((lap.match(/<ns3:ElevationGain>([^<]+)<\/ns3:ElevationGain>/)?.[1] ?? "").trim());
    if (Number.isFinite(gain) && gain > 0) elevationGain += gain;
  }

  if (!Number.isFinite(totalTimeSec) || totalTimeSec <= 0) return null;
  if (!Number.isFinite(totalDistanceM) || totalDistanceM <= 0) return null;

  const avgHr = hrWeightSec > 0 ? Math.round(weightedHr / hrWeightSec) : null;
  const maxHrSafe = maxHr > 0 ? Math.round(maxHr) : null;
  const tssLike = Math.max(10, Math.round((totalTimeSec / 60) * ((avgHr ?? 140) / 130)));
  const canonicalKey = `run|${startAt}`;

  return {
    source: "smashrun",
    sport: "run",
    startAt,
    durationSec: Math.round(totalTimeSec),
    distanceM: Math.round(totalDistanceM),
    avgHr,
    maxHr: maxHrSafe,
    elevationM: elevationGain > 0 ? Math.round(elevationGain) : null,
    powerAvg: null,
    paceAvg: null,
    tssLike,
    trimp: tssLike,
    canonicalKey,
    rawFileHash: `smashrun:${path.basename(filepath)}:${hash}`,
    rawFilePath: filepath
  };
}

function parseSmashrunExport(smashrunDir: string): ParsedWorkout[] {
  if (!smashrunDir || !fs.existsSync(smashrunDir)) return [];
  const files = fs
    .readdirSync(smashrunDir)
    .filter((f) => f.toLowerCase().endsWith(".tcx"))
    .sort();

  const out: ParsedWorkout[] = [];
  for (const file of files) {
    try {
      const parsed = parseSmashrunTcxFile(path.join(smashrunDir, file));
      if (parsed) out.push(parsed);
    } catch {
      // ignore bad tcx file and continue import
    }
  }
  return out;
}

function lockRecentYearsToHealthfit(workout: ParsedWorkout): boolean {
  const year = Number(workout.startAt.slice(0, 4));
  if (!Number.isFinite(year)) return false;
  return (year === 2025 || year === 2026) && workout.source !== "healthfit";
}

export async function runIngest(options?: { onlyMissing?: boolean; recentDays?: number }) {
  const { importDir, smashrunDir } = getIngestDirectories();
  const onlyMissing = Boolean(options?.onlyMissing);
  const recentDays = options?.recentDays ?? 0;
  const cutoffTs =
    recentDays > 0
      ? new Date(Date.now() - recentDays * 24 * 60 * 60 * 1000).getTime()
      : null;
  const files = listIngestFilesSafe(importDir);

  // Prefer GPX over FIT when both represent the same workout start+sport.
  const gpxCanonicalKeys = new Set<string>();
  for (const filename of files) {
    if (!filename.endsWith(".gpx")) continue;
    const meta = parseFilenameMetadata(filename);
    if (!meta) continue;
    const sport = parseSport(meta.activity);
    if (!sport) continue;
    gpxCanonicalKeys.add(`${sport}|${meta.startAt}`);
  }

  const appleHealthExportPath = path.join(importDir, "apple_health_export", "export.xml");
  const useXmlWorkouts = process.env.REBUILD_INGEST_XML_WORKOUTS !== "0";
  let xmlWorkouts = useXmlWorkouts ? await parseAppleHealthExportWorkouts(appleHealthExportPath) : [];
  const smashrunWorkouts = parseSmashrunExport(smashrunDir);
  const hasSmashrunRuns = smashrunWorkouts.length > 0;
  if (hasSmashrunRuns) {
    xmlWorkouts = xmlWorkouts.filter((w) => w.sport !== "run");
  }

  const runId = createIngestRun(files.length + xmlWorkouts.length + smashrunWorkouts.length);

  const errors: string[] = [];
  let filesIngested = 0;
  let filesSkipped = 0;
  const xmlCanonicalKeys = new Set<string>();
  const smashrunCanonicalKeys = new Set<string>();

  for (const workout of smashrunWorkouts) {
    try {
      if (cutoffTs && Date.parse(workout.startAt) < cutoffTs) {
        filesSkipped += 1;
        continue;
      }
      if (lockRecentYearsToHealthfit(workout)) {
        filesSkipped += 1;
        continue;
      }
      if (onlyMissing && workout.canonicalKey && hasWorkoutByCanonicalKey(workout.canonicalKey)) {
        filesSkipped += 1;
        continue;
      }
      upsertWorkout({ id: randomUUID(), ...workout, shoeId: null });
      filesIngested += 1;
      if (workout.canonicalKey) smashrunCanonicalKeys.add(workout.canonicalKey);
    } catch (error) {
      errors.push(`smashrun:${(error as Error).message}`);
    }
  }

  for (const workout of xmlWorkouts) {
    try {
      if (cutoffTs && Date.parse(workout.startAt) < cutoffTs) {
        filesSkipped += 1;
        continue;
      }
      if (lockRecentYearsToHealthfit(workout)) {
        filesSkipped += 1;
        continue;
      }
      if (onlyMissing && workout.canonicalKey && hasWorkoutByCanonicalKey(workout.canonicalKey)) {
        filesSkipped += 1;
        continue;
      }
      upsertWorkout({ id: randomUUID(), ...workout, shoeId: null });
      filesIngested += 1;
      if (workout.canonicalKey) xmlCanonicalKeys.add(workout.canonicalKey);
    } catch (error) {
      errors.push(`apple_health_export:${(error as Error).message}`);
    }
  }

  for (const filename of files) {
    const filePath = path.join(importDir, filename);
    try {
      if ((filename.endsWith(".fit") || filename.endsWith(".gpx")) && isUnsupportedTargetActivity(filename)) {
        filesSkipped += 1;
        continue;
      }
      const meta = parseFilenameMetadata(filename);
      if (meta) {
        const sport = parseSport(meta.activity);
        if (cutoffTs && Date.parse(meta.startAt) < cutoffTs) {
          filesSkipped += 1;
          continue;
        }
        if (onlyMissing && sport && hasWorkoutByCanonicalKey(`${sport}|${meta.startAt}`)) {
          filesSkipped += 1;
          continue;
        }
        if (sport && xmlCanonicalKeys.has(`${sport}|${meta.startAt}`)) {
          filesSkipped += 1;
          continue;
        }
        if (sport && smashrunCanonicalKeys.has(`${sport}|${meta.startAt}`)) {
          filesSkipped += 1;
          continue;
        }
      }
      if (filename.endsWith(".fit")) {
        const meta = parseFilenameMetadata(filename);
        if (meta) {
          const sport = parseSport(meta.activity);
          if (sport && gpxCanonicalKeys.has(`${sport}|${meta.startAt}`)) {
            filesSkipped += 1;
            continue;
          }
        }
      }

      const parsed =
        filename.endsWith(".json") && !filename.endsWith(".geojson") ? parseJsonFile(filePath, filename) : parseHealthFitFile(filePath, filename);
      if (!parsed) {
        errors.push(`${filename}: מבנה קובץ או סוג פעילות לא נתמך`);
        continue;
      }
      if (lockRecentYearsToHealthfit(parsed)) {
        filesSkipped += 1;
        continue;
      }

      upsertWorkout({ id: randomUUID(), ...parsed, shoeId: null });
      filesIngested += 1;
    } catch (error) {
      errors.push(`${filename}: ${(error as Error).message}`);
    }
  }

  finishIngestRun(runId, errors.length === 0, filesIngested, errors);

  const dedupeResult = dedupeWorkouts();
  if (filesIngested > 0 || dedupeResult.removed > 0) {
    recomputeBestEffortsAll();
    recalculateNutritionFrom(undefined, 8);
  }

  return {
    jobId: runId,
    startedAt: new Date().toISOString(),
    filesQueued: files.length + xmlWorkouts.length + smashrunWorkouts.length,
    filesIngested,
    filesSkipped,
    errors
  };
}
