# Supabase Full Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Coffeshop_managment app from local SQLite + local-disk uploads to Supabase (Postgres + Storage), while preserving the ability to run on local SQLite + local disk via `DB_DRIVER` and `STORAGE_DRIVER` env vars.

**Architecture:** Introduce Kysely as a dialect-agnostic query builder so every model writes one query that runs on both better-sqlite3 and node-postgres. All models and consumers become `async`. Migrations split into `migrations/sqlite/` and `migrations/postgres/` folders; a runner picks one based on `DB_DRIVER`. Uploads gain a storage abstraction with two implementations (local fs, Supabase Storage). Sessions, backups, and CSRF are wired conditionally. The default driver remains `sqlite` so existing local installs keep working without configuration changes.

**Tech Stack:** TypeScript, Express 5, Kysely, better-sqlite3 (existing), pg (new), @supabase/supabase-js (new), connect-sqlite3 (existing), connect-pg-simple (new), multer, sharp, EJS, vitest.

---

## File Structure

### New files

- `src/lib/db-types.ts` — Kysely `DB` interface (every table) and per-row types
- `src/lib/kysely.ts` — Kysely instance factory, dialect picker (replaces guts of `db.ts`)
- `src/lib/storage/index.ts` — `Storage` interface + factory based on `STORAGE_DRIVER`
- `src/lib/storage/local.ts` — filesystem implementation (current behavior)
- `src/lib/storage/supabase.ts` — Supabase Storage implementation
- `src/lib/supabase.ts` — singleton `@supabase/supabase-js` client (used by storage + future features)
- `migrations/sqlite/001_init.sql` — move from `migrations/001_init.sql`
- `migrations/sqlite/002_seed_settings.sql` — move
- `migrations/sqlite/003_menu_token_color.sql` — move
- `migrations/sqlite/004_payroll_bonus_penalty.sql` — move
- `migrations/postgres/001_init.sql` — Postgres-translated mirror
- `migrations/postgres/002_seed_settings.sql` — mirror
- `migrations/postgres/003_menu_token_color.sql` — mirror
- `migrations/postgres/004_payroll_bonus_penalty.sql` — mirror
- `bin/copy-sqlite-to-supabase.ts` — one-time data copy script
- `bin/copy-uploads-to-supabase.ts` — one-time file copy script
- `.env.example` — document all env vars
- `tests/lib/storage.test.ts` — storage abstraction tests

### Modified files

- `src/lib/db.ts` — becomes thin re-export of `getDb()` from `src/lib/kysely.ts`; `runMigrations()` rewritten async + dialect-aware
- `src/lib/session.ts` — conditional session store
- `src/lib/uploads.ts` — delegates to `Storage`; multer config stays
- `src/lib/backup.ts` — no-op or pg_dump invocation when driver=postgres
- `src/lib/audit.ts` — async, Kysely
- `src/lib/reports.ts` — async, Kysely
- `src/lib/setupStatus.ts` — async, Kysely
- `src/lib/onboarding.ts` — async, Kysely (if it touches DB)
- `src/server.ts` — `await runMigrations()`
- `src/models/*.ts` (11 files) — async + Kysely
- `src/controllers/*.ts` (12 files) — `await` on every model call
- `src/middleware/locals.ts`, `src/middleware/requireSetup.ts`, `src/middleware/requireAuth.ts`, `src/middleware/requireOwner.ts` — `await` if they touch models
- `src/routes/*.ts` — only the file-serving routes change (stream from `Storage`)
- `tests/models/*.test.ts` — `await` all model calls
- `tests/integration/*.test.ts` — `await` setup helpers; ensure DB_DRIVER=sqlite explicit
- `tests/audit.test.ts`, `tests/reports.test.ts`, `tests/onboarding.test.ts`, `tests/backup.test.ts` — async updates
- `package.json` — new deps + scripts
- `README.md` — env var documentation

### Deleted files

- `migrations/001_init.sql`, `002_seed_settings.sql`, `003_menu_token_color.sql`, `004_payroll_bonus_penalty.sql` (moved to `migrations/sqlite/`)

---

## Risk Notes

- This plan touches **~50 files**. Diff will be large but mechanical. Commit per task.
- The async conversion is a one-way ratchet: once a model returns `Promise<T>`, every caller must `await`. Don't try to half-convert.
- Kysely supports `RETURNING` on both SQLite (≥3.35) and Postgres, so `lastInsertRowid` becomes `.returning("id").executeTakeFirstOrThrow()` uniformly.
- SQLite stores booleans as `0/1` INTEGER. Postgres can do the same — **keep INTEGER for booleans** to avoid widespread type churn. No `BOOLEAN` columns.
- SQLite stores dates as TEXT ISO strings. Postgres can do the same with TEXT — **keep TEXT for dates** for the same reason. Don't migrate to `TIMESTAMPTZ`.
- `datetime('now')` (SQLite) vs `NOW()` (Postgres): drop column-level defaults that use these and instead set the value in app code (`new Date().toISOString()`). One source of truth.
- The session secret cookie / CSRF token / flash logic does not change — only the storage backend.
- File-serving route (`/employees/:id/files/:filename`) stays as a controller endpoint that streams; views don't change.

---

## Task 0: Pre-flight — confirm Supabase project + credentials

**Files:** none (operator step)

- [ ] **Step 1: Confirm Supabase project exists**

You need a Supabase project. From the Supabase dashboard → Project Settings → API, capture:

- `SUPABASE_URL` (e.g., `https://abcdefgh.supabase.co`)
- `SUPABASE_SERVICE_ROLE_KEY` (the long JWT under "service_role" — **server-side only**, never ship to client)

From Project Settings → Database → Connection string (URI), capture:

- `DATABASE_URL` (e.g., `postgresql://postgres.xxxx:PASSWORD@aws-0-region.pooler.supabase.com:5432/postgres`)

From Storage → create a bucket named `coffeshop` (private):

- `SUPABASE_STORAGE_BUCKET=coffeshop`

- [ ] **Step 2: Write `.env.local` (do not commit)**

```bash
# Existing
SESSION_SECRET=...                       # already set
PORT=3000

# Driver selection
DB_DRIVER=sqlite                         # default; flip to "supabase" to cut over
STORAGE_DRIVER=local                     # default; flip to "supabase" to cut over

# Supabase (only consulted when DB_DRIVER/STORAGE_DRIVER=supabase)
DATABASE_URL=postgresql://...
SUPABASE_URL=https://....supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_STORAGE_BUCKET=coffeshop
```

- [ ] **Step 3: Verify**

Run: `grep -E "^(DB_DRIVER|STORAGE_DRIVER|DATABASE_URL|SUPABASE_)" .env.local`
Expected: all five lines present.

- [ ] **Step 4: Commit `.env.example`**

Create `.env.example`:

```
SESSION_SECRET=change-me
PORT=3000

DB_DRIVER=sqlite
STORAGE_DRIVER=local

DATABASE_URL=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=coffeshop
```

```bash
git add .env.example
git commit -m "docs: document Supabase env vars in .env.example"
```

---

## Task 1: Install dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime deps**

Run: `npm install kysely pg @supabase/supabase-js connect-pg-simple`
Expected: `package.json` gains those four entries under `dependencies`.

- [ ] **Step 2: Install dev types**

Run: `npm install -D @types/pg @types/connect-pg-simple`
Expected: both added under `devDependencies`.

- [ ] **Step 3: Verify build is still clean**

Run: `npm run build`
Expected: PASS (no code uses new deps yet).

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS (no behavior change).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add kysely, pg, supabase-js, connect-pg-simple for Supabase migration"
```

---

## Task 2: Define the Kysely `DB` interface

**Files:**
- Create: `src/lib/db-types.ts`

- [ ] **Step 1: Write `src/lib/db-types.ts`**

```typescript
// Kysely's DB type — every table the app uses, with column types matching
// the schema. Keep booleans as 0|1 (number) and dates as ISO strings to
// match what both SQLite and Postgres return after Kysely deserialization.

import type { Generated, ColumnType } from "kysely";

// Timestamps default to NOW at insert in app code, so they're never null when read.
type TimestampString = string;

export interface EmployeesTable {
  id: Generated<number>;
  full_name: string;
  phone: string | null;
  national_id_number: string | null;
  national_id_type: string | null;
  date_of_birth: string | null;
  gender: string | null;
  marital_status: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relation: string | null;
  position: string | null;
  hire_date: string | null;
  termination_date: string | null;
  basic_salary: ColumnType<number, number | undefined, number>;
  username: string | null;
  password_hash: string | null;
  role: ColumnType<"owner" | "employee", "owner" | "employee" | undefined, "owner" | "employee">;
  is_active: ColumnType<number, number | undefined, number>;
  onboarding_status: ColumnType<"incomplete" | "complete", "incomplete" | "complete" | undefined, "incomplete" | "complete">;
  created_at: ColumnType<TimestampString, string | undefined, string>;
  updated_at: ColumnType<TimestampString, string | undefined, string>;
}

