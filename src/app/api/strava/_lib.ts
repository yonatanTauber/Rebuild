import { sql } from "@vercel/postgres";

export type StravaTokenRow = {
  athlete_id: string | null;
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope: string | null;
};

export async function ensureStravaTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS strava_tokens (
      id INTEGER PRIMARY KEY,
      athlete_id TEXT,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_at BIGINT NOT NULL,
      scope TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS strava_webhook (
      id INTEGER PRIMARY KEY,
      subscription_id TEXT,
      callback_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS strava_sync_state (
      id INTEGER PRIMARY KEY,
      next_page INTEGER NOT NULL DEFAULT 1,
      done BOOLEAN NOT NULL DEFAULT false,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS strava_activity_streams (
      activityId BIGINT PRIMARY KEY,
      streamsJson TEXT NOT NULL,
      fetchedAt TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS workouts (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      userId TEXT,
      sport TEXT NOT NULL,
      startAt TEXT NOT NULL,
      durationSec INTEGER NOT NULL,
      distanceM DOUBLE PRECISION,
      avgHr DOUBLE PRECISION,
      maxHr DOUBLE PRECISION,
      elevationM DOUBLE PRECISION,
      powerAvg DOUBLE PRECISION,
      paceAvg DOUBLE PRECISION,
      tssLike DOUBLE PRECISION NOT NULL,
      trimp DOUBLE PRECISION NOT NULL,
      canonicalKey TEXT,
      rawFileHash TEXT UNIQUE NOT NULL,
      rawFilePath TEXT,
      shoeId TEXT,
      shoeKmAtAssign DOUBLE PRECISION
    );
  `;

  await sql`CREATE INDEX IF NOT EXISTS workouts_startAt_idx ON workouts(startAt);`;
  await sql`CREATE INDEX IF NOT EXISTS workouts_sport_startAt_idx ON workouts(sport, startAt);`;
}

export async function getStravaSyncState(): Promise<{ nextPage: number; done: boolean; updatedAt: string | null }> {
  await ensureStravaTables();
  const res =
    await sql<{ next_page: number; done: boolean; updated_at: string }>`SELECT next_page, done, updated_at FROM strava_sync_state WHERE id = 1`;
  const row = res.rows[0];
  if (!row) {
    return { nextPage: 1, done: false, updatedAt: null };
  }
  return { nextPage: Number(row.next_page ?? 1), done: Boolean(row.done), updatedAt: row.updated_at ?? null };
}

export async function upsertStravaSyncState(input: { nextPage: number; done: boolean }) {
  await ensureStravaTables();
  await sql`
    INSERT INTO strava_sync_state (id, next_page, done, updated_at)
    VALUES (1, ${Math.max(1, Math.round(input.nextPage))}, ${Boolean(input.done)}, now())
    ON CONFLICT (id) DO UPDATE
      SET next_page = EXCLUDED.next_page,
          done = EXCLUDED.done,
          updated_at = now()
  `;
}

export function getStravaEnv() {
  const clientId = process.env.STRAVA_CLIENT_ID?.trim() || "";
  const clientSecret = process.env.STRAVA_CLIENT_SECRET?.trim() || "";
  if (!clientId || !clientSecret) {
    return null;
  }
  return { clientId, clientSecret };
}

export function getStravaVerifyToken() {
  return process.env.STRAVA_VERIFY_TOKEN?.trim() || "";
}

export async function getStoredToken(): Promise<StravaTokenRow | null> {
  await ensureStravaTables();
  const res = await sql<StravaTokenRow>`SELECT athlete_id, access_token, refresh_token, expires_at, scope FROM strava_tokens WHERE id = 1`;
  return res.rows[0] ?? null;
}

export async function upsertToken(token: StravaTokenRow) {
  await ensureStravaTables();
  await sql`
    INSERT INTO strava_tokens (id, athlete_id, access_token, refresh_token, expires_at, scope, created_at, updated_at)
    VALUES (1, ${token.athlete_id}, ${token.access_token}, ${token.refresh_token}, ${token.expires_at}, ${token.scope}, now(), now())
    ON CONFLICT (id) DO UPDATE
      SET athlete_id = EXCLUDED.athlete_id,
          access_token = EXCLUDED.access_token,
          refresh_token = EXCLUDED.refresh_token,
          expires_at = EXCLUDED.expires_at,
          scope = EXCLUDED.scope,
          updated_at = now()
  `;
}

export async function refreshTokenIfNeeded(token: StravaTokenRow) {
  const nowSec = Math.floor(Date.now() / 1000);
  if (token.expires_at > nowSec + 60) return token;
  const env = getStravaEnv();
  if (!env) throw new Error("Missing STRAVA_CLIENT_ID/STRAVA_CLIENT_SECRET");

  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.clientId,
      client_secret: env.clientSecret,
      grant_type: "refresh_token",
      refresh_token: token.refresh_token
    })
  });
  if (!res.ok) {
    throw new Error(`Strava refresh failed (${res.status})`);
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_at: number;
  };
  const updated: StravaTokenRow = {
    athlete_id: token.athlete_id,
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: json.expires_at,
    scope: token.scope ?? null
  };
  await upsertToken(updated);
  return updated;
}

export type StravaActivity = {
  id: number;
  type: string;
  name: string;
  start_date: string;
  elapsed_time: number;
  moving_time: number;
  distance: number;
  average_heartrate?: number;
  max_heartrate?: number;
  total_elevation_gain?: number;
};

export function mapStravaSport(typeRaw: string) {
  const t = (typeRaw || "").toLowerCase();
  if (t.includes("run")) return "run";
  if (t.includes("ride")) return "bike";
  if (t.includes("swim")) return "swim";
  if (t.includes("weight") || t.includes("strength")) return "strength";
  return "strength";
}

export function estimateTssLike(activity: StravaActivity) {
  const minutes = Math.max(1, Math.round(activity.moving_time / 60));
  return Math.round(minutes * 1.25);
}

export async function upsertWorkoutFromStravaActivity(activity: StravaActivity) {
  await ensureStravaTables();
  const sport = mapStravaSport(activity.type);
  const startAt = activity.start_date;
  const durationSec = Math.max(1, Math.round(activity.elapsed_time));
  const distanceM = Number.isFinite(activity.distance) ? activity.distance : null;
  const avgHr = activity.average_heartrate != null ? Math.round(activity.average_heartrate) : null;
  const maxHr = activity.max_heartrate != null ? Math.round(activity.max_heartrate) : null;
  const elevationM = activity.total_elevation_gain != null ? Math.round(activity.total_elevation_gain) : null;
  const tssLike = estimateTssLike(activity);
  const trimp = Math.round(tssLike * 0.9);
  const canonicalKey = `${sport}|${startAt}`;
  const rawFileHash = `strava:${activity.id}`;

  const upsert = await sql`
    INSERT INTO workouts (
      id, source, userId, sport, startAt, durationSec, distanceM, avgHr, maxHr, elevationM,
      powerAvg, paceAvg, tssLike, trimp, canonicalKey, rawFileHash, rawFilePath, shoeId, shoeKmAtAssign
    ) VALUES (
      ${rawFileHash},
      'strava',
      NULL,
      ${sport},
      ${startAt},
      ${durationSec},
      ${distanceM},
      ${avgHr},
      ${maxHr},
      ${elevationM},
      NULL,
      NULL,
      ${tssLike},
      ${trimp},
      ${canonicalKey},
      ${rawFileHash},
      NULL,
      NULL,
      NULL
    )
    ON CONFLICT (id) DO UPDATE SET
      startAt = EXCLUDED.startAt,
      durationSec = EXCLUDED.durationSec,
      distanceM = EXCLUDED.distanceM,
      avgHr = EXCLUDED.avgHr,
      maxHr = EXCLUDED.maxHr,
      elevationM = EXCLUDED.elevationM,
      tssLike = EXCLUDED.tssLike,
      trimp = EXCLUDED.trimp,
      canonicalKey = EXCLUDED.canonicalKey
    RETURNING (xmax = 0) AS inserted;
  `;

  return Boolean((upsert.rows[0] as unknown as { inserted?: boolean })?.inserted);
}

export async function deleteWorkoutByStravaActivityId(activityId: number) {
  await ensureStravaTables();
  const rawFileHash = `strava:${activityId}`;
  await sql`DELETE FROM workouts WHERE id = ${rawFileHash}`;
}
