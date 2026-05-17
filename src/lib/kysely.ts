import { Kysely, SqliteDialect, PostgresDialect } from "kysely";
import Database from "better-sqlite3";
import { Pool } from "pg";
import { mkdirSync, existsSync } from "fs";
import { resolve, join } from "path";
import type { DB } from "./db-types";

let _db: Kysely<DB> | null = null;
let _sqliteHandle: Database.Database | null = null;
let _pgPool: Pool | null = null;

export type Driver = "sqlite" | "supabase";

export function currentDriver(): Driver {
  const v = (process.env.DB_DRIVER ?? "sqlite").toLowerCase();
  if (v !== "sqlite" && v !== "supabase") {
    throw new Error(`DB_DRIVER must be "sqlite" or "supabase", got: ${v}`);
  }
  return v;
}

export function getDb(): Kysely<DB> {
  if (_db) return _db;
  const driver = currentDriver();

  if (driver === "sqlite") {
    const dataDir = resolve(process.cwd(), "data");
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
    const dbPath = process.env.DB_PATH ?? join(dataDir, "shop.db");
    _sqliteHandle = new Database(dbPath);
    _sqliteHandle.pragma("journal_mode = WAL");
    _sqliteHandle.pragma("foreign_keys = ON");
    _db = new Kysely<DB>({ dialect: new SqliteDialect({ database: _sqliteHandle }) });
  } else {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is required when DB_DRIVER=supabase");
    _pgPool = new Pool({ connectionString: url, max: 10 });
    _db = new Kysely<DB>({ dialect: new PostgresDialect({ pool: _pgPool }) });
  }
  return _db;
}

export function sqliteHandle(): Database.Database | null {
  return _sqliteHandle;
}

export async function closeDb(): Promise<void> {
  if (_db) {
    await _db.destroy();
    _db = null;
  }
  _sqliteHandle = null;
  _pgPool = null;
}

// Format matches SQLite's datetime('now') output ("YYYY-MM-DD HH:MM:SS")
// so historical rows stay sort-comparable across the migration.
export function nowIso(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}