export interface GuarantorsTable {
  id: Generated<number>;
  employee_id: number;
  full_name: string;
  phone: string | null;
  address: string | null;
  relation_to_employee: string | null;
  national_id_number: string | null;
  national_id_type: string | null;
  occupation: string | null;
  workplace: string | null;
  notes: string | null;
  created_at: ColumnType<TimestampString, string | undefined, string>;
  updated_at: ColumnType<TimestampString, string | undefined, string>;
}

export interface AttachmentsTable {
  id: Generated<number>;
  owner_type: "employee" | "guarantor";
  owner_id: number;
  kind: "profile_photo" | "id_front" | "id_back" | "contract" | "guarantor_letter" | "other";
  filename: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: ColumnType<TimestampString, string | undefined, string>;
  uploaded_by: number | null;
  // Added in this migration to store thumbnails (was inferred from filename before).
  thumbnail: string | null;
}

export interface MenuItemsTable {
  id: Generated<number>;
  name: string;
  price: ColumnType<number, number | undefined, number>;
  sort_order: ColumnType<number, number | undefined, number>;
  is_active: ColumnType<number, number | undefined, number>;
  color_token: string | null;
  created_at: ColumnType<TimestampString, string | undefined, string>;
  updated_at: ColumnType<TimestampString, string | undefined, string>;
}

export interface SalesSessionsTable {
  id: Generated<number>;
  employee_id: number;
  business_date: string;
  shift: string | null;
  cash_amount: ColumnType<number, number | undefined, number>;
  bank_transfer_amount: ColumnType<number, number | undefined, number>;
  notes: string | null;
  status: ColumnType<"open" | "closed", "open" | "closed" | undefined, "open" | "closed">;
  created_at: ColumnType<TimestampString, string | undefined, string>;
  updated_at: ColumnType<TimestampString, string | undefined, string>;
}

export interface SaleLineItemsTable {
  id: Generated<number>;
  sales_session_id: number;
  menu_item_id: number;
  qty: ColumnType<number, number | undefined, number>;
  unit_price_snapshot: number;
  total: number;
  remark: string | null;
  created_at: ColumnType<TimestampString, string | undefined, string>;
  updated_at: ColumnType<TimestampString, string | undefined, string>;
}

export interface PurchaseRequisitionsTable {
  id: Generated<number>;
  purchase_date: string;
  description: string;
  unit: string | null;
  qty: ColumnType<number, number | undefined, number>;
  unit_price: ColumnType<number, number | undefined, number>;
  total: ColumnType<number, number | undefined, number>;
  remark: string | null;
  entered_by: number | null;
  created_at: ColumnType<TimestampString, string | undefined, string>;
  updated_at: ColumnType<TimestampString, string | undefined, string>;
}

export interface PettyCashEntriesTable {
  id: Generated<number>;
  entry_date: string;
  description: string;
  payer_name: string | null;
  amount: ColumnType<number, number | undefined, number>;
  type: "expense" | "refund" | "replenishment";
  remark: string | null;
  entered_by: number | null;
  created_at: ColumnType<TimestampString, string | undefined, string>;
  updated_at: ColumnType<TimestampString, string | undefined, string>;
}

export interface PayrollRunsTable {
  id: Generated<number>;
  year: number;
  month: number;
  status: ColumnType<"draft" | "approved", "draft" | "approved" | undefined, "draft" | "approved">;
  prepared_by: number | null;
  approved_by: number | null;
  created_at: ColumnType<TimestampString, string | undefined, string>;
  updated_at: ColumnType<TimestampString, string | undefined, string>;
}

export interface PayrollEntriesTable {
  id: Generated<number>;
  payroll_run_id: number;
  employee_id: number;
  days_worked: ColumnType<number, number | undefined, number>;
  basic_salary: ColumnType<number, number | undefined, number>;
  pension_employer_pct: ColumnType<number, number | undefined, number>;
  pension_employee_pct: ColumnType<number, number | undefined, number>;
  pension_employer_amount: ColumnType<number, number | undefined, number>;
  pension_employee_amount: ColumnType<number, number | undefined, number>;
  gross_salary: ColumnType<number, number | undefined, number>;
  income_tax: ColumnType<number, number | undefined, number>;
  advance_salary: ColumnType<number, number | undefined, number>;
  bonus: ColumnType<number, number | undefined, number>;
  penalty: ColumnType<number, number | undefined, number>;
  total_deduction: ColumnType<number, number | undefined, number>;
  net_payment: ColumnType<number, number | undefined, number>;
  signed_at: string | null;
  created_at: ColumnType<TimestampString, string | undefined, string>;
  updated_at: ColumnType<TimestampString, string | undefined, string>;
}

export interface SettingsTable {
  key: string;
  value: string;
  updated_at: ColumnType<TimestampString, string | undefined, string>;
}

export interface AuditLogTable {
  id: Generated<number>;
  actor_id: number | null;
  action: string;
  entity: string;
  entity_id: number | null;
  at: ColumnType<TimestampString, string | undefined, string>;
}

export interface SchemaMigrationsTable {
  filename: string;
  applied_at: ColumnType<TimestampString, string | undefined, string>;
}

