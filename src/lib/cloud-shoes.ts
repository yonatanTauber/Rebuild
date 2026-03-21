import { randomUUID } from "node:crypto";
import { dbQuery, dbQueryOne, getDbProvider } from "@/lib/db-driver";
import { migrateDb } from "@/lib/db-migrate";

type RunningShoeRow = {
  id: string;
  name: string;
  brand: string;
  startkm: number;
  targetkm: number;
  isdefault: number;
  active: number;
  createdat: string;
  updatedat: string;
  usedkm: number;
};

export async function ensureCloudShoesReady() {
  if (getDbProvider() !== "postgres") return;
  await migrateDb();
}

function mapShoe(row: Record<string, unknown>) {
  const get = <T>(key: string) => row[key] as T;
  const startKm = Number(get("startkm") ?? get("startKm") ?? 0);
  const targetKm = Number(get("targetkm") ?? get("targetKm") ?? 700);
  const usedKm = Number(get("usedkm") ?? get("usedKm") ?? 0);
  const totalKm = Math.round((startKm + usedKm) * 100) / 100;
  return {
    id: String(get("id")),
    name: String(get("name")),
    brand: String(get("brand")),
    startKm,
    targetKm,
    isDefault: Boolean(Number(get("isdefault") ?? get("isDefault") ?? 0)),
    active: Boolean(Number(get("active") ?? 1)),
    createdAt: String(get("createdat") ?? get("createdAt") ?? ""),
    updatedAt: String(get("updatedat") ?? get("updatedAt") ?? ""),
    usedKm: Math.round(usedKm * 100) / 100,
    totalKm,
    remainingKm: Math.round((targetKm - (startKm + usedKm)) * 100) / 100
  };
}

export async function cloudListRunningShoes() {
  await ensureCloudShoesReady();
  const res = await dbQuery<RunningShoeRow>(
    `
    SELECT
      s.*,
      COALESCE(SUM(CASE WHEN w.sport = 'run' THEN COALESCE(w.distanceM, 0) ELSE 0 END), 0) / 1000.0 as usedKm
    FROM running_shoes s
    LEFT JOIN workouts w ON w.shoeId = s.id
    WHERE s.active = 1
    GROUP BY s.id
    ORDER BY s.isDefault DESC, s.updatedAt DESC
    `
  );
  return res.rows.map((row) => mapShoe(row as unknown as Record<string, unknown>));
}

export async function cloudListRunningShoeBrands() {
  await ensureCloudShoesReady();
  const res = await dbQuery<{ name: string }>(`SELECT name FROM running_shoe_brands ORDER BY LOWER(name) ASC`);
  return res.rows.map((row) => String((row as any).name));
}

export async function cloudCreateRunningShoeBrand(nameRaw: string) {
  await ensureCloudShoesReady();
  const trimmed = String(nameRaw || "").trim();
  if (!trimmed) return null;
  const existing = await dbQueryOne<{ name: string }>(
    "SELECT name FROM running_shoe_brands WHERE LOWER(name) = LOWER($1) LIMIT 1",
    [trimmed]
  );
  if (existing?.name) return existing.name;
  const id = randomUUID();
  const now = new Date().toISOString();
  await dbQuery("INSERT INTO running_shoe_brands (id, name, createdAt) VALUES ($1,$2,$3)", [id, trimmed, now]);
  return trimmed;
}

export async function cloudCreateRunningShoe(input: {
  name: string;
  brand: string;
  startKm?: number;
  targetKm: number;
  isDefault?: boolean;
}) {
  await ensureCloudShoesReady();
  await cloudCreateRunningShoeBrand(input.brand);
  const id = randomUUID();
  const now = new Date().toISOString();
  if (input.isDefault) {
    await dbQuery("UPDATE running_shoes SET isDefault = 0, updatedAt = $1 WHERE isDefault = 1", [now]);
  }
  await dbQuery(
    `
    INSERT INTO running_shoes (id, name, brand, startKm, targetKm, isDefault, active, createdAt, updatedAt)
    VALUES ($1,$2,$3,$4,$5,$6,1,$7,$7)
    `,
    [
      id,
      String(input.name || "").trim(),
      String(input.brand || "").trim(),
      Math.max(0, Number(input.startKm ?? 0)),
      Math.max(1, Number(input.targetKm)),
      input.isDefault ? 1 : 0,
      now
    ]
  );
  return id;
}

