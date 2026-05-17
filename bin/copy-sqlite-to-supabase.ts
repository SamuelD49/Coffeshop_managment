import "dotenv/config";
import Database from "better-sqlite3";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { resolve } from "path";
import type { DB } from "../src/lib/db-types";

const SQLITE_PATH = process.env.SQLITE_SRC ?? resolve(process.cwd(), "data/shop.db");
const PG_URL = process.env.DATABASE_URL;
if (!PG_URL) {
  console.error("DATABASE_URL is required. Set it in .env.local (Supabase → Project Settings → Database → URI).");
  process.exit(1);
}

// Order matters: parents before children (FK).
const TABLES: Array<keyof DB> = [
  "employees",
  "guarantors",
  "attachments",
  "menu_items",
  "sales_sessions",
  "sale_line_items",
  "purchase_requisitions",
  "petty_cash_entries",
  "payroll_runs",
  "payroll_entries",
  "settings",
  "audit_log",
];

async function main() {
  console.log(`Reading from: ${SQLITE_PATH}`);
  const sqlite = new Database(SQLITE_PATH, { readonly: true });
  const pgPool = new Pool({ connectionString: PG_URL, max: 4 });
  const pg = new Kysely<DB>({ dialect: new PostgresDialect({ pool: pgPool }) });

  for (const table of TABLES) {
    const rows = sqlite.prepare(`SELECT * FROM ${table}`).all() as any[];
    if (rows.length === 0) {
      console.log(`${table}: 0 rows`);
      continue;
    }
    // Chunk inserts to stay under pg's parameter limit (≈ 65k per statement).
    const chunkSize = 500;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      await pg.insertInto(table as any).values(chunk as any).execute();
    }
    console.log(`${table}: ${rows.length} rows copied`);
  }

  // Re-sync SERIAL sequences so future inserts get correct ids. `settings`
  // has no id column, so skip it.
  console.log("Re-syncing sequences...");
  for (const table of TABLES) {
    if (table === "settings") continue;
    await sql`SELECT setval(pg_get_serial_sequence(${table}, 'id'), COALESCE((SELECT MAX(id) FROM ${sql.raw(table as string)}), 1), true)`.execute(pg);
  }

  await pg.destroy();
  sqlite.close();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