export interface DB {
  employees: EmployeesTable;
  guarantors: GuarantorsTable;
  attachments: AttachmentsTable;
  menu_items: MenuItemsTable;
  sales_sessions: SalesSessionsTable;
  sale_line_items: SaleLineItemsTable;
  purchase_requisitions: PurchaseRequisitionsTable;
  petty_cash_entries: PettyCashEntriesTable;
  payroll_runs: PayrollRunsTable;
  payroll_entries: PayrollEntriesTable;
  settings: SettingsTable;
  audit_log: AuditLogTable;
  schema_migrations: SchemaMigrationsTable;
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db-types.ts
git commit -m "types: define Kysely DB interface for every table"
```

---

## Task 3: Kysely instance factory with dialect picker

**Files:**
- Create: `src/lib/kysely.ts`

- [ ] **Step 1: Write `src/lib/kysely.ts`**

```typescript
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

// Exposed for backup.ts (only meaningful for sqlite driver).
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

export function nowIso(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
  // Format matches SQLite's datetime('now') output ("YYYY-MM-DD HH:MM:SS")
  // so historical rows stay sort-comparable.
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/kysely.ts
git commit -m "db: kysely instance factory with sqlite/postgres dialect switch"
```

---

## Task 4: Split migrations folder

**Files:**
- Create: `migrations/sqlite/` (move existing files here)
- Create: `migrations/postgres/` (new files)
- Delete: `migrations/*.sql` (top-level)

- [ ] **Step 1: Move existing SQLite migrations**

Run:
```bash
mkdir -p migrations/sqlite migrations/postgres
git mv migrations/001_init.sql migrations/sqlite/001_init.sql
git mv migrations/002_seed_settings.sql migrations/sqlite/002_seed_settings.sql
git mv migrations/003_menu_token_color.sql migrations/sqlite/003_menu_token_color.sql
git mv migrations/004_payroll_bonus_penalty.sql migrations/sqlite/004_payroll_bonus_penalty.sql
```
Expected: `ls migrations/sqlite` shows all four files.

- [ ] **Step 2: Add `thumbnail` column to attachments in sqlite folder**

Create `migrations/sqlite/005_attachment_thumbnail.sql`:

```sql
ALTER TABLE attachments ADD COLUMN thumbnail TEXT;
```

This column was previously inferred from filename (`thumb_<basename>.webp`). Storing it explicitly makes the storage layer pluggable without re-parsing filenames.

- [ ] **Step 3: Write `migrations/postgres/001_init.sql`**

```sql
-- Employees + HR
CREATE TABLE employees (
  id SERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  phone TEXT,
  national_id_number TEXT,
  national_id_type TEXT,
  date_of_birth TEXT,
  gender TEXT,
  marital_status TEXT,
  address TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  emergency_contact_relation TEXT,
  position TEXT,
  hire_date TEXT,
  termination_date TEXT,
  basic_salary INTEGER NOT NULL DEFAULT 0,
  username TEXT UNIQUE,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('owner','employee')),
  is_active INTEGER NOT NULL DEFAULT 1,
  onboarding_status TEXT NOT NULL DEFAULT 'incomplete' CHECK (onboarding_status IN ('incomplete','complete')),
  created_at TEXT NOT NULL DEFAULT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
  updated_at TEXT NOT NULL DEFAULT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);
CREATE INDEX idx_employees_username ON employees(username);
CREATE INDEX idx_employees_active ON employees(is_active);

CREATE TABLE guarantors (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  relation_to_employee TEXT,
  national_id_number TEXT,
  national_id_type TEXT,
  occupation TEXT,
  workplace TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
  updated_at TEXT NOT NULL DEFAULT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);
CREATE INDEX idx_guarantors_employee ON guarantors(employee_id);

CREATE TABLE attachments (
  id SERIAL PRIMARY KEY,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('employee','guarantor')),
  owner_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('profile_photo','id_front','id_back','contract','guarantor_letter','other')),
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  uploaded_at TEXT NOT NULL DEFAULT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
  uploaded_by INTEGER REFERENCES employees(id),
  thumbnail TEXT
);
CREATE INDEX idx_attachments_owner ON attachments(owner_type, owner_id);

CREATE TABLE menu_items (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  color_token TEXT,
  created_at TEXT NOT NULL DEFAULT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
  updated_at TEXT NOT NULL DEFAULT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);
CREATE INDEX idx_menu_active_sort ON menu_items(is_active, sort_order);

CREATE TABLE sales_sessions (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  business_date TEXT NOT NULL,
  shift TEXT,
  cash_amount INTEGER NOT NULL DEFAULT 0,
  bank_transfer_amount INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at TEXT NOT NULL DEFAULT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
  updated_at TEXT NOT NULL DEFAULT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);
CREATE INDEX idx_sales_date ON sales_sessions(business_date);
CREATE INDEX idx_sales_employee_date ON sales_sessions(employee_id, business_date);

CREATE TABLE sale_line_items (
  id SERIAL PRIMARY KEY,
  sales_session_id INTEGER NOT NULL REFERENCES sales_sessions(id) ON DELETE CASCADE,
  menu_item_id INTEGER NOT NULL REFERENCES menu_items(id),
  qty INTEGER NOT NULL DEFAULT 0,
  unit_price_snapshot INTEGER NOT NULL,
  total INTEGER NOT NULL,
  remark TEXT,
  created_at TEXT NOT NULL DEFAULT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
  updated_at TEXT NOT NULL DEFAULT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);
CREATE INDEX idx_sale_lines_session ON sale_line_items(sales_session_id);

CREATE TABLE purchase_requisitions (
  id SERIAL PRIMARY KEY,
  purchase_date TEXT NOT NULL,
  description TEXT NOT NULL,
  unit TEXT,
  qty DOUBLE PRECISION NOT NULL DEFAULT 0,
  unit_price INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  remark TEXT,
  entered_by INTEGER REFERENCES employees(id),
  created_at TEXT NOT NULL DEFAULT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
  updated_at TEXT NOT NULL DEFAULT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);
CREATE INDEX idx_purchases_date ON purchase_requisitions(purchase_date);

CREATE TABLE petty_cash_entries (
  id SERIAL PRIMARY KEY,
  entry_date TEXT NOT NULL,
  description TEXT NOT NULL,
  payer_name TEXT,
  amount INTEGER NOT NULL DEFAULT 0,
  type TEXT NOT NULL CHECK (type IN ('expense','refund','replenishment')),
  remark TEXT,
  entered_by INTEGER REFERENCES employees(id),
  created_at TEXT NOT NULL DEFAULT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
  updated_at TEXT NOT NULL DEFAULT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);
CREATE INDEX idx_petty_date ON petty_cash_entries(entry_date);

CREATE TABLE payroll_runs (
  id SERIAL PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved')),
  prepared_by INTEGER REFERENCES employees(id),
  approved_by INTEGER REFERENCES employees(id),
  created_at TEXT NOT NULL DEFAULT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
  updated_at TEXT NOT NULL DEFAULT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
  UNIQUE (year, month)
);

CREATE TABLE payroll_entries (
  id SERIAL PRIMARY KEY,
  payroll_run_id INTEGER NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  days_worked DOUBLE PRECISION NOT NULL DEFAULT 0,
  basic_salary INTEGER NOT NULL DEFAULT 0,
  pension_employer_pct DOUBLE PRECISION NOT NULL DEFAULT 0,
  pension_employee_pct DOUBLE PRECISION NOT NULL DEFAULT 0,
  pension_employer_amount INTEGER NOT NULL DEFAULT 0,
  pension_employee_amount INTEGER NOT NULL DEFAULT 0,
  gross_salary INTEGER NOT NULL DEFAULT 0,
  income_tax INTEGER NOT NULL DEFAULT 0,
  advance_salary INTEGER NOT NULL DEFAULT 0,
  bonus INTEGER NOT NULL DEFAULT 0,
  penalty INTEGER NOT NULL DEFAULT 0,
  total_deduction INTEGER NOT NULL DEFAULT 0,
  net_payment INTEGER NOT NULL DEFAULT 0,
  signed_at TEXT,
  created_at TEXT NOT NULL DEFAULT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
  updated_at TEXT NOT NULL DEFAULT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
  UNIQUE (payroll_run_id, employee_id)
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE audit_log (
  id SERIAL PRIMARY KEY,
  actor_id INTEGER REFERENCES employees(id),
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  at TEXT NOT NULL DEFAULT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);
CREATE INDEX idx_audit_at ON audit_log(at);
CREATE INDEX idx_audit_entity ON audit_log(entity, entity_id);
```

This is the Postgres-flavored union of 001 + 003 (color_token) + 004 (bonus, penalty) + the new 005 (thumbnail). Files 002-005 in `migrations/postgres/` should be empty no-ops to keep filename parity:

- [ ] **Step 4: Write `migrations/postgres/002_seed_settings.sql`** — copy verbatim from `migrations/sqlite/002_seed_settings.sql` (settings INSERTs are SQL-standard).

- [ ] **Step 5: Write `migrations/postgres/003_menu_token_color.sql`** as a no-op (already in 001):

```sql
-- Folded into 001_init.sql for the Postgres dialect. No-op for parity.
SELECT 1;
```

- [ ] **Step 6: Write `migrations/postgres/004_payroll_bonus_penalty.sql`** as a no-op (already in 001):

```sql
-- Folded into 001_init.sql for the Postgres dialect. No-op for parity.
SELECT 1;
```

- [ ] **Step 7: Write `migrations/postgres/005_attachment_thumbnail.sql`** as a no-op (already in 001):

```sql
-- Folded into 001_init.sql for the Postgres dialect. No-op for parity.
SELECT 1;
```

- [ ] **Step 8: Commit**

```bash
git add migrations/
git commit -m "migrations: split sqlite/postgres folders, add attachments.thumbnail column"
```

---

## Task 5: Dialect-aware migration runner

**Files:**
- Modify: `src/lib/db.ts`

- [ ] **Step 1: Replace `src/lib/db.ts`**

```typescript
import { readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { sql } from "kysely";
import { getDb, closeDb, currentDriver, sqliteHandle, nowIso } from "./kysely";

export { getDb, closeDb, currentDriver, sqliteHandle, nowIso };

export async function runMigrations(): Promise<void> {
  const driver = currentDriver();
  const db = getDb();

  // Bootstrap the migrations table (dialect-specific DDL).
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

  const migrationsDir = resolve(process.cwd(), "migrations", driver === "sqlite" ? "sqlite" : "postgres");
  const files = readdirSync(migrationsDir).filter(f => f.endsWith(".sql")).sort();

  const appliedRows = await db.selectFrom("schema_migrations").select("filename").execute();
  const applied = new Set(appliedRows.map(r => r.filename));

  for (const file of files) {
    if (applied.has(file)) continue;
    const sqlText = readFileSync(join(migrationsDir, file), "utf-8");
    await db.transaction().execute(async (trx) => {
      await sql.raw(sqlText).execute(trx);
      await trx.insertInto("schema_migrations").values({ filename: file }).execute();
    });
    console.log(`Applied migration: ${file}`);
  }
}
```

- [ ] **Step 2: Update `src/server.ts` to await migrations**

Edit `src/server.ts` line 10:

```typescript
// Before
runMigrations();

// After
await runMigrations();
```

Wrap top-level in async IIFE since `await` at top level needs ESM or an IIFE. The file is currently CJS (`"type": "commonjs"`), so use an IIFE:

```typescript
import "dotenv/config";
import cron from "node-cron";
import os from "os";
import { app } from "./app";
import { runMigrations } from "./lib/db";
import { runBackup, pruneOldBackups } from "./lib/backup";

const port = Number(process.env.PORT ?? 3000);

function listenAddresses(): string[] {
  const out: string[] = ["http://localhost:" + port];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const a of ifaces[name] ?? []) {
      if (a.family === "IPv4" && !a.internal) {
        out.push("http://" + a.address + ":" + port);
      }
    }
  }
  return out;
}

(async () => {
  await runMigrations();

  if (process.env.NODE_ENV !== "test") {
    cron.schedule("30 2 * * *", async () => {
      try {
        const path = await runBackup();
        const removed = pruneOldBackups(30);
        console.log(`Backup written: ${path}; pruned ${removed.length} old file(s)`);
      } catch (err) {
        console.error("Backup failed:", err);
      }
    });
  }

  app.listen(port, () => {
    console.log("Listening on:");
    for (const url of listenAddresses()) console.log("  " + url);
  });
})().catch(err => {
  console.error("Startup failed:", err);
  process.exit(1);
});
```

- [ ] **Step 3: Update tests that call `runMigrations()`**

Run: `grep -rn "runMigrations" tests/`

Every match — wrap the call in `await` and ensure the surrounding hook (`beforeAll`/`beforeEach`) is async. Example pattern:

```typescript
// Before
beforeAll(() => {
  runMigrations();
});

// After
beforeAll(async () => {
  await runMigrations();
});
```

- [ ] **Step 4: Smoke test — sqlite still works**

Run: `rm -rf data/shop.db data/shop.db-shm data/shop.db-wal && DB_DRIVER=sqlite npm test`
Expected: most tests still PASS (model tests will fail until Task 7+; runner-level tests should pass).

If model tests blanket-fail with "getDb is not a function" or similar, that's expected and resolved by Tasks 7-11. Skip those tests with `.skip` temporarily if needed, but commit them un-skipped — they're the regression fence.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db.ts src/server.ts tests/
git commit -m "db: async dialect-aware migration runner"
```

---

## Task 6: Audit log helper conversion (smallest model — proves the pattern)

**Files:**
- Modify: `src/lib/audit.ts`
- Modify: `tests/audit.test.ts`

The current `audit.ts` is 17 lines and is called from many controllers. Converting it first proves the async-propagation pattern.

- [ ] **Step 1: Read the current `src/lib/audit.ts`**

Read: `src/lib/audit.ts` to know its exact signatures.

- [ ] **Step 2: Rewrite as async + Kysely**

```typescript
import { getDb, nowIso } from "./kysely";

export async function logAction(opts: {
  actor_id: number | null;
  action: string;
  entity: string;
  entity_id: number | null;
}): Promise<void> {
  await getDb().insertInto("audit_log").values({
    actor_id: opts.actor_id,
    action: opts.action,
    entity: opts.entity,
    entity_id: opts.entity_id,
    at: nowIso(),
  }).execute();
}

export async function recentActions(limit: number = 50): Promise<Array<{
  id: number;
  actor_id: number | null;
  action: string;
  entity: string;
  entity_id: number | null;
  at: string;
}>> {
  return await getDb()
    .selectFrom("audit_log")
    .selectAll()
    .orderBy("at", "desc")
    .limit(limit)
    .execute();
}
```

If the actual current file has different exports, mirror those exports — keep names identical so callers don't have to change.

- [ ] **Step 3: Update `tests/audit.test.ts`**

Change every `logAction(...)` call to `await logAction(...)`, wrap the containing test fn in `async`.

- [ ] **Step 4: Update controllers that call `logAction`**

Run: `grep -rn "logAction\|recentActions" src/`

For each match outside `src/lib/audit.ts`, prefix the call with `await` and make the enclosing function `async`. If the enclosing function is already `async`, just add `await`.

- [ ] **Step 5: Run audit tests**

Run: `DB_DRIVER=sqlite npx vitest run tests/audit.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/audit.ts src/controllers/ tests/audit.test.ts
git commit -m "audit: convert to async Kysely, await all callers"
```

---

## Task 7: Settings model conversion

**Files:**
- Modify: `src/models/settings.ts`
- Modify: `src/controllers/settingsController.ts`
- Modify: `src/controllers/setupController.ts`
- Modify: `src/lib/setupStatus.ts`
- Modify: `src/middleware/locals.ts` (if it reads settings)
- Modify: `src/middleware/requireSetup.ts` (if it reads settings)
- Modify: `tests/models/settings.test.ts`

`settings` is small (32 lines) and read at app boot by `requireSetup` middleware. Converting it forces the middleware-async pattern.

- [ ] **Step 1: Inspect current file**

Read `src/models/settings.ts`. Note every exported function signature.

- [ ] **Step 2: Rewrite using Kysely**

```typescript
import { getDb, nowIso } from "../lib/kysely";

export async function get(key: string): Promise<string | null> {
  const row = await getDb().selectFrom("settings").select("value").where("key", "=", key).executeTakeFirst();
  return row?.value ?? null;
}

export async function set(key: string, value: string): Promise<void> {
  const now = nowIso();
  await getDb()
    .insertInto("settings")
    .values({ key, value, updated_at: now })
    .onConflict(oc => oc.column("key").doUpdateSet({ value, updated_at: now }))
    .execute();
}

export async function getAll(): Promise<Record<string, string>> {
  const rows = await getDb().selectFrom("settings").selectAll().execute();
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}
```

If the existing file has more exports, mirror them with the same `async` shape.

- [ ] **Step 3: Update every caller**

Run: `grep -rn 'from "../models/settings"\|from "../../models/settings"' src/ tests/`

For each file:
- If a function calls `settings.get(...)`, change to `await settings.get(...)`.
- Make the enclosing function `async` if it isn't.
- For Express middleware: `(req, res, next) => { ... }` → `async (req, res, next) => { try { ... } catch (e) { next(e); } }`. Express 5 handles promise rejection natively but the existing codebase uses Express 5 (`"express": "^5.2.1"`) so `async` middleware is supported without `try/catch`. Verify by reading `src/middleware/requireSetup.ts` after the change.

- [ ] **Step 4: Update `tests/models/settings.test.ts`**

`await` every model call. Mark the test fn `async`.

- [ ] **Step 5: Run settings tests**

Run: `DB_DRIVER=sqlite npx vitest run tests/models/settings.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/models/settings.ts src/lib/setupStatus.ts src/middleware/ src/controllers/settingsController.ts src/controllers/setupController.ts tests/models/settings.test.ts
git commit -m "settings: convert model to async Kysely; await in middleware + controllers"
```

---

## Task 8: Employees model conversion (the canonical pattern)

**Files:**
- Modify: `src/models/employees.ts`
- Modify: `src/controllers/employeesController.ts`
- Modify: `src/controllers/authController.ts`
- Modify: `src/controllers/setupController.ts`
- Modify: `src/middleware/requireAuth.ts`
- Modify: `src/middleware/locals.ts`
- Modify: `src/lib/onboarding.ts`
- Modify: `tests/models/employees.test.ts`

This is the largest model (169 lines, 11 exports) and most-called. Establishes the canonical conversion pattern.

- [ ] **Step 1: Rewrite `src/models/employees.ts`**

```typescript
import { getDb, nowIso } from "../lib/kysely";
import type { EmployeesTable } from "../lib/db-types";
import type { Selectable } from "kysely";

export type Employee = Selectable<EmployeesTable>;

export type CreateInput = {
  full_name: string;
  username?: string | null;
  password_hash?: string | null;
  role: "owner" | "employee";
  phone?: string | null;
};

export async function count(): Promise<number> {
  const row = await getDb()
    .selectFrom("employees")
    .select((eb) => eb.fn.countAll<number>().as("c"))
    .executeTakeFirstOrThrow();
  return Number(row.c);
}

export async function hasActiveCashiers(): Promise<boolean> {
  const row = await getDb()
    .selectFrom("employees")
    .select((eb) => eb.fn.countAll<number>().as("c"))
    .where("role", "=", "employee")
    .where("is_active", "=", 1)
    .executeTakeFirstOrThrow();
  return Number(row.c) > 0;
}

export async function create(input: CreateInput): Promise<Employee> {
  const now = nowIso();
  const result = await getDb()
    .insertInto("employees")
    .values({
      full_name: input.full_name,
      phone: input.phone ?? null,
      username: input.username ?? null,
      password_hash: input.password_hash ?? null,
      role: input.role,
      created_at: now,
      updated_at: now,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return (await findById(result.id))!;
}

export async function findByUsername(username: string): Promise<Employee | null> {
  const row = await getDb()
    .selectFrom("employees")
    .selectAll()
    .where("username", "=", username)
    .where("is_active", "=", 1)
    .executeTakeFirst();
  return row ?? null;
}

export async function findById(id: number): Promise<Employee | null> {
  const row = await getDb()
    .selectFrom("employees")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
  return row ?? null;
}

export async function updatePassword(id: number, password_hash: string): Promise<void> {
  await getDb()
    .updateTable("employees")
    .set({ password_hash, updated_at: nowIso() })
    .where("id", "=", id)
    .execute();
}

export async function setActive(id: number, active: boolean): Promise<void> {
  await getDb()
    .updateTable("employees")
    .set({ is_active: active ? 1 : 0, updated_at: nowIso() })
    .where("id", "=", id)
    .execute();
}

export type PersonalInput = {
  full_name: string;
  phone: string | null;
  national_id_number: string | null;
  national_id_type: string | null;
  date_of_birth: string | null;
  gender: string | null;
  marital_status: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relation: string | null;
};

export type EmploymentInput = {
  position: string | null;
  hire_date: string | null;
  termination_date?: string | null;
  basic_salary: number;
  role: "owner" | "employee";
  is_active: boolean;
  username?: string | null;
};

export async function listAll(opts: { activeOnly?: boolean } = {}): Promise<Employee[]> {
  let q = getDb().selectFrom("employees").selectAll();
  if (opts.activeOnly) q = q.where("is_active", "=", 1);
  return await q.orderBy("full_name").execute();
}

export async function findFull(id: number): Promise<Employee | null> {
  return findById(id);
}

export async function updatePersonal(id: number, input: PersonalInput): Promise<void> {
  await getDb()
    .updateTable("employees")
    .set({ ...input, updated_at: nowIso() })
    .where("id", "=", id)
    .execute();
}

export async function updateEmployment(id: number, input: EmploymentInput): Promise<void> {
  await getDb()
    .updateTable("employees")
    .set({
      position: input.position,
      hire_date: input.hire_date,
      termination_date: input.termination_date ?? null,
      basic_salary: input.basic_salary,
      role: input.role,
      is_active: input.is_active ? 1 : 0,
      username: input.username ?? null,
      updated_at: nowIso(),
    })
    .where("id", "=", id)
    .execute();
}

export async function setOnboardingStatus(id: number, status: "incomplete" | "complete"): Promise<void> {
  await getDb()
    .updateTable("employees")
    .set({ onboarding_status: status, updated_at: nowIso() })
    .where("id", "=", id)
    .execute();
}
```

- [ ] **Step 2: Update every caller**

Run: `grep -rln "from .*models/employees" src/ tests/`

For each file:
- Prefix every `Employees.<fn>(...)` (or destructured equivalent) with `await`.
- Make the enclosing function `async`.
- Cascade up: if you make a controller function async, Express handles it. If you make a non-handler helper async, await it at its call sites.

- [ ] **Step 3: Update `src/lib/onboarding.ts`**

Read it first. Convert the same way: every getDb call becomes async-Kysely; every employees-model call becomes `await`. Update exports to be async.

- [ ] **Step 4: Update tests**

`tests/models/employees.test.ts`, `tests/onboarding.test.ts`, `tests/integration/employees.test.ts`, `tests/integration/auth.test.ts` — `await` every model call.

- [ ] **Step 5: Run employee-related tests**

Run: `DB_DRIVER=sqlite npx vitest run tests/models/employees.test.ts tests/onboarding.test.ts tests/integration/auth.test.ts tests/integration/employees.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/models/employees.ts src/controllers/ src/middleware/ src/lib/onboarding.ts tests/
git commit -m "employees: convert model to async Kysely; await all consumers"
```

---

## Tasks 9-17: Remaining model conversions

**Apply the Task 8 pattern to each remaining model.** For each one:

1. Read the existing file, list every exported function and its signature.
2. Rewrite using Kysely with `async` signatures, mirroring the pattern from Task 8 (employees):
   - `getDb().prepare("SELECT ...").get()` → `await getDb().selectFrom(...).executeTakeFirst()`
   - `getDb().prepare("SELECT ...").all()` → `await getDb().selectFrom(...).execute()`
   - `getDb().prepare("INSERT ...").run().lastInsertRowid` → `await getDb().insertInto(...).returning("id").executeTakeFirstOrThrow()` → use `.id`
   - `getDb().prepare("INSERT OR REPLACE INTO ...")` → `.onConflict(oc => oc.column("...").doUpdateSet({...}))`
   - `getDb().prepare("UPDATE ...").run(...)` → `await getDb().updateTable(...).set({...}).where(...).execute()`
   - `getDb().prepare("DELETE ...").run(...)` → `await getDb().deleteFrom(...).where(...).execute()`
   - `getDb().transaction(() => {...})()` → `await getDb().transaction().execute(async (trx) => {...})`
   - `datetime('now')` in SQL → drop, pass `nowIso()` from app code
   - Named params `@x` → Kysely's `.set({...})` / `.values({...})` / `.where("col", "=", value)`
3. Update every caller (`grep -rln "from .*models/<name>"`) — add `await`, mark enclosing fn `async`.
4. Update the corresponding test file.
5. Run the affected tests.
6. Commit.

### Task 9: `guarantors`

- Files: `src/models/guarantors.ts`, `src/controllers/employeesController.ts`, `tests/models/guarantors.test.ts`
- After: `DB_DRIVER=sqlite npx vitest run tests/models/guarantors.test.ts`
- Commit: `guarantors: convert model to async Kysely`

### Task 10: `attachments`

- Files: `src/models/attachments.ts`, `src/controllers/employeesController.ts`, `src/controllers/reportsController.ts`, `tests/models/attachments.test.ts`
- **Add `thumbnail` to all create/list operations** (new column from migration 005).
- After: `DB_DRIVER=sqlite npx vitest run tests/models/attachments.test.ts`
- Commit: `attachments: convert model, add thumbnail column to inserts/reads`

### Task 11: `menuItems`

- Files: `src/models/menuItems.ts`, `src/controllers/menuController.ts`, `src/controllers/salesController.ts`, `tests/models/menuItems.test.ts`
- After: `DB_DRIVER=sqlite npx vitest run tests/models/menuItems.test.ts`
- Commit: `menuItems: convert model to async Kysely`

### Task 12: `salesSessions` + `saleLineItems`

- Files: `src/models/salesSessions.ts`, `src/models/saleLineItems.ts`, `src/controllers/salesController.ts`, `src/controllers/dashboardController.ts`, `tests/models/salesSessions.test.ts`, `tests/integration/sales.test.ts`, `tests/integration/happy-path.test.ts`
- These two travel together because line items insert in the same transaction as the session close. Use `await getDb().transaction().execute(async (trx) => { ... })`.
- After: `DB_DRIVER=sqlite npx vitest run tests/models/salesSessions.test.ts tests/integration/sales.test.ts`
- Commit: `sales: convert sessions + line items to async Kysely with trx`

### Task 13: `purchases`

- Files: `src/models/purchases.ts`, `src/controllers/purchasesController.ts`, `tests/models/purchases.test.ts`, `tests/integration/purchases-pettycash.test.ts`
- After: `DB_DRIVER=sqlite npx vitest run tests/models/purchases.test.ts`
- Commit: `purchases: convert model to async Kysely`

### Task 14: `pettyCash`

- Files: `src/models/pettyCash.ts`, `src/controllers/pettyCashController.ts`, `tests/models/pettyCash.test.ts`, `tests/integration/purchases-pettycash.test.ts`
- After: `DB_DRIVER=sqlite npx vitest run tests/models/pettyCash.test.ts`
- Commit: `pettyCash: convert model to async Kysely`

### Task 15: `payrollRuns` + `payrollEntries`

- Files: `src/models/payrollRuns.ts`, `src/models/payrollEntries.ts`, `src/controllers/payrollController.ts`, `tests/models/payrollRuns.test.ts`, `tests/models/payrollEntries.test.ts`, `tests/integration/payroll.test.ts`
- These travel together — creating a run + bulk-inserting entries happens in a transaction.
- After: `DB_DRIVER=sqlite npx vitest run tests/models/payrollRuns.test.ts tests/models/payrollEntries.test.ts tests/integration/payroll.test.ts`
- Commit: `payroll: convert runs + entries to async Kysely with trx`

### Task 16: `src/lib/reports.ts`

- Files: `src/lib/reports.ts`, `src/controllers/reportsController.ts`, `tests/reports.test.ts`, `tests/integration/reports.test.ts`
- Reports contains aggregate queries (`SUM`, `GROUP BY`, `BETWEEN`) — use Kysely's `eb.fn.sum`, `.groupBy()`, `.where("col", ">=", from).where("col", "<=", to)`.
- After: `DB_DRIVER=sqlite npx vitest run tests/reports.test.ts tests/integration/reports.test.ts`
- Commit: `reports: convert lib + controller to async Kysely`

### Task 17: `src/lib/setupStatus.ts`

- Files: `src/lib/setupStatus.ts`, callers found via `grep -rln "setupStatus"`
- After: `DB_DRIVER=sqlite npm test` (full suite — at this point most should pass)
- Commit: `setupStatus: convert to async Kysely`

After all 17 tasks: **all tests should pass under `DB_DRIVER=sqlite`** with the new stack. Stop and verify before continuing.

- [ ] **Verification gate after Task 17**

Run: `rm -rf data/shop.db* && DB_DRIVER=sqlite npm test`
Expected: ALL pass.

Run: `npm run build`
Expected: ALL pass.

Run: `DB_DRIVER=sqlite npm run dev` and click through the app (login, view dashboard, add sale, view reports).
Expected: app works identically to pre-migration.

If anything fails, stop and fix before going to Task 18.

---

## Task 18: Session store swap

**Files:**
- Modify: `src/lib/session.ts`

- [ ] **Step 1: Rewrite `src/lib/session.ts`**

```typescript
import session from "express-session";
import connectSqlite3 from "connect-sqlite3";
import pgSession from "connect-pg-simple";
import { Pool } from "pg";
import { resolve } from "path";
import { existsSync, mkdirSync } from "fs";
import { currentDriver } from "./kysely";

let _pgSessionPool: Pool | null = null;

export function sessionMiddleware() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");

  const driver = currentDriver();
  let store: session.Store;

  if (driver === "sqlite") {
    const SQLiteStore = connectSqlite3(session);
    const dataDir = resolve(process.cwd(), "data");
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
    store = new SQLiteStore({ db: "sessions.db", dir: dataDir }) as session.Store;
  } else {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is required when DB_DRIVER=supabase");
    const PgSessionStore = pgSession(session);
    _pgSessionPool = _pgSessionPool ?? new Pool({ connectionString: url });
    store = new PgSessionStore({
      pool: _pgSessionPool,
      createTableIfMissing: true,
      tableName: "user_sessions",
    });
  }

  return session({
    store,
    secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 30,
    },
  });
}

declare module "express-session" {
  interface SessionData {
    employeeId?: number;
    role?: "owner" | "employee";
    csrfToken?: string;
    flash?: { type: "success" | "error" | "info"; text: string }[];
  }
}
```

`connect-pg-simple` with `createTableIfMissing: true` creates `user_sessions` automatically on first connect — no extra migration needed.

- [ ] **Step 2: Verify build + tests still pass under sqlite**

Run: `npm run build && DB_DRIVER=sqlite npm test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/session.ts
git commit -m "sessions: dialect-aware store (sqlite or pg)"
```

---

## Task 19: Supabase client + storage abstraction

**Files:**
- Create: `src/lib/supabase.ts`
- Create: `src/lib/storage/index.ts`
- Create: `src/lib/storage/local.ts`
- Create: `src/lib/storage/supabase.ts`
- Modify: `src/lib/uploads.ts`
- Modify: `src/controllers/employeesController.ts`
- Modify: `src/models/attachments.ts`

- [ ] **Step 1: Write `src/lib/supabase.ts`**

```typescript
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for supabase storage");
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

export function storageBucket(): string {
  return process.env.SUPABASE_STORAGE_BUCKET ?? "coffeshop";
}
```

- [ ] **Step 2: Write `src/lib/storage/index.ts`**

```typescript
import type { Readable } from "stream";
import { LocalStorage } from "./local";
import { SupabaseStorage } from "./supabase";

export type OwnerType = "employee" | "guarantor";

export type PutOptions = {
  ownerType: OwnerType;
  ownerId: number;
  filename: string;
  body: Buffer;
  contentType: string;
};

export type GetResult = {
  body: Buffer | Readable;
  contentType: string;
};

export interface Storage {
  put(opts: PutOptions): Promise<void>;
  get(ownerType: OwnerType, ownerId: number, filename: string): Promise<GetResult>;
  delete(ownerType: OwnerType, ownerId: number, filename: string): Promise<void>;
}

let _storage: Storage | null = null;

export function getStorage(): Storage {
  if (_storage) return _storage;
  const driver = (process.env.STORAGE_DRIVER ?? "local").toLowerCase();
  if (driver === "local") _storage = new LocalStorage();
  else if (driver === "supabase") _storage = new SupabaseStorage();
  else throw new Error(`STORAGE_DRIVER must be "local" or "supabase", got: ${driver}`);
  return _storage;
}

export function storageKey(ownerType: OwnerType, ownerId: number, filename: string): string {
  return `${ownerType}/${ownerId}/${filename}`;
}
```

- [ ] **Step 3: Write `src/lib/storage/local.ts`**

```typescript
import { mkdirSync, existsSync } from "fs";
import { readFile, writeFile, unlink } from "fs/promises";
import { resolve, join } from "path";
import type { Storage, OwnerType, PutOptions, GetResult } from "./index";

const ROOT = resolve(process.cwd(), "data/uploads");

function dirFor(ownerType: OwnerType, ownerId: number): string {
  const d = join(ROOT, ownerType, String(ownerId));
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  return d;
}

export class LocalStorage implements Storage {
  async put(opts: PutOptions): Promise<void> {
    const dir = dirFor(opts.ownerType, opts.ownerId);
    await writeFile(join(dir, opts.filename), opts.body);
  }

  async get(ownerType: OwnerType, ownerId: number, filename: string): Promise<GetResult> {
    const fullPath = join(dirFor(ownerType, ownerId), filename);
    const body = await readFile(fullPath);
    return { body, contentType: "application/octet-stream" };
  }

  async delete(ownerType: OwnerType, ownerId: number, filename: string): Promise<void> {
    const fullPath = join(dirFor(ownerType, ownerId), filename);
    try { await unlink(fullPath); } catch { /* missing file is fine */ }
  }
}
```

- [ ] **Step 4: Write `src/lib/storage/supabase.ts`**

```typescript
import { getSupabaseClient, storageBucket } from "../supabase";
import { storageKey } from "./index";
import type { Storage, OwnerType, PutOptions, GetResult } from "./index";

