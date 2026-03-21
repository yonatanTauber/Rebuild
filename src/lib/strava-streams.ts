import { sql } from "@vercel/postgres";
import { ensureStravaTables, getStoredToken, refreshTokenIfNeeded } from "@/app/api/strava/_lib";

export type StravaStreams = {
  time?: { data: number[] };
  distance?: { data: number[] };
  heartrate?: { data: number[] };
  latlng?: { data: Array<[number, number]> };
};

function parseJsonSafe(raw: string): StravaStreams | null {
  try {
    const parsed = JSON.parse(raw) as StravaStreams;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function parseStravaActivityId(workoutIdOrHash: string): number | null {
  const match = String(workoutIdOrHash || "").match(/strava:(\d+)/i);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export async function getStravaActivityStreams(activityId: number): Promise<StravaStreams | null> {
  await ensureStravaTables();

  const cached = await sql<{ streamsjson: string }>`
    SELECT streamsJson as streamsJson
    FROM strava_activity_streams
    WHERE activityId = ${activityId}
    LIMIT 1
  `;
  const cachedRow = cached.rows[0];
  const cachedJson = (cachedRow as any)?.streamsjson ?? (cachedRow as any)?.streamsJson;
  if (cachedJson) {
    const parsed = parseJsonSafe(String(cachedJson));
    if (parsed) return parsed;
  }

  const stored = await getStoredToken();
  if (!stored) return null;
  const token = await refreshTokenIfNeeded(stored);

  const keys = ["time", "distance", "latlng", "heartrate"].join(",");
  const res = await fetch(
    `https://www.strava.com/api/v3/activities/${activityId}/streams?keys=${encodeURIComponent(keys)}&key_by_type=true`,
    {
      headers: {
        Authorization: `Bearer ${token.access_token}`
      }
    }
  );
  if (!res.ok) {
    return null;
  }

  const json = (await res.json().catch(() => null)) as StravaStreams | null;
  if (!json || typeof json !== "object") return null;

  await sql`
    INSERT INTO strava_activity_streams (activityId, streamsJson, fetchedAt)
    VALUES (${activityId}, ${JSON.stringify(json)}, now())
    ON CONFLICT (activityId) DO UPDATE
      SET streamsJson = EXCLUDED.streamsJson,
          fetchedAt = now()
  `;

  return json;
}
