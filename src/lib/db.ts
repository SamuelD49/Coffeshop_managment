import { readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { sql } from "kysely";
import { Pool } from "pg";
import { getDb, closeDb, currentDriver, sqliteHandle, nowIso } from "./kysely";

export { getDb, closeDb, currentDriver, sqliteHandle, nowIso };

// Migration files contain multiple statements separated by `;`. Kysely's
// `sql.raw` routes through `prepare()` which is single-statement on
// better-sqlite3, so we use each dialect's raw multi-statement entry point.
export async function runMigrations(): Promise<void> {
  const driver = currentDriver();
  const db = getDb();

  if (driver === "sqlite") {
    await sql`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `.execute(db);
  } else {
    await sql`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
      )
    `.execute(db);
  }

  const subdir = driver === "sqlite" ? "sqlite" : "postgres";
  const migrationsDir = resolve(process.cwd(), "migrations", subdir);
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

  const appliedRows = await db.selectFrom("schema_migrations").select("filename").execute();
  const applied = new Set(appliedRows.map((r) => r.filename));

  for (const file of files) {
    if (applied.has(file)) continue;
    const sqlText = readFileSync(join(migrationsDir, file), "utf-8");
    await applyMigration(driver, sqlText);
    await db.insertInto("schema_migrations").values({ filename: file }).execute();
    console.log(`Applied migration: ${file}`);
  }
}

async function applyMigration(driver: "sqlite" | "supabase", sqlText: string): Promise<void> {
  if (driver === "sqlite") {
    const handle = sqliteHandle();
    if (!handle) throw new Error("sqlite handle not initialized");
    handle.exec(sqlText);
    return;
  }
  const url = process.env.DATABASE_URL!;
  const pool = new Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sqlText);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}