export class SupabaseStorage implements Storage {
  async put(opts: PutOptions): Promise<void> {
    const client = getSupabaseClient();
    const key = storageKey(opts.ownerType, opts.ownerId, opts.filename);
    const { error } = await client.storage.from(storageBucket()).upload(key, opts.body, {
      contentType: opts.contentType,
      upsert: true,
    });
    if (error) throw error;
  }

  async get(ownerType: OwnerType, ownerId: number, filename: string): Promise<GetResult> {
    const client = getSupabaseClient();
    const key = storageKey(ownerType, ownerId, filename);
    const { data, error } = await client.storage.from(storageBucket()).download(key);
    if (error || !data) throw error ?? new Error("missing");
    const buf = Buffer.from(await data.arrayBuffer());
    return { body: buf, contentType: data.type || "application/octet-stream" };
  }

  async delete(ownerType: OwnerType, ownerId: number, filename: string): Promise<void> {
    const client = getSupabaseClient();
    const key = storageKey(ownerType, ownerId, filename);
    const { error } = await client.storage.from(storageBucket()).remove([key]);
    if (error) throw error;
  }
}
```

- [ ] **Step 5: Rewrite `src/lib/uploads.ts` to delegate to `Storage`**

```typescript
import multer from "multer";
import sharp from "sharp";
import { extname } from "path";
import { randomBytes } from "crypto";
import { getStorage, OwnerType } from "./storage";

