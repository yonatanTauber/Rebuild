import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { neon } from "@neondatabase/serverless";

type DbProvider = "sqlite" | "postgres";

type QueryResultRow = Record<string, unknown>;

type QueryResult<T extends QueryResultRow> = {
  rows: T[];
};

let sqliteDb: InstanceType<typeof Database> | null = null;
let pgSql: ReturnType<typeof neon> | null = null;

export function getDbProvider(): DbProvider {
  if (process.env.REBUILD_DB_PROVIDER?.trim() === "postgres") return "postgres";
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;
  if (process.env.VERCEL === "1" && url && url.startsWith("postgres")) return "postgres";
  return "sqlite";
}

function getSqlitePath() {
  const bundledDataDir = path.join(process.cwd(), "data");
  const isVercelRuntime = process.env.VERCEL === "1";
  const runtimeDataDir = isVercelRuntime ? path.join("/tmp", "rebuild-data") : bundledDataDir;
  if (!fs.existsSync(runtimeDataDir)) fs.mkdirSync(runtimeDataDir, { recursive: true });
  return path.join(runtimeDataDir, "rebuild.db");
}

function openSqlite() {
  if (sqliteDb) return sqliteDb;
  const dbPath = getSqlitePath();
  sqliteDb = new Database(dbPath);
  sqliteDb.exec(`PRAGMA journal_mode = ${process.env.VERCEL === "1" ? "DELETE" : "WAL"};`);
  sqliteDb.exec("PRAGMA busy_timeout = 5000;");
  return sqliteDb;
}

function openPostgres() {
  if (pgSql) return pgSql;
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;
  if (!url) {
    throw new Error("Missing DATABASE_URL/POSTGRES_URL for postgres provider.");
  }
  pgSql = neon(url);
  return pgSql;
}

function sqliteTransformPlaceholders(queryWithPlaceholders: string) {
  // Convert $1/$2/... placeholders to sqlite '?' placeholders.
  return queryWithPlaceholders.replace(/\$\d+/g, "?");
}

export async function dbExec(sqlText: string): Promise<void> {
  const provider = getDbProvider();
  if (provider === "postgres") {
    const sql = openPostgres();
    // Neon serverless doesn't allow multiple SQL commands in a single prepared statement.
    // Our migrations batch multiple CREATE TABLE statements; split and run sequentially.
    const statements = String(sqlText)
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      await sql.query(stmt);
    }
    return;
  }
  openSqlite().exec(sqlText);
}

export async function dbQuery<T extends QueryResultRow = QueryResultRow>(
  queryWithPlaceholders: string,
  params: unknown[] = []
): Promise<QueryResult<T>> {
  const provider = getDbProvider();
  if (provider === "postgres") {
    const sql = openPostgres();
    const rows = (await sql.query(queryWithPlaceholders, params)) as unknown as T[];
    return { rows };
  }

  const db = openSqlite();
  const query = sqliteTransformPlaceholders(queryWithPlaceholders);
  const stmt = db.prepare(query);
  // Heuristic: treat statements starting with SELECT/PRAGMA/WITH as returning rows.
  const head = query.trimStart().slice(0, 10).toUpperCase();
  if (head.startsWith("SELECT") || head.startsWith("WITH")) {
    return { rows: stmt.all(params) as T[] };
  }
  if (query.includes("RETURNING")) {
    return { rows: stmt.all(params) as T[] };
  }
  stmt.run(params);
  return { rows: [] as T[] };
}

export async function dbQueryOne<T extends QueryResultRow = QueryResultRow>(
  queryWithPlaceholders: string,
  params: unknown[] = []
): Promise<T | null> {
  const result = await dbQuery<T>(queryWithPlaceholders, params);
  return result.rows[0] ?? null;
}