export async function cloudUpdateRunningShoe(input: {
  id: string;
  name: string;
  brand: string;
  startKm: number;
  targetKm: number;
  isDefault?: boolean;
}) {
  await ensureCloudShoesReady();
  await cloudCreateRunningShoeBrand(input.brand);
  const now = new Date().toISOString();
  if (input.isDefault) {
    await dbQuery("UPDATE running_shoes SET isDefault = 0, updatedAt = $1 WHERE isDefault = 1", [now]);
  }
  await dbQuery(
    `
    UPDATE running_shoes
    SET name = $1,
        brand = $2,
        startKm = $3,
        targetKm = $4,
        isDefault = CASE WHEN $5 THEN 1 ELSE isDefault END,
        updatedAt = $6
    WHERE id = $7
    `,
    [
      String(input.name || "").trim(),
      String(input.brand || "").trim(),
      Math.max(0, Number(input.startKm ?? 0)),
      Math.max(1, Number(input.targetKm ?? 700)),
      Boolean(input.isDefault),
      now,
      input.id
    ]
  );
}

export async function cloudSetDefaultRunningShoe(shoeId: string) {
  await ensureCloudShoesReady();
  const now = new Date().toISOString();
  await dbQuery("UPDATE running_shoes SET isDefault = 0, updatedAt = $1 WHERE isDefault = 1", [now]);
  await dbQuery("UPDATE running_shoes SET isDefault = 1, updatedAt = $1 WHERE id = $2", [now, shoeId]);
}

export async function cloudAssignShoeToWorkout(workoutId: string, shoeId: string | null): Promise<number | null> {
  await ensureCloudShoesReady();
  if (!shoeId) {
    await dbQuery("UPDATE workouts SET shoeId = NULL, shoeKmAtAssign = NULL WHERE id = $1", [workoutId]);
    return null;
  }

  const workout = await dbQueryOne<{ sport: string; distancem: number }>(
    `SELECT sport, COALESCE(distanceM, 0) AS distanceM FROM workouts WHERE id = $1 LIMIT 1`,
    [workoutId]
  );
  if (!workout) return null;

  const shoe = await dbQueryOne<{ startkm: number }>(
    `SELECT startKm FROM running_shoes WHERE id = $1 LIMIT 1`,
    [shoeId]
  );
  if (!shoe) return null;

  const usage = await dbQueryOne<{ usedkm: number }>(
    `
    SELECT COALESCE(SUM(CASE WHEN sport = 'run' THEN COALESCE(distanceM, 0) ELSE 0 END), 0) / 1000.0 AS usedKm
    FROM workouts
    WHERE shoeId = $1
      AND id <> $2
    `,
    [shoeId, workoutId]
  );

  const sport = String((workout as any).sport);
  const distanceM = Number((workout as any).distancem ?? (workout as any).distanceM ?? 0);
  const startKm = Number((shoe as any).startkm ?? (shoe as any).startKm ?? 0);
  const usedKm = Number((usage as any)?.usedkm ?? (usage as any)?.usedKm ?? 0);
  const workoutDistanceKm = sport === "run" ? Math.max(0, distanceM / 1000.0) : 0;
  const shoeKmAtAssign = Number((startKm + usedKm + workoutDistanceKm).toFixed(3));

  await dbQuery("UPDATE workouts SET shoeId = $1, shoeKmAtAssign = $2 WHERE id = $3", [shoeId, shoeKmAtAssign, workoutId]);
  return shoeKmAtAssign;
}

export async function cloudGetPendingRunShoeAssignments(limit = 6) {
  await ensureCloudShoesReady();
  const since = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString();
  const res = await dbQuery<Record<string, unknown>>(
    `
    SELECT id as workoutId, startAt, distanceM, durationSec
    FROM workouts
    WHERE sport = 'run'
      AND shoeId IS NULL
      AND startAt >= $1
    ORDER BY startAt DESC
    LIMIT $2
    `,
    [since, limit]
  );
  return res.rows.map((row) => ({
    workoutId: String((row as any).workoutid ?? (row as any).workoutId ?? (row as any).id),
    startAt: String((row as any).startat ?? (row as any).startAt),
    distanceM: (row as any).distancem == null && (row as any).distanceM == null ? null : Number((row as any).distancem ?? (row as any).distanceM),
    durationSec: Number((row as any).durationsec ?? (row as any).durationSec ?? 0)
  }));
}