export { OwnerType };

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(png|jpe?g|webp|gif)$|^application\/pdf$/.test(file.mimetype);
    if (ok) cb(null, true);
    else cb(new Error("Only PNG/JPG/WEBP/GIF/PDF allowed"));
  },
});

export type StoredFile = {
  filename: string;
  thumbnail: string | null;
  size: number;
  mime: string;
};

export async function storeFile(
  ownerType: OwnerType,
  ownerId: number,
  file: Express.Multer.File,
): Promise<StoredFile> {
  const ext = (extname(file.originalname) || "").toLowerCase() || mimeExt(file.mimetype);
  const slug = randomBytes(8).toString("hex");
  const filename = `${slug}${ext}`;
  const storage = getStorage();

  if (file.mimetype.startsWith("image/")) {
    const mainBuf = await sharp(file.buffer).rotate().toBuffer();
    await storage.put({ ownerType, ownerId, filename, body: mainBuf, contentType: file.mimetype });
    const thumbName = `thumb_${slug}.webp`;
    const thumbBuf = await sharp(file.buffer).rotate().resize({ width: 240, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
    await storage.put({ ownerType, ownerId, filename: thumbName, body: thumbBuf, contentType: "image/webp" });
    return { filename, thumbnail: thumbName, size: mainBuf.length, mime: file.mimetype };
  } else {
    await storage.put({ ownerType, ownerId, filename, body: file.buffer, contentType: file.mimetype });
    return { filename, thumbnail: null, size: file.size, mime: file.mimetype };
  }
}

export async function deleteFile(
  ownerType: OwnerType,
  ownerId: number,
  filename: string,
  thumbnail: string | null,
): Promise<void> {
  const storage = getStorage();
  await Promise.allSettled([
    storage.delete(ownerType, ownerId, filename),
    thumbnail ? storage.delete(ownerType, ownerId, thumbnail) : Promise.resolve(),
  ]);
}

function mimeExt(mime: string): string {
  switch (mime) {
    case "image/png":  return ".png";
    case "image/jpeg": return ".jpg";
    case "image/webp": return ".webp";
    case "image/gif":  return ".gif";
    case "application/pdf": return ".pdf";
    default: return "";
  }
}
```

- [ ] **Step 6: Update `attachments` model + create flow**

Whatever inserts an attachment row should now persist the `thumbnail` column. In `src/controllers/employeesController.ts`, the `uploadDocument` / `uploadGuarantorDocument` handlers — after `storeFile()` returns `{ filename, thumbnail, size, mime }`, pass `thumbnail` to the attachments model's create function.

In `src/models/attachments.ts` (already converted to Kysely in Task 10), include `thumbnail` in the insert values.

- [ ] **Step 7: Update file-serving routes to stream via `Storage`**

In `src/controllers/employeesController.ts`, the routes that currently do `res.sendFile(pathFor(...))`:

```typescript
// Before
const full = pathFor("employee", id, filename);
return res.sendFile(full);

// After
import { getStorage } from "../lib/storage";
// ...
const result = await getStorage().get("employee", id, filename);
if (result.contentType) res.type(result.contentType);
if (Buffer.isBuffer(result.body)) return res.send(result.body);
return result.body.pipe(res);
```

Also: the local driver's `get()` currently returns `application/octet-stream` — for served files we want the right mime. Look up the attachment row to set the response `Content-Type` from `att.mime_type` (which is already stored on the attachment).

Refined version (better):

```typescript
const att = await Attachments.findByEmployeeAndFilename(id, filename); // or similar
if (!att) return res.status(404).send("Not found");
const result = await getStorage().get("employee", id, filename);
res.type(att.mime_type);
if (Buffer.isBuffer(result.body)) return res.send(result.body);
return result.body.pipe(res);
```

If `findByEmployeeAndFilename` doesn't exist on the attachments model, add it. Mirror for the guarantor variant.

- [ ] **Step 8: Write `tests/lib/storage.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rm, mkdir } from "fs/promises";
import { resolve } from "path";
import { LocalStorage } from "../../src/lib/storage/local";

const ROOT = resolve(process.cwd(), "data/uploads");

describe("LocalStorage", () => {
  beforeEach(async () => {
    await rm(ROOT, { recursive: true, force: true });
    await mkdir(ROOT, { recursive: true });
  });

  afterEach(async () => {
    await rm(ROOT, { recursive: true, force: true });
  });

  it("round-trips a file", async () => {
    const s = new LocalStorage();
    const body = Buffer.from("hello");
    await s.put({ ownerType: "employee", ownerId: 1, filename: "x.txt", body, contentType: "text/plain" });
    const got = await s.get("employee", 1, "x.txt");
    expect(Buffer.isBuffer(got.body) && got.body.toString()).toBe("hello");
  });

  it("deletes a file", async () => {
    const s = new LocalStorage();
    await s.put({ ownerType: "employee", ownerId: 1, filename: "x.txt", body: Buffer.from("x"), contentType: "text/plain" });
    await s.delete("employee", 1, "x.txt");
    await expect(s.get("employee", 1, "x.txt")).rejects.toThrow();
  });
});
```

- [ ] **Step 9: Run tests**

Run: `DB_DRIVER=sqlite STORAGE_DRIVER=local npm test`
Expected: PASS, including new storage test.

- [ ] **Step 10: Manual smoke**

Run: `DB_DRIVER=sqlite STORAGE_DRIVER=local npm run dev`
Upload an employee photo. View it. Delete it. All should work as before.

- [ ] **Step 11: Commit**

```bash
git add src/lib/supabase.ts src/lib/storage/ src/lib/uploads.ts src/controllers/employeesController.ts src/models/attachments.ts tests/lib/storage.test.ts
git commit -m "storage: pluggable Storage interface (local fs + supabase storage)"
```

---

## Task 20: Backup helper — soft no-op for postgres driver

**Files:**
- Modify: `src/lib/backup.ts`
- Modify: `tests/backup.test.ts`

- [ ] **Step 1: Rewrite `src/lib/backup.ts`**

```typescript
import { resolve, join } from "path";
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "fs";
import { currentDriver, sqliteHandle } from "./kysely";

function backupDir(): string {
  const dir = resolve(process.cwd(), process.env.BACKUP_DIR ?? "./data/backups");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function timestamp(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const HH = String(d.getHours()).padStart(2, "0");
  const MM = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}_${HH}${MM}`;
}

export async function runBackup(): Promise<string> {
  if (currentDriver() === "supabase") {
    // Supabase handles point-in-time backups server-side; the local nightly
    // job is a no-op when running against Supabase. Return a sentinel path.
    return "(supabase-managed)";
  }
  const handle = sqliteHandle();
  if (!handle) throw new Error("sqlite handle not available");
  const dir = backupDir();
  const filename = `shop-${timestamp()}.db`;
  const dest = join(dir, filename);
  await handle.backup(dest);
  return dest;
}

export function pruneOldBackups(retainDays: number): string[] {
  if (currentDriver() === "supabase") return [];
  const dir = backupDir();
  const cutoff = Date.now() - retainDays * 24 * 60 * 60 * 1000;
  const removed: string[] = [];
  for (const f of readdirSync(dir)) {
    if (!/^shop-.*\.db$/.test(f)) continue;
    const full = join(dir, f);
    const st = statSync(full);
    if (st.mtimeMs < cutoff) {
      unlinkSync(full);
      removed.push(full);
    }
  }
  return removed;
}

export function listBackups(): Array<{ name: string; size: number; mtime: Date }> {
  if (currentDriver() === "supabase") return [];
  const dir = backupDir();
  return readdirSync(dir)
    .filter(f => /^shop-.*\.db$/.test(f))
    .map(f => {
      const st = statSync(join(dir, f));
      return { name: f, size: st.size, mtime: st.mtime };
    })
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
}

export function backupDirPath(): string {
  return backupDir();
}
```

- [ ] **Step 2: Run backup tests under sqlite**

Run: `DB_DRIVER=sqlite npx vitest run tests/backup.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/backup.ts tests/backup.test.ts
git commit -m "backup: no-op on supabase driver (Supabase handles PITR)"
```

---

## Task 21: First Supabase smoke test — empty DB

**Files:** none

- [ ] **Step 1: Run the app against an empty Supabase**

Run: `DB_DRIVER=supabase STORAGE_DRIVER=supabase npm run build && DB_DRIVER=supabase STORAGE_DRIVER=supabase node dist/server.js`

Expected output: `Applied migration: 001_init.sql` (etc.) then "Listening on:". No errors.

If `psql` shows tables present in the Supabase project (`psql $DATABASE_URL -c '\dt'`), migrations succeeded.

- [ ] **Step 2: Walk through setup**

In a browser, navigate to the app's setup page and create the owner account. Confirm:
- Owner row appears in `employees` table on Supabase
- Login works
- Session persists across page reloads (validates `user_sessions` table got created)

- [ ] **Step 3: Note any errors**

Any failure here is a real bug in the conversion. Fix in place — don't proceed to data copy until smoke is clean.

---

## Task 22: One-time data copy script (SQLite → Supabase)

**Files:**
- Create: `bin/copy-sqlite-to-supabase.ts`

- [ ] **Step 1: Write the script**

```typescript
import "dotenv/config";
import Database from "better-sqlite3";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { resolve, join } from "path";
import type { DB } from "../src/lib/db-types";

const SQLITE_PATH = process.env.SQLITE_SRC ?? resolve(process.cwd(), "data/shop.db");
const PG_URL = process.env.DATABASE_URL;
if (!PG_URL) {
  console.error("DATABASE_URL is required");
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
  const sqlite = new Database(SQLITE_PATH, { readonly: true });
  const pgPool = new Pool({ connectionString: PG_URL });
  const pg = new Kysely<DB>({ dialect: new PostgresDialect({ pool: pgPool }) });

  for (const table of TABLES) {
    const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
    if (rows.length === 0) {
      console.log(`${table}: 0 rows`);
      continue;
    }
    // Insert in chunks of 500 to keep statements within parameter limits.
    const chunkSize = 500;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize) as any[];
      await pg.insertInto(table as any).values(chunk).execute();
    }
    console.log(`${table}: ${rows.length} rows copied`);
  }

  // Re-sync SERIAL sequences so future inserts get correct ids.
  for (const table of TABLES) {
    if (table === "settings") continue; // no id column
    await pg.executeQuery({
      sql: `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1), true)`,
      parameters: [],
      query: { kind: "RawNode" } as any,
    } as any);
  }

  await pg.destroy();
  sqlite.close();
  console.log("Done.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
```

