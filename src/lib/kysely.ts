import { Kysely, SqliteDialect, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { mkdirSync, existsSync } from "fs";
import { resolve, join } from "path";
import type { DB } from "./db-types";

// better-sqlite3 is a native module. On serverless runtimes (Vercel,
// Cloudflare, etc.) the prebuilt binary isn't shipped and importing it
// at module load crashes the function. We only need it when DB_DRIVER=sqlite,
// so use a typed `any` placeholder and `require()` it lazily inside getDb.
// On a normal Node host with sqlite, this still resolves the same module.
type SqliteDbHandle = {
  pragma(pragma: string): unknown;
  exec(sql: string): unknown;
  backup(dest: string): Promise<unknown>;
  close(): void;
};

let _db: Kysely<DB> | null = null;
let _sqliteHandle: SqliteDbHandle | null = null;
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
    // Lazy require — see note at top.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3");
    _sqliteHandle = new Database(dbPath) as SqliteDbHandle;
    _sqliteHandle.pragma("journal_mode = WAL");
    _sqliteHandle.pragma("foreign_keys = ON");
    _db = new Kysely<DB>({ dialect: new SqliteDialect({ database: _sqliteHandle as any }) });
  } else {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is required when DB_DRIVER=supabase");
    // On serverless we want a small pool because each cold function creates
    // a fresh one. Long-running hosts can use a bigger pool by setting
    // PG_POOL_MAX. Default 4 is safe for either case.
    const max = Number(process.env.PG_POOL_MAX ?? 4);
    _pgPool = new Pool({ connectionString: url, max });
    _db = new Kysely<DB>({ dialect: new PostgresDialect({ pool: _pgPool }) });
  }
  return _db;
}

export function sqliteHandle(): SqliteDbHandle | null {
  return _sqliteHandle;
}

export async function closeDb(): Promise<void> {
  if (_db) {
    await _db.destroy();
    _db = null;
  }
  _sqliteHandle = null;
  _pgPool = null;
  // Settings module caches reads in-memory; closing the DB invalidates it.
  // Defer-loaded to avoid a circular import with the model layer.
  try {
    const { _invalidateCache } = await import("../models/settings");
    _invalidateCache();
  } catch {
    /* settings module may not have loaded yet — fine */
  }
  // Same for the reports cache.
  try {
    const { invalidate } = await import("./cache");
    invalidate("");
  } catch {
    /* not loaded yet — fine */
  }
}

// Format matches SQLite's datetime('now') output ("YYYY-MM-DD HH:MM:SS")
// so historical rows stay sort-comparable across the migration.
export function nowIso(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}