Note: the `setval` raw query above is fragile — better is to use Kysely's `sql` template:

```typescript
import { sql } from "kysely";
// ...
for (const table of TABLES) {
  if (table === "settings") continue;
  await sql`SELECT setval(pg_get_serial_sequence(${table}, 'id'), COALESCE((SELECT MAX(id) FROM ${sql.raw(table as string)}), 1), true)`.execute(pg);
}
```

Use that form.

- [ ] **Step 2: Add npm script**

In `package.json` under `"scripts"`:

```json
"copy:supabase": "tsx bin/copy-sqlite-to-supabase.ts"
```

- [ ] **Step 3: Run it (target a clean Supabase)**

First, truncate the Supabase tables (the script does not — it appends):

```bash
psql $DATABASE_URL -c "TRUNCATE employees, guarantors, attachments, menu_items, sales_sessions, sale_line_items, purchase_requisitions, petty_cash_entries, payroll_runs, payroll_entries, settings, audit_log RESTART IDENTITY CASCADE;"
```

Then:

```bash
npm run copy:supabase
```

Expected: per-table row counts logged, "Done."

- [ ] **Step 4: Verify data**

Run: `psql $DATABASE_URL -c "SELECT COUNT(*) FROM employees; SELECT COUNT(*) FROM sales_sessions;"`
Compare with `sqlite3 data/shop.db "SELECT COUNT(*) FROM employees; SELECT COUNT(*) FROM sales_sessions;"`.

Expected: identical counts.

- [ ] **Step 5: Commit**

```bash
git add bin/copy-sqlite-to-supabase.ts package.json
git commit -m "tooling: one-time SQLite→Supabase data copy script"
```

---

## Task 23: One-time uploads copy script (local fs → Supabase Storage)

**Files:**
- Create: `bin/copy-uploads-to-supabase.ts`

- [ ] **Step 1: Write the script**

```typescript
import "dotenv/config";
import { readdir, readFile } from "fs/promises";
import { join, resolve } from "path";
import { lookup } from "mime-types";
import { getSupabaseClient, storageBucket } from "../src/lib/supabase";

const ROOT = resolve(process.cwd(), "data/uploads");

async function walk(dir: string, base: string = ""): Promise<Array<{ key: string; absPath: string }>> {
  const out: Array<{ key: string; absPath: string }> = [];
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); }
  catch { return out; }
  for (const e of entries) {
    const abs = join(dir, e.name);
    const key = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) {
      const sub = await walk(abs, key);
      out.push(...sub);
    } else if (e.isFile()) {
      out.push({ key, absPath: abs });
    }
  }
  return out;
}

async function main() {
  const client = getSupabaseClient();
  const bucket = storageBucket();
  const files = await walk(ROOT);
  console.log(`Found ${files.length} files under data/uploads`);

  let i = 0;
  for (const f of files) {
    const buf = await readFile(f.absPath);
    const mime = typeof lookup === "function" ? (lookup(f.absPath) || "application/octet-stream") : "application/octet-stream";
    const { error } = await client.storage.from(bucket).upload(f.key, buf, {
      contentType: mime,
      upsert: true,
    });
    if (error) {
      console.error(`FAILED ${f.key}: ${error.message}`);
    } else {
      i++;
    }
  }
  console.log(`Uploaded ${i} / ${files.length} files`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
```

Add `mime-types` if not present: `npm install mime-types && npm install -D @types/mime-types`. Alternatively, hand-roll a small extension→mime map and skip the dep.

- [ ] **Step 2: Add npm script**

```json
"copy:uploads": "tsx bin/copy-uploads-to-supabase.ts"
```

- [ ] **Step 3: Run it**

Run: `npm run copy:uploads`
Expected: "Uploaded N / N files".

- [ ] **Step 4: Verify via Supabase Storage UI**

In the Supabase dashboard → Storage → `coffeshop` bucket, you should see `employee/<id>/<filenames>` folders.

- [ ] **Step 5: Commit**

```bash
git add bin/copy-uploads-to-supabase.ts package.json package-lock.json
git commit -m "tooling: one-time uploads→Supabase Storage copy script"
```

---

## Task 24: Full cutover smoke test

**Files:** none

- [ ] **Step 1: Stop the local app**

- [ ] **Step 2: Set drivers to supabase**

Edit `.env.local`:
```
DB_DRIVER=supabase
STORAGE_DRIVER=supabase
```

- [ ] **Step 3: Boot the app**

Run: `npm run build && node dist/server.js`
Expected: "Listening on:" with no errors.

- [ ] **Step 4: Click through every major feature**

- Log in with the owner account → succeeds.
- Dashboard loads → shows today's data.
- Add a sale → persists.
- Add a purchase → persists.
- Add a petty cash entry → persists.
- Open an employee profile → photo and ID scans load from Storage.
- Upload a new employee document → succeeds, appears immediately.
- Delete a document → disappears immediately, also gone from Storage UI.
- Run a payroll → persists.
- Run reports → matches expected numbers.

If anything fails, fix in place. The remaining tasks are housekeeping.

- [ ] **Step 5: Log the result**

Note in your shell history or a scratch file which features were verified.

---

## Task 25: README + .env.example documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add Supabase section to README**

Open `README.md` and add (or update) a section near the top:

```markdown
## Database backend

The app supports two backends, switched via env vars:

- `DB_DRIVER=sqlite` (default) — uses local `data/shop.db` via better-sqlite3. No setup needed.
- `DB_DRIVER=supabase` — uses Supabase Postgres. Requires `DATABASE_URL` (the direct connection string from Supabase → Project Settings → Database).

Similarly for file uploads:

- `STORAGE_DRIVER=local` (default) — files live under `data/uploads/`.
- `STORAGE_DRIVER=supabase` — files live in Supabase Storage. Requires `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_STORAGE_BUCKET` (default: `coffeshop`).

You can mix-and-match the two drivers (e.g., Postgres DB but local files) although the supported combinations are `sqlite/local` and `supabase/supabase`.

### Migrating from SQLite to Supabase

1. Create a Supabase project; capture the connection string and a service-role key.
2. Create a Storage bucket named `coffeshop` (private).
3. Fill in `.env.local` (see `.env.example`).
4. Boot the app once with `DB_DRIVER=supabase` to run migrations: `DB_DRIVER=supabase npm run build && node dist/server.js`.
5. Stop the app. Copy data: `DB_DRIVER=supabase npm run copy:supabase`.
6. Copy uploads: `STORAGE_DRIVER=supabase npm run copy:uploads`.
7. Boot the app for real with both drivers set to `supabase`.

The local SQLite file and `data/uploads/` directory remain on disk as a backup. To go back, set the drivers back to `sqlite` / `local`.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README section for Supabase migration"
```

---

## Self-Review Notes

**Spec coverage (per the original spec):**
- Kysely query layer adoption — Tasks 2, 3, 8 (and applied across 9-17). ✓
- Async conversion of all 11 model files — Tasks 7, 8, 9, 10, 11, 12, 13, 14, 15. (Settings, Employees, Guarantors, Attachments, MenuItems, SalesSessions, SaleLineItems, Purchases, PettyCash, PayrollRuns, PayrollEntries = 11). ✓
- Async conversion of controllers + lib helpers — propagated in each model task; reports lib in Task 16; audit + setupStatus + onboarding covered in Tasks 6, 7, 17. ✓
- Dialect-aware migrations — Tasks 4, 5. ✓
- Session store swap — Task 18. ✓
- Supabase Storage adoption — Task 19. ✓
- One-time data + file copy scripts — Tasks 22, 23. ✓
- .env documentation — Tasks 0, 25. ✓

**Open questions for the operator:**
- The `migrations/postgres/001_init.sql` is a *folded* migration (combines original 001-005 in one shot). This means if you later add a new SQLite migration `006_xxx.sql`, you must hand-write a matching `migrations/postgres/006_xxx.sql` — you cannot just rely on the folded init. This is documented in the file header but worth knowing.
- The `INTEGER` boolean columns (`is_active`) and `TEXT` dates are kept as-is in Postgres for behavioral parity. A future cleanup task could migrate them to `BOOLEAN` / `TIMESTAMPTZ` once SQLite is fully retired.
- Backup helper becomes a no-op under the Supabase driver. Supabase's managed PITR replaces it. If you want a logical backup, schedule a separate `pg_dump` job (out of scope here).

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-16-supabase-full-migration.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, two-stage review, fast iteration

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
