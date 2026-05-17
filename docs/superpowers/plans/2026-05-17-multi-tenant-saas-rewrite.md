# Multi-Tenant SaaS Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the single-tenant Coffeshop_managment app into a multi-tenant SaaS where one Supabase database holds many fully-isolated shops, each with their own owner, employees, menu, sales, etc.

**Architecture:** Add a `shops` table and a `shop_id` foreign key to every existing data table. A shop's `id` lives in the session and is propagated to every model query via Node's `AsyncLocalStorage` — so models don't need a shop_id parameter on every signature. A new `/signup` flow creates a shop + first owner atomically; login resolves which shop a user belongs to and stores that in the session. Supabase Row-Level-Security policies enforce isolation at the database layer too (defense-in-depth).

**Tech Stack:** TypeScript, Express 5, Kysely, Supabase Postgres, Node `AsyncLocalStorage`, bcrypt, vitest. No new top-level deps.

---

## File Structure

### New files
- `migrations/postgres/006_multitenant.sql` — adds `shops` + `shop_id` everywhere + RLS policies
- `migrations/sqlite/006_multitenant.sql` — same idea, sqlite-compatible
- `src/lib/shopContext.ts` — AsyncLocalStorage holding the current request's shop_id
- `src/models/shops.ts` — CRUD for shops
- `src/controllers/signupController.ts` — handle GET/POST /signup
- `src/views/signup.ejs` — signup form
- `tests/lib/testShop.ts` — helper that seeds a shop + owner and runs a fn inside its shop context

### Modified files
- `src/lib/db-types.ts` — add `ShopsTable`, add `shop_id` to every existing table interface, change SettingsTable to composite PK
- `src/lib/kysely.ts` — no changes needed (shopContext lives separately)
- `src/lib/session.ts` — add `shopId?: number` to SessionData
- `src/middleware/locals.ts` — populate `res.locals.shopId` from session
- `src/middleware/requireAuth.ts` — runs inside `shopContext.run(req.session.shopId, ...)` so all downstream code sees the shop
- `src/middleware/requireSetup.ts` — replaced by anonymous-friendly /signup gate
- `src/controllers/authController.ts` — login resolves the employee's shop_id and stores in session
- `src/controllers/setupController.ts` — redirect to /signup (legacy compatibility, deleted later)
- `src/routes/index.ts` — wire /signup and remove the setup redirect default
- `src/app.ts` — adjust middleware order so shopContext is established before any router runs
- `src/lib/audit.ts` — store shop_id on every audit_log row
- `src/lib/reports.ts` — every aggregate filters by shop_id
- `src/lib/setupStatus.ts` — checks per-shop (uses ALS)
- `src/lib/onboarding.ts` — uses ALS
- `src/models/employees.ts` — every CRUD + read filters by shop_id
- `src/models/guarantors.ts` — same
- `src/models/attachments.ts` — same
- `src/models/menuItems.ts` — same
- `src/models/salesSessions.ts` — same
- `src/models/saleLineItems.ts` — same
- `src/models/purchases.ts` — same
- `src/models/pettyCash.ts` — same
- `src/models/payrollRuns.ts` — same
- `src/models/payrollEntries.ts` — same
- `src/models/settings.ts` — composite PK (shop_id, key); cache per-shop
- `src/lib/storage/index.ts` — `storageKey` includes shop_id
- `src/lib/storage/local.ts` — file paths under `shops/{shopId}/...`
- `src/lib/storage/supabase.ts` — same path scoping
- `bin/seed-demo.ts` — creates "Sample Shop" with id=1, seeds existing demo data into it
- `tests/**/*.test.ts` — every test seeds its own shop in `beforeEach` and runs in its context

### Deleted files
- `src/middleware/requireSetup.ts` — replaced by /signup public route + per-shop setup check
- `src/views/setup.ejs` — no longer needed; /signup covers it
- `src/controllers/setupController.ts` — same

---

## Risk Callouts

1. **The single `app.set("views", ...)` and EJS templates do not have to change**, but every view that displays shop_name has to read it from `res.locals.shopName` which is set per-request by middleware (was global before).
2. **Auth session compatibility**: existing logged-in sessions don't have `shopId`. After deploy, those sessions will fail at the first model call. **Plan to invalidate all sessions on cutover** (DELETE FROM user_sessions). Documented in Task 24.
3. **bin/copy-sqlite-to-supabase.ts and bin/copy-uploads-to-supabase.ts** are one-time scripts; we don't need to refactor them for multi-tenancy, but mark them as legacy.
4. **All 60+ in-flight commits go out together.** No partial cutover — the schema migration and the code that reads `shop_id` must land in lockstep. Use a feature branch + single merge.

---

## Verification Gates

After each phase, the test suite must pass under `DB_DRIVER=sqlite` AND a manual smoke test against the deployed Vercel must succeed. Stop and fix before moving on.

- **Gate 1** (end of Phase 1): schema applies; existing data is migrated to "Sample Shop"; tests still pass (since models haven't been touched yet, they read pre-existing data which now has shop_id=1).
- **Gate 2** (end of Phase 4): /signup creates a new shop; new owner can log in; their dashboard is empty (no cross-shop bleed); existing "Sample Shop" owner still sees their data.
- **Gate 3** (end of Phase 5): all 144 tests pass; manual smoke test verifies two shops have fully separate data.

---

## Task 1: Branch, schema migration, RLS

**Files:**
- Create: `migrations/postgres/006_multitenant.sql`
- Create: `migrations/sqlite/006_multitenant.sql`

- [ ] **Step 1: Create a feature branch**

```bash
git checkout -b multi-tenant-rewrite
```

- [ ] **Step 2: Write `migrations/postgres/006_multitenant.sql`**

```sql
-- 1) shops table
CREATE TABLE shops (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);

-- 2) Insert "Sample Shop" with id=1 so existing data has somewhere to belong.
INSERT INTO shops (id, name) VALUES (1, 'Sample Shop');
SELECT setval('shops_id_seq', GREATEST((SELECT MAX(id) FROM shops), 1));

-- 3) Add shop_id to every data table. Default 1 so existing rows belong to
--    Sample Shop; then drop the default so future inserts must specify it.
ALTER TABLE employees             ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE guarantors            ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE attachments           ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE menu_items            ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE sales_sessions        ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE sale_line_items       ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE purchase_requisitions ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE petty_cash_entries    ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE payroll_runs          ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE payroll_entries       ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE audit_log             ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE;

-- Drop the defaults so future inserts must be explicit
ALTER TABLE employees             ALTER COLUMN shop_id DROP DEFAULT;
ALTER TABLE guarantors            ALTER COLUMN shop_id DROP DEFAULT;
ALTER TABLE attachments           ALTER COLUMN shop_id DROP DEFAULT;
ALTER TABLE menu_items            ALTER COLUMN shop_id DROP DEFAULT;
ALTER TABLE sales_sessions        ALTER COLUMN shop_id DROP DEFAULT;
ALTER TABLE sale_line_items       ALTER COLUMN shop_id DROP DEFAULT;
ALTER TABLE purchase_requisitions ALTER COLUMN shop_id DROP DEFAULT;
ALTER TABLE petty_cash_entries    ALTER COLUMN shop_id DROP DEFAULT;
ALTER TABLE payroll_runs          ALTER COLUMN shop_id DROP DEFAULT;
ALTER TABLE payroll_entries       ALTER COLUMN shop_id DROP DEFAULT;
ALTER TABLE audit_log             ALTER COLUMN shop_id DROP DEFAULT;

-- 4) Indexes — every query filters by shop_id first
CREATE INDEX idx_employees_shop             ON employees(shop_id);
CREATE INDEX idx_guarantors_shop            ON guarantors(shop_id);
CREATE INDEX idx_attachments_shop           ON attachments(shop_id);
CREATE INDEX idx_menu_items_shop            ON menu_items(shop_id);
CREATE INDEX idx_sales_sessions_shop_date   ON sales_sessions(shop_id, business_date);
CREATE INDEX idx_sale_lines_shop            ON sale_line_items(shop_id);
CREATE INDEX idx_purchases_shop_date        ON purchase_requisitions(shop_id, purchase_date);
CREATE INDEX idx_petty_shop_date            ON petty_cash_entries(shop_id, entry_date);
CREATE INDEX idx_payroll_runs_shop          ON payroll_runs(shop_id);
CREATE INDEX idx_payroll_entries_shop       ON payroll_entries(shop_id);
CREATE INDEX idx_audit_shop                 ON audit_log(shop_id);

-- 5) Username should be unique PER SHOP, not globally
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_username_key;
CREATE UNIQUE INDEX idx_employees_username_per_shop ON employees(shop_id, username) WHERE username IS NOT NULL;

-- 6) Settings: drop the global PK, make it (shop_id, key)
ALTER TABLE settings DROP CONSTRAINT settings_pkey;
ALTER TABLE settings ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE settings ALTER COLUMN shop_id DROP DEFAULT;
ALTER TABLE settings ADD PRIMARY KEY (shop_id, key);
CREATE INDEX idx_settings_shop ON settings(shop_id);

-- 7) RLS as defense in depth. The service role bypasses RLS for app queries,
--    so this protects against anon-key misuse, future Edge Functions, and
--    accidental SQL run from the Supabase dashboard while logged in as a
--    non-service role. We use a session GUC `app.current_shop_id` that the
--    app sets via SET LOCAL at transaction start.
ALTER TABLE shops                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees              ENABLE ROW LEVEL SECURITY;
ALTER TABLE guarantors             ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items             ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_sessions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_line_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_requisitions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE petty_cash_entries     ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_runs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_entries        ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log              ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings               ENABLE ROW LEVEL SECURITY;

-- The service role (what our app connects as) bypasses RLS by default
-- in Supabase. These policies kick in only if anon/authenticated roles
-- ever attempt direct access.
CREATE POLICY tenant_isolation_employees             ON employees             FOR ALL USING (shop_id = current_setting('app.current_shop_id', true)::int);
CREATE POLICY tenant_isolation_guarantors            ON guarantors            FOR ALL USING (shop_id = current_setting('app.current_shop_id', true)::int);
CREATE POLICY tenant_isolation_attachments           ON attachments           FOR ALL USING (shop_id = current_setting('app.current_shop_id', true)::int);
CREATE POLICY tenant_isolation_menu_items            ON menu_items            FOR ALL USING (shop_id = current_setting('app.current_shop_id', true)::int);
CREATE POLICY tenant_isolation_sales_sessions        ON sales_sessions        FOR ALL USING (shop_id = current_setting('app.current_shop_id', true)::int);
CREATE POLICY tenant_isolation_sale_line_items       ON sale_line_items       FOR ALL USING (shop_id = current_setting('app.current_shop_id', true)::int);
CREATE POLICY tenant_isolation_purchase_requisitions ON purchase_requisitions FOR ALL USING (shop_id = current_setting('app.current_shop_id', true)::int);
CREATE POLICY tenant_isolation_petty_cash_entries    ON petty_cash_entries    FOR ALL USING (shop_id = current_setting('app.current_shop_id', true)::int);
CREATE POLICY tenant_isolation_payroll_runs          ON payroll_runs          FOR ALL USING (shop_id = current_setting('app.current_shop_id', true)::int);
CREATE POLICY tenant_isolation_payroll_entries       ON payroll_entries       FOR ALL USING (shop_id = current_setting('app.current_shop_id', true)::int);
CREATE POLICY tenant_isolation_audit_log             ON audit_log             FOR ALL USING (shop_id = current_setting('app.current_shop_id', true)::int);
CREATE POLICY tenant_isolation_settings              ON settings              FOR ALL USING (shop_id = current_setting('app.current_shop_id', true)::int);
```

- [ ] **Step 3: Write `migrations/sqlite/006_multitenant.sql`**

SQLite doesn't support RLS, `ALTER TABLE ... DROP CONSTRAINT`, or `ALTER COLUMN ... DROP DEFAULT`. We use a simpler shape that achieves the same data layout:

```sql
CREATE TABLE shops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO shops (id, name) VALUES (1, 'Sample Shop');

ALTER TABLE employees             ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE guarantors            ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE attachments           ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE menu_items            ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE sales_sessions        ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE sale_line_items       ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE purchase_requisitions ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE petty_cash_entries    ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE payroll_runs          ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE payroll_entries       ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE audit_log             ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE;

CREATE INDEX idx_employees_shop             ON employees(shop_id);
CREATE INDEX idx_guarantors_shop            ON guarantors(shop_id);
CREATE INDEX idx_attachments_shop           ON attachments(shop_id);
CREATE INDEX idx_menu_items_shop            ON menu_items(shop_id);
CREATE INDEX idx_sales_sessions_shop_date   ON sales_sessions(shop_id, business_date);
CREATE INDEX idx_sale_lines_shop            ON sale_line_items(shop_id);
CREATE INDEX idx_purchases_shop_date        ON purchase_requisitions(shop_id, purchase_date);
CREATE INDEX idx_petty_shop_date            ON petty_cash_entries(shop_id, entry_date);
CREATE INDEX idx_payroll_runs_shop          ON payroll_runs(shop_id);
CREATE INDEX idx_payroll_entries_shop       ON payroll_entries(shop_id);
CREATE INDEX idx_audit_shop                 ON audit_log(shop_id);

DROP INDEX IF EXISTS idx_employees_username;
CREATE UNIQUE INDEX idx_employees_username_per_shop ON employees(shop_id, username) WHERE username IS NOT NULL;

-- Settings: SQLite can't drop a primary key. We recreate the table.
CREATE TABLE settings_new (
  shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (shop_id, key)
);
INSERT INTO settings_new (shop_id, key, value, updated_at)
  SELECT 1, key, value, updated_at FROM settings;
DROP TABLE settings;
ALTER TABLE settings_new RENAME TO settings;
CREATE INDEX idx_settings_shop ON settings(shop_id);
```

- [ ] **Step 4: Run migrations locally first**

```bash
rm -f data/shop.db
DB_DRIVER=sqlite npx tsx -e "import './src/lib/db' as db; (async () => { const { runMigrations, closeDb } = await import('./src/lib/db'); await runMigrations(); await closeDb(); })()"
```

Expected: prints `Applied migration: 006_multitenant.sql` and exits 0.

- [ ] **Step 5: Verify schema**

```bash
sqlite3 data/shop.db ".schema shops" && sqlite3 data/shop.db "SELECT name FROM shops"
```

Expected: `shops` table exists; one row "Sample Shop".

```bash
sqlite3 data/shop.db ".schema settings" | grep "PRIMARY KEY (shop_id, key)"
```

Expected: composite PK shown.

- [ ] **Step 6: Commit**

```bash
git add migrations/postgres/006_multitenant.sql migrations/sqlite/006_multitenant.sql
git commit -m "schema(multitenant): add shops table, shop_id everywhere, RLS policies

Sample Shop (id=1) inserted as the default home for existing rows.
Postgres gets RLS policies as defense-in-depth; sqlite skips RLS
(unsupported) but enforces the same data shape via FKs + indexes.
settings PK becomes composite (shop_id, key).
"
```

---

## Task 2: Kysely DB types

**Files:**
- Modify: `src/lib/db-types.ts`

- [ ] **Step 1: Add ShopsTable interface to db-types.ts**

Edit `src/lib/db-types.ts`. After the imports, BEFORE EmployeesTable:

```typescript
export interface ShopsTable {
  id: Generated<number>;
  name: string;
  created_at: ColumnType<TimestampString, string | undefined, string>;
}
```

- [ ] **Step 2: Add `shop_id: number` to every existing table interface**

In `src/lib/db-types.ts`, every interface that represents a data table — EmployeesTable, GuarantorsTable, AttachmentsTable, MenuItemsTable, SalesSessionsTable, SaleLineItemsTable, PurchaseRequisitionsTable, PettyCashEntriesTable, PayrollRunsTable, PayrollEntriesTable, AuditLogTable — gets a new field at the top:

```typescript
  shop_id: number;
```

- [ ] **Step 3: SettingsTable: shop_id is part of the composite key**

Replace the existing SettingsTable with:

```typescript
export interface SettingsTable {
  shop_id: number;
  key: string;
  value: string;
  updated_at: ColumnType<TimestampString, string | undefined, string>;
}
```

- [ ] **Step 4: Register the new table in the `DB` interface**

Add `shops: ShopsTable;` line at the top of the `DB` interface.

- [ ] **Step 5: Verify TypeScript still compiles**

```bash
npx tsc --noEmit
```

Expected: many errors in models/controllers because they don't yet pass `shop_id` on insert. **This is expected** — they'll be fixed in Phase 4. Don't try to fix them here.

If the errors are NOT about missing `shop_id` (e.g., unrelated syntax errors), stop and fix them.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db-types.ts
git commit -m "types(multitenant): add ShopsTable + shop_id on every table

Knowingly leaves callers broken — they're fixed in Phase 4."
```

---

## Task 3: shopContext — AsyncLocalStorage helper

**Files:**
- Create: `src/lib/shopContext.ts`

- [ ] **Step 1: Write `src/lib/shopContext.ts`**

```typescript
import { AsyncLocalStorage } from "async_hooks";

// One per-request scope holding the active shop's id. Middleware sets it
// after the session is loaded; every model uses currentShopId() to filter
// queries. This avoids threading shopId through every function signature.
//
// IMPORTANT: code that runs OUTSIDE a request (the seed script, the boot
// migration runner, ad-hoc tsx scripts) must wrap its work in
// `runWithShop(id, fn)` so model calls work. The migration runner itself
// is exempt because it issues raw SQL, not Kysely model calls.

const storage = new AsyncLocalStorage<{ shopId: number }>();

export function runWithShop<T>(shopId: number, fn: () => Promise<T> | T): Promise<T> | T {
  return storage.run({ shopId }, fn);
}

// Returns null if not in a shop context — callers must decide whether
// that's fatal or not. Most should treat it as a programmer error.
export function maybeCurrentShopId(): number | null {
  return storage.getStore()?.shopId ?? null;
}

// Throws if called outside any runWithShop block. This is the version
// every model should use — a missing shopId is a bug, not a possibility
// to handle gracefully.
export function currentShopId(): number {
  const id = maybeCurrentShopId();
  if (id == null) {
    throw new Error("currentShopId() called outside a shop context. " +
      "If this is a script, wrap your work in runWithShop(shopId, ...). " +
      "If this is a request, the auth/setup middleware should have run.");
  }
  return id;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: same errors as Task 2 (still no shop_id in model inserts); the new file itself compiles clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/shopContext.ts
git commit -m "lib(multitenant): AsyncLocalStorage-backed shop context

currentShopId() reads from ALS set by middleware. Throws if called
outside a request — that's a bug, not a state to handle."
```

---

## Task 4: Session shape — add shopId

**Files:**
- Modify: `src/lib/session.ts:34-41` (the declare module block)

- [ ] **Step 1: Add `shopId?: number` to the session augmentation**

Edit `src/lib/session.ts`. The `declare module "express-session"` block becomes:

```typescript
declare module "express-session" {
  interface SessionData {
    shopId?: number;
    employeeId?: number;
    role?: "owner" | "employee";
    csrfToken?: string;
    flash?: { type: "success" | "error" | "info"; text: string }[];
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: same errors as Task 2 (model inserts still missing shop_id); session change itself clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/session.ts
git commit -m "session(multitenant): track shopId on the session"
```

---

## Task 5: shops model

**Files:**
- Create: `src/models/shops.ts`

- [ ] **Step 1: Write `src/models/shops.ts`**

```typescript
import { getDb, nowIso } from "../lib/kysely";
import type { ShopsTable } from "../lib/db-types";
import type { Selectable } from "kysely";

export type Shop = Selectable<ShopsTable>;

// CRUD for shops. Note: these functions intentionally do NOT consult
// currentShopId() — they operate on the shops table itself, which is the
// tenant container, not tenant-scoped data. The /signup flow creates a
// shop; an admin tool (not yet built) might list or rename shops.

export async function create(name: string): Promise<Shop> {
  const row = await getDb()
    .insertInto("shops")
    .values({ name, created_at: nowIso() })
    .returning(["id", "name", "created_at"])
    .executeTakeFirstOrThrow();
  return row as Shop;
}

export async function findById(id: number): Promise<Shop | null> {
  const r = await getDb()
    .selectFrom("shops")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
  return r ?? null;
}

export async function findByEmployeeId(employeeId: number): Promise<Shop | null> {
  const r = await getDb()
    .selectFrom("shops as s")
    .innerJoin("employees as e", "e.shop_id", "s.id")
    .selectAll("s")
    .where("e.id", "=", employeeId)
    .executeTakeFirst();
  return r ?? null;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: same Phase 2 pending errors. The new file compiles.

- [ ] **Step 3: Commit**

```bash
git add src/models/shops.ts
git commit -m "model(multitenant): shops CRUD

Three operations: create at signup, findById, and findByEmployeeId
(used by login to resolve the session.shopId after authenticating)."
```

---

## Task 6: Update audit lib to scope by shop

**Files:**
- Modify: `src/lib/audit.ts`

- [ ] **Step 1: Replace `src/lib/audit.ts`**

```typescript
import { getDb, nowIso } from "./kysely";
import { currentShopId } from "./shopContext";

export type AuditEntry = {
  actor_id: number | null;
  action: string;
  entity: string;
  entity_id: number | null;
};

export async function writeAudit(entry: AuditEntry): Promise<void> {
  await getDb().insertInto("audit_log").values({
    shop_id: currentShopId(),
    actor_id: entry.actor_id,
    action: entry.action,
    entity: entry.entity,
    entity_id: entry.entity_id,
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
    .where("shop_id", "=", currentShopId())
    .orderBy("at", "desc")
    .limit(limit)
    .execute();
}
```

- [ ] **Step 2: Verify tests still build**

```bash
npx tsc --noEmit
```

Expected: same set of model-related errors. `audit.ts` itself compiles clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/audit.ts
git commit -m "audit(multitenant): scope writes + reads by current shop"
```

---

## Task 7: Convert employees model (canonical pattern for Tasks 8-15)

**Files:**
- Modify: `src/models/employees.ts`

The pattern shown here applies to every model conversion in Tasks 8-15. Read this carefully.

- [ ] **Step 1: Read `src/models/employees.ts` to see the current shape**

Note every exported function. You'll add `shop_id` filter to every read and every write.

- [ ] **Step 2: Edit the file with these transformations**

The conversion rules:
1. `import { currentShopId } from "../lib/shopContext";` at the top.
2. Every `selectFrom("employees")` chain adds `.where("shop_id", "=", currentShopId())`.
3. Every `insertInto("employees").values({...})` includes `shop_id: currentShopId()` in the values.
4. Every `updateTable("employees")` chain adds `.where("shop_id", "=", currentShopId())` so we never accidentally update another shop's row.
5. Every `deleteFrom("employees")` adds the same shop_id where.
6. Foreign-key reads (e.g., `findById` followed by data access) still need the shop_id filter — otherwise an attacker who guesses an employee id from another shop could read it via your own URL.

Full reference rewrite for `src/models/employees.ts`:

```typescript
import { getDb, nowIso } from "../lib/kysely";
import { currentShopId } from "../lib/shopContext";
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
    .where("shop_id", "=", currentShopId())
    .executeTakeFirstOrThrow();
  return Number(row.c);
}

export async function hasActiveCashiers(): Promise<boolean> {
  const row = await getDb()
    .selectFrom("employees")
    .select((eb) => eb.fn.countAll<number>().as("c"))
    .where("shop_id", "=", currentShopId())
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
      shop_id: currentShopId(),
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
  // SPECIAL: at LOGIN time we don't yet know which shop the user belongs to.
  // We have to look up the employee globally by username and then resolve
  // their shop from the row itself. Login is the ONE place where we read
  // without a shopId filter; everywhere else uses currentShopId.
  // Note: username is unique per shop, NOT globally — so multiple shops
  // may have an employee named "owner". We can't disambiguate from
  // username alone, so login takes the FIRST match. The signup flow must
  // ensure each new shop's owner picks a username that doesn't collide
  // with another shop's owner if we want clean dual-shop demos.
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
    .where("shop_id", "=", currentShopId())
    .where("id", "=", id)
    .executeTakeFirst();
  return row ?? null;
}

export async function updatePassword(id: number, password_hash: string): Promise<void> {
  await getDb()
    .updateTable("employees")
    .set({ password_hash, updated_at: nowIso() })
    .where("shop_id", "=", currentShopId())
    .where("id", "=", id)
    .execute();
}

export async function setActive(id: number, active: boolean): Promise<void> {
  await getDb()
    .updateTable("employees")
    .set({ is_active: active ? 1 : 0, updated_at: nowIso() })
    .where("shop_id", "=", currentShopId())
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
  let q = getDb().selectFrom("employees").selectAll().where("shop_id", "=", currentShopId());
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
    .where("shop_id", "=", currentShopId())
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
    .where("shop_id", "=", currentShopId())
    .where("id", "=", id)
    .execute();
}

export async function setOnboardingStatus(id: number, status: "incomplete" | "complete"): Promise<void> {
  await getDb()
    .updateTable("employees")
    .set({ onboarding_status: status, updated_at: nowIso() })
    .where("shop_id", "=", currentShopId())
    .where("id", "=", id)
    .execute();
}
```

- [ ] **Step 3: Verify TS compiles for this file**

```bash
npx tsc --noEmit 2>&1 | grep -c "employees.ts"
```

Expected: 0 (other models still error, but employees is clean).

- [ ] **Step 4: Commit**

```bash
git add src/models/employees.ts
git commit -m "model(multitenant): employees scopes every read/write by shop

findByUsername is the lone exception — login looks up across shops then
resolves shopId from the matched row."
```

---

## Tasks 8-15: Apply the Task 7 pattern to remaining models

For each model below, apply the same shape as Task 7:
1. Add `import { currentShopId } from "../lib/shopContext";`
2. `where("shop_id", "=", currentShopId())` on every select/update/delete that targets that table.
3. `shop_id: currentShopId()` in every `.values({...})` insert.
4. Joined queries (e.g., reports doing inner-join across tables) put the where on the **primary** table — Postgres optimizes the join.

Each task:
- Read the file
- Apply the transformations
- Run `npx tsc --noEmit 2>&1 | grep -c "<filename>"` to verify zero errors in that file
- Commit

### Task 8: `src/models/guarantors.ts`
Commit msg: `model(multitenant): guarantors scopes by shop`

### Task 9: `src/models/attachments.ts`
Commit msg: `model(multitenant): attachments scopes by shop`

### Task 10: `src/models/menuItems.ts`
Special: `listActiveByPopularity` joins sale_line_items — filter on `menu_items.shop_id`, NOT on the joined table.
Commit msg: `model(multitenant): menuItems scopes by shop; popularity ranking joins respect shop boundary`

### Task 11: `src/models/salesSessions.ts` AND `src/models/saleLineItems.ts`
Lines.upsert reads from menu_items — that read also needs the shop_id filter even though the menu_items model already filters: the bare `getDb().selectFrom("menu_items")...` inside Lines.upsert must include `.where("shop_id", "=", currentShopId())` because we're querying directly, not via the model.
Commit msg: `model(multitenant): sales + line items scope by shop; line-item menu price lookup filters too`

### Task 12: `src/models/purchases.ts`
Commit msg: `model(multitenant): purchases scopes by shop`

### Task 13: `src/models/pettyCash.ts`
Commit msg: `model(multitenant): pettyCash scopes by shop`

### Task 14: `src/models/payrollRuns.ts` AND `src/models/payrollEntries.ts`
listForRun/listForEmployee join across runs+entries — filter on **e.shop_id** (entries is the primary; FK to runs is already in-shop).
Commit msg: `model(multitenant): payroll scopes by shop`

### Task 15: `src/models/settings.ts`
Per-shop cache: the in-memory cache becomes a `Map<shopId, Map<key, value>>` rather than a single Map. `cache()` reads `currentShopId()` and returns the per-shop map. `set()` invalidates only the current shop's cache. Insert values include `shop_id: currentShopId()`. On-conflict updateSet now uses `(shop_id, key)` composite — `oc.columns(["shop_id", "key"]).doUpdateSet(...)`.

Full reference rewrite for `src/models/settings.ts`:

```typescript
import { getDb, nowIso } from "../lib/kysely";
import { currentShopId } from "../lib/shopContext";

const _caches = new Map<number, { map: Map<string, string>; loadedAt: number }>();
const CACHE_TTL_MS = 30_000;

async function cache(): Promise<Map<string, string>> {
  const shopId = currentShopId();
  const hit = _caches.get(shopId);
  if (hit && Date.now() - hit.loadedAt < CACHE_TTL_MS) return hit.map;
  const rows = await getDb()
    .selectFrom("settings")
    .select(["key", "value"])
    .where("shop_id", "=", shopId)
    .execute();
  const m = new Map<string, string>();
  for (const r of rows) m.set(r.key, r.value);
  _caches.set(shopId, { map: m, loadedAt: Date.now() });
  return m;
}

function invalidate(shopId: number): void {
  _caches.delete(shopId);
}

export async function get(key: string): Promise<string | null> {
  const m = await cache();
  return m.has(key) ? m.get(key)! : null;
}

export async function set(key: string, value: string): Promise<void> {
  const shopId = currentShopId();
  const now = nowIso();
  await getDb()
    .insertInto("settings")
    .values({ shop_id: shopId, key, value, updated_at: now })
    .onConflict((oc) => oc.columns(["shop_id", "key"]).doUpdateSet({ value, updated_at: now }))
    .execute();
  invalidate(shopId);
}

export async function getAll(): Promise<Record<string, string>> {
  const m = await cache();
  return Object.fromEntries(m);
}

export async function getNumber(key: string): Promise<number> {
  const v = await get(key);
  if (v === null) throw new Error(`settings.getNumber: missing key "${key}"`);
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`settings.getNumber: "${key}" not numeric ("${v}")`);
  return n;
}

export async function getBool(key: string): Promise<boolean> {
  return (await get(key)) === "true";
}

export function _invalidateCache(): void {
  _caches.clear();
}
```

Commit msg: `model(multitenant): settings keyed by (shop, key); cache is per-shop`

### Verification gate after Task 15

```bash
npx tsc --noEmit 2>&1 | grep "src/models" | head -5
```

Expected: empty. Every model compiles clean. Other errors (controllers, lib) still expected.

---

## Task 16: lib/reports + lib/setupStatus + lib/onboarding scope by shop

**Files:**
- Modify: `src/lib/reports.ts`
- Modify: `src/lib/setupStatus.ts`
- Modify: `src/lib/onboarding.ts`

- [ ] **Step 1: Update `src/lib/reports.ts`**

Every aggregate query gains `.where(<primary_table>.shop_id, "=", currentShopId())`. The memoize cache key gains `shop:${shopId}` prefix so two shops' cached results don't collide.

For each memoize call, change:
```typescript
return memoize(`reports:salesByDay:${range.from}:${range.to}`, TTL_MS, async () => {
```
to:
```typescript
const shopId = currentShopId();
return memoize(`reports:shop:${shopId}:salesByDay:${range.from}:${range.to}`, TTL_MS, async () => {
```

Inside each query body, add the shop_id where clause on the primary table (`sales_sessions.shop_id`, `purchase_requisitions.shop_id`, `petty_cash_entries.shop_id`, `sale_line_items.shop_id` for topItemsToday). 12 functions total.

- [ ] **Step 2: Update `src/lib/setupStatus.ts`**

`tableHasRows` becomes shop-aware:

```typescript
async function tableHasRows(table: keyof DB): Promise<boolean> {
  const row = await getDb()
    .selectFrom(table)
    .select("id" as any)
    .where("shop_id" as any, "=", currentShopId())
    .limit(1)
    .executeTakeFirst();
  return !!row;
}
```

Also add `import { currentShopId } from "./shopContext";`.

- [ ] **Step 3: Update `src/lib/onboarding.ts`**

Onboarding's `calculateCompleteness(employeeId)` calls `Attachments.findOneByKind`, `Guarantors.listForEmployee`, `Employees.findFull` — all of which now scope by shop. Onboarding itself doesn't need to call `currentShopId()` directly. **But** verify that every call site of the underlying models is on the converted versions (they all are after Tasks 7-15).

No code change inside onboarding.ts is required if the model layer is correct. Smoke test by running `npx tsc --noEmit` and confirming onboarding.ts compiles clean.

- [ ] **Step 4: Models cache invalidation**

`src/models/salesSessions.ts`, `saleLineItems.ts`, `purchases.ts`, `pettyCash.ts` each call `invalidate("reports:")` on writes. Update them to invalidate per-shop:

```typescript
import { currentShopId } from "../lib/shopContext";
// ...
invalidate(`reports:shop:${currentShopId()}:`);
```

Else shop A's writes would bust shop B's cache. Mild perf regression, not a correctness issue, but worth fixing.

- [ ] **Step 5: Verify**

```bash
npx tsc --noEmit 2>&1 | grep "src/lib" | head -5
```

Expected: empty.

- [ ] **Step 6: Commit**

```bash
git add src/lib/reports.ts src/lib/setupStatus.ts src/lib/onboarding.ts src/models/*.ts
git commit -m "lib(multitenant): reports + setupStatus + cache key + invalidation scoped per shop"
```

---

## Task 17: Storage paths scoped per shop

**Files:**
- Modify: `src/lib/storage/index.ts` (the `storageKey` helper)
- Modify: `src/lib/storage/local.ts` (filesystem paths)
- Modify: `src/lib/storage/supabase.ts` (Supabase keys)

- [ ] **Step 1: Update `storageKey` in `src/lib/storage/index.ts`**

Change:
```typescript
export function storageKey(ownerType: OwnerType, ownerId: number, filename: string): string {
  return `${ownerType}/${ownerId}/${filename}`;
}
```

To:
```typescript
import { currentShopId } from "../shopContext";

export function storageKey(ownerType: OwnerType, ownerId: number, filename: string): string {
  return `shops/${currentShopId()}/${ownerType}/${ownerId}/${filename}`;
}
```

- [ ] **Step 2: Update `LocalStorage.dirFor` in `src/lib/storage/local.ts`**

Currently:
```typescript
function dirFor(ownerType: OwnerType, ownerId: number): string {
  const d = join(ROOT, ownerType, String(ownerId));
  ...
}
```

Change to use shop scope:
```typescript
import { currentShopId } from "../shopContext";

function dirFor(ownerType: OwnerType, ownerId: number): string {
  const d = join(ROOT, "shops", String(currentShopId()), ownerType, String(ownerId));
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  return d;
}
```

- [ ] **Step 3: Supabase storage already uses `storageKey()`**

`SupabaseStorage` in `src/lib/storage/supabase.ts` already routes through `storageKey()`, so it picks up the change automatically. Verify by reading the file — no edit needed. If `exists()` constructs the list path manually (`${ownerType}/${ownerId}`), update it to `shops/${currentShopId()}/${ownerType}/${ownerId}`.

- [ ] **Step 4: Verify build**

```bash
npx tsc --noEmit 2>&1 | grep "src/lib/storage" | head -5
```

Expected: empty.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/
git commit -m "storage(multitenant): all paths under shops/{shopId}/...

Local fs and Supabase bucket both gain a shops/{id}/ prefix so two
shops can't ever produce a colliding object key."
```

---

## Task 18: Middleware — establish shop context per request

**Files:**
- Modify: `src/middleware/locals.ts`
- Modify: `src/middleware/requireAuth.ts`
- Modify: `src/app.ts`

- [ ] **Step 1: Locals middleware exposes shopId + shopName to views**

Edit `src/middleware/locals.ts`. After existing logic, before `next()`, add:

```typescript
res.locals.shopId = req.session.shopId ?? null;
```

The shop name is loaded from Settings later in the request once shop context is established. Locals just exposes the id.

- [ ] **Step 2: requireAuth opens the shop context**

Edit `src/middleware/requireAuth.ts`. Wrap `next()` in `runWithShop`:

```typescript
import { runWithShop } from "../lib/shopContext";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.employeeId || !req.session.shopId) {
    return res.redirect("/login");
  }
  // Establish shop context for the rest of this request. Every downstream
  // model call sees this via currentShopId().
  runWithShop(req.session.shopId, () => next());
}
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit 2>&1 | head
```

Expected: empty.

- [ ] **Step 4: Commit**

```bash
git add src/middleware/locals.ts src/middleware/requireAuth.ts
git commit -m "middleware(multitenant): requireAuth establishes shop context via ALS"
```

---

## Task 19: Auth controller — resolve shopId at login

**Files:**
- Modify: `src/controllers/authController.ts`

- [ ] **Step 1: Update login handler**

The current login looks up employee by username + verifies password. Add: after a successful lookup, read the employee's `shop_id` and store both `employeeId` and `shopId` on the session.

```typescript
import bcrypt from "bcrypt";
import type { Request, Response } from "express";
import * as Employees from "../models/employees";
import { writeAudit } from "../lib/audit";
import { pushFlash } from "../lib/flash";
import { runWithShop } from "../lib/shopContext";

export async function showLogin(req: Request, res: Response) {
  if (req.session.employeeId) return res.redirect("/");
  res.render("login");
}

export async function login(req: Request, res: Response) {
  const username = (req.body.username || "").toString().trim();
  const password = (req.body.password || "").toString();
  if (!username || !password) {
    pushFlash(req, "error", "Username and password required");
    return res.redirect("/login");
  }
  const user = await Employees.findByUsername(username);
  if (!user || !user.password_hash) {
    pushFlash(req, "error", "Invalid credentials");
    return res.redirect("/login");
  }
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    pushFlash(req, "error", "Invalid credentials");
    return res.redirect("/login");
  }
  req.session.employeeId = user.id;
  req.session.role = user.role;
  req.session.shopId = user.shop_id;
  // Audit needs shop context to write to the right shop's audit log.
  await runWithShop(user.shop_id, async () => {
    await writeAudit({ actor_id: user.id, action: "login", entity: "session", entity_id: null });
  });
  res.redirect("/");
}

export async function logout(req: Request, res: Response) {
  const id = req.session.employeeId;
  const shopId = req.session.shopId;
  if (id && shopId) {
    await runWithShop(shopId, async () => {
      await writeAudit({ actor_id: id, action: "logout", entity: "session", entity_id: null });
    });
  }
  req.session.destroy(() => res.redirect("/login"));
}
```

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit 2>&1 | head
```

Expected: empty.

- [ ] **Step 3: Commit**

```bash
git add src/controllers/authController.ts
git commit -m "auth(multitenant): login resolves shopId from matched employee row"
```

---

## Task 20: Signup flow

**Files:**
- Create: `src/controllers/signupController.ts`
- Create: `src/views/signup.ejs`
- Modify: `src/routes/index.ts`

- [ ] **Step 1: Write `src/controllers/signupController.ts`**

```typescript
import bcrypt from "bcrypt";
import type { Request, Response } from "express";
import * as Shops from "../models/shops";
import * as Employees from "../models/employees";
import * as Settings from "../models/settings";
import { writeAudit } from "../lib/audit";
import { pushFlash } from "../lib/flash";
import { runWithShop } from "../lib/shopContext";
import { getDb } from "../lib/db";

export async function showSignup(req: Request, res: Response) {
  if (req.session.employeeId) return res.redirect("/");
  res.render("signup");
}

export async function signup(req: Request, res: Response) {
  const shop_name = (req.body.shop_name || "").toString().trim();
  const full_name = (req.body.full_name || "").toString().trim();
  const username = (req.body.username || "").toString().trim();
  const password = (req.body.password || "").toString();

  if (!shop_name || !full_name || !username || !password) {
    pushFlash(req, "error", "All fields required");
    return res.redirect("/signup");
  }
  if (password.length < 8) {
    pushFlash(req, "error", "Password must be at least 8 characters");
    return res.redirect("/signup");
  }

  // Whole signup is one transaction. If anything fails, the shop, owner,
  // and seeded settings all roll back.
  const hash = await bcrypt.hash(password, 12);
  const result = await getDb().transaction().execute(async (trx) => {
    const shop = await trx
      .insertInto("shops")
      .values({ name: shop_name, created_at: new Date().toISOString().replace("T", " ").slice(0, 19) })
      .returning(["id"])
      .executeTakeFirstOrThrow();

    // Inside the trx we can't easily use the per-request ALS; do raw inserts.
    const owner = await trx
      .insertInto("employees")
      .values({
        shop_id: shop.id,
        full_name,
        username,
        password_hash: hash,
        role: "owner",
        created_at: new Date().toISOString().replace("T", " ").slice(0, 19),
        updated_at: new Date().toISOString().replace("T", " ").slice(0, 19),
      })
      .returning(["id"])
      .executeTakeFirstOrThrow();

    // Seed the new shop's default settings (mirrors migration 002 but per-shop).
    const defaults: [string, string][] = [
      ["shop_name", shop_name],
      ["currency_code", "ETB"],
      ["currency_symbol", "Br"],
      ["decimal_places", "2"],
      ["thousand_separator", ","],
      ["decimal_separator", "."],
      ["pension_employer_default_pct", "11"],
      ["pension_employee_default_pct", "7"],
      ["standard_days_in_month", "30"],
      ["require_complete_hr_before_payroll", "true"],
      ["business_day_cutoff", "00:00"],
      ["timezone", "Africa/Addis_Ababa"],
    ];
    for (const [k, v] of defaults) {
      await trx.insertInto("settings").values({
        shop_id: shop.id, key: k, value: v,
        updated_at: new Date().toISOString().replace("T", " ").slice(0, 19),
      }).execute();
    }
    return { shopId: shop.id, ownerId: owner.id };
  });

  // Log the new user in.
  req.session.employeeId = result.ownerId;
  req.session.shopId = result.shopId;
  req.session.role = "owner";
  await runWithShop(result.shopId, async () => {
    await writeAudit({ actor_id: result.ownerId, action: "signup", entity: "shops", entity_id: result.shopId });
  });
  pushFlash(req, "success", `Welcome to ${shop_name}.`);
  res.redirect("/");
}
```

- [ ] **Step 2: Write `src/views/signup.ejs`**

```ejs
<%- include('partials/head', { title: "Sign up", shopName: "Buna Counter" }) %>
<body class="text-ink font-sans antialiased min-h-screen bg-cream flex items-center justify-center px-gutter">
  <main class="w-full max-w-md">
    <%- include('partials/flash', { flash }) %>
    <h1 class="text-display text-[44px] leading-[48px] mb-air">Open your shop</h1>
    <p class="font-display italic text-[16px] text-coal mb-air-lg">Create your account. You'll be the owner; you can add staff after.</p>
    <form method="POST" action="/signup" class="space-y-gutter">
      <input type="hidden" name="_csrf" value="<%= csrfToken %>" />
      <label class="block">
        <span class="field-label">Shop name</span>
        <input type="text" name="shop_name" required maxlength="120" class="field-input" autofocus placeholder="My Coffee Shop" />
      </label>
      <label class="block">
        <span class="field-label">Your full name</span>
        <input type="text" name="full_name" required maxlength="120" class="field-input" placeholder="Almaz Bekele" />
      </label>
      <label class="block">
        <span class="field-label">Username (for login)</span>
        <input type="text" name="username" required maxlength="60" pattern="[A-Za-z0-9_]+" class="field-input field-mono" placeholder="almaz" />
      </label>
      <label class="block">
        <span class="field-label">Password (min 8 chars)</span>
        <input type="password" name="password" required minlength="8" class="field-input" />
      </label>
      <button type="submit" class="btn-primary w-full mt-air">Create my shop</button>
      <p class="text-center text-[14px] text-coal mt-gutter">
        Already have a shop? <a href="/login" class="link">Log in</a>
      </p>
    </form>
  </main>
</body>
</html>
```

- [ ] **Step 3: Wire `/signup` into `src/routes/index.ts`**

Add routes (assumes the existing routes file has a `router` Router and assorted GET/POST registrations). Place these near `/login` registrations:

```typescript
import * as SignupCtrl from "../controllers/signupController";
// ...
router.get("/signup",  SignupCtrl.showSignup);
router.post("/signup", SignupCtrl.signup);
```

- [ ] **Step 4: Retire requireSetup**

Edit `src/middleware/requireSetup.ts` so it redirects to `/signup` instead of `/setup` if zero shops exist. (Long term we delete the file, but keep it for now so we don't have to remove its `app.use` registration in this commit.)

Actually simpler: delete the middleware entirely.

```bash
git rm src/middleware/requireSetup.ts src/controllers/setupController.ts src/views/setup.ejs
```

And remove `import { requireSetup } from "./middleware/requireSetup";` + `app.use(requireSetup);` from `src/app.ts`.

Also remove any `/setup` route registrations from `src/routes/index.ts`.

- [ ] **Step 5: Verify**

```bash
npx tsc --noEmit 2>&1 | head
```

Expected: empty.

- [ ] **Step 6: Manual smoke test (sqlite)**

```bash
rm -f data/shop.db
DB_DRIVER=sqlite npm run build && DB_DRIVER=sqlite npm start &
sleep 3
curl -s http://localhost:3000/ -L | grep -o "Open your shop\|signup" | head -1
kill %1
```

Expected: prints `Open your shop` (the signup page renders).

- [ ] **Step 7: Commit**

```bash
git add src/controllers/signupController.ts src/views/signup.ejs src/routes/index.ts src/app.ts
git rm src/middleware/requireSetup.ts src/controllers/setupController.ts src/views/setup.ejs
git commit -m "signup(multitenant): /signup creates shop + owner + default settings atomically

Retires the old /setup wizard. Anyone hitting the app without a session
now lands on /signup → /login flow."
```

---

## Task 21: Controllers — fix all the unrelated breakages

Every controller currently calls `writeAudit`, `Employees.create`, etc. — these still work without code changes because they read shopId from ALS, which is now set by `requireAuth` middleware.

The exceptions where you might need an edit:

- `src/controllers/employeesController.ts`: `serveEmployeeFile` and `serveGuarantorFile` build storage keys. The storage layer already includes the shop now, so no controller change.
- `src/controllers/setupController.ts`: deleted in Task 20.
- `src/controllers/payrollController.ts`: `requireComplete` check on signup is fine.
- All other controllers: no change.

- [ ] **Step 1: Final TS sweep**

```bash
npx tsc --noEmit
```

Expected: zero errors. If any remain, fix them — they're real issues.

- [ ] **Step 2: Commit any fixes**

```bash
git commit -am "controllers(multitenant): patch any residuals after model conversion"
```

(If the diff is empty, skip the commit.)

---

## Task 22: Seed-demo against the new schema

**Files:**
- Modify: `bin/seed-demo.ts`

- [ ] **Step 1: Replace seed-demo so it wraps the entire seeding in `runWithShop`**

Before the seed logic, after `runMigrations()` and the wipe step:

```typescript
import { runWithShop } from "../src/lib/shopContext";
import * as Shops from "../src/models/shops";

// ...

// Create or reuse "Sample Shop"
let sampleShop = await Shops.findById(1);
if (!sampleShop) sampleShop = await Shops.create("Sample Shop");

// Wrap everything below in the shop context so models see the right id.
await runWithShop(sampleShop.id, async () => {
  // ... all existing Settings.set / Employees.create / etc. calls
});
```

The settings seeding (the `Settings.set` calls) is also done per-shop now, automatically.

- [ ] **Step 2: Run seed against sqlite**

```bash
rm -f data/shop.db
DB_DRIVER=sqlite npm run seed:demo
```

Expected: same row counts as before (3 employees, 27 menu items, 28 sessions, ...). Verify:

```bash
sqlite3 data/shop.db "SELECT shop_id, COUNT(*) FROM employees GROUP BY shop_id"
```

Expected: `1|3` (3 employees, all in shop 1).

- [ ] **Step 3: Verify isolation**

```bash
sqlite3 data/shop.db "INSERT INTO shops (name) VALUES ('Other Shop'); SELECT id FROM shops WHERE name='Other Shop'"
```

Note the returned id (likely 2). Then:

```bash
sqlite3 data/shop.db "SELECT COUNT(*) FROM employees WHERE shop_id=2"
```

Expected: `0`. Confirms the seeded data is bound to shop 1.

- [ ] **Step 4: Commit**

```bash
git add bin/seed-demo.ts
git commit -m "seed(multitenant): wrap seeding in runWithShop(SampleShop.id)"
```

---

## Task 23: Test harness — each test seeds its own shop

**Files:**
- Create: `tests/lib/testShop.ts`
- Modify: every test file

- [ ] **Step 1: Create `tests/lib/testShop.ts`**

```typescript
import { getDb } from "../../src/lib/db";
import { runWithShop } from "../../src/lib/shopContext";

let _counter = 0;

// Creates a fresh shop in the current DB and returns its id. Tests call
// this in beforeEach, then wrap their assertions in runInShop.
export async function seedTestShop(name?: string): Promise<number> {
  _counter += 1;
  const shopName = name ?? `Test Shop ${_counter}-${Date.now()}`;
  const r = await getDb()
    .insertInto("shops")
    .values({ name: shopName, created_at: new Date().toISOString().replace("T", " ").slice(0, 19) })
    .returning("id")
    .executeTakeFirstOrThrow();
  return r.id;
}

// Wrap a test body in the given shop's context. Use this so the model
// layer's currentShopId() finds the right value.
export function runInShop<T>(shopId: number, fn: () => Promise<T>): Promise<T> {
  return runWithShop(shopId, fn) as Promise<T>;
}
```

- [ ] **Step 2: Refactor model-test pattern**

For each `tests/models/*.test.ts`, the per-test setup changes from:

```typescript
beforeEach(async () => {
  await closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  await runMigrations();
});
```

to:

```typescript
import { seedTestShop, runInShop } from "../lib/testShop";

let shopId: number;

beforeEach(async () => {
  await closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  await runMigrations();
  shopId = await seedTestShop();
});
```

And every `it(...)` body wraps its assertions:

```typescript
it("create() inserts a row", async () => {
  await runInShop(shopId, async () => {
    const e = await Employees.create({ ... });
    expect(e.id).toBeGreaterThan(0);
  });
});
```

There are 11 model test files (`employees`, `guarantors`, `attachments`, `menuItems`, `salesSessions`, `purchases`, `pettyCash`, `payrollRuns`, `payrollEntries`, `settings`, `audit` — note audit is `tests/audit.test.ts` not under models/). Each gets the same treatment.

- [ ] **Step 3: Integration tests get the same wrapping, plus auth simulation**

For `tests/integration/*.test.ts`, beforeEach should:
1. Seed a shop
2. Seed an owner inside that shop (via `runInShop`)
3. Log in via supertest (the login flow sets session.shopId so subsequent requests work)

Example for `tests/integration/auth.test.ts`:

```typescript
beforeEach(async () => {
  // ...standard wipe...
  shopId = await seedTestShop();
  await runInShop(shopId, async () => {
    const hash = await bcrypt.hash("pw", 12);
    await Employees.create({ full_name: "Owner", username: "owner", password_hash: hash, role: "owner" });
  });
});
```

The HTTP layer doesn't need explicit `runInShop` wrapping because middleware does it on every request.

- [ ] **Step 4: Run the test suite**

```bash
rm -f data/test-*.db
DB_DRIVER=sqlite npm test 2>&1 | tail -5
```

Expected: 144 tests pass (count may differ slightly if you've added shop-related tests).

If any tests fail, fix them. The most common failure shape: a test does data setup OUTSIDE a `runInShop` wrapper, so `currentShopId()` throws "called outside a shop context". Move the setup inside.

- [ ] **Step 5: Commit**

```bash
git add tests/lib/testShop.ts tests/
git commit -m "tests(multitenant): each test seeds its own shop, asserts inside runInShop"
```

---

## Task 24: Cutover plan + invalidate live sessions

**Files:** None — operator runbook.

This task is the deployment ritual, not code. Skip it if you're still iterating; run when you're ready to promote multi-tenant to production.

- [ ] **Step 1: Merge the feature branch**

```bash
git checkout main
git merge --no-ff multi-tenant-rewrite
```

- [ ] **Step 2: Push and trigger Vercel deploy**

```bash
git push
```

Vercel auto-deploys. Watch the **Functions** tab on the first hit — the `runMigrations()` call will apply 006_multitenant.sql to your existing Supabase, including assigning the existing seeded rows to Sample Shop (id=1).

- [ ] **Step 3: Invalidate existing logged-in sessions**

Old sessions don't have `shopId` and would fail at the first model call. Force everyone to re-login:

```bash
psql "$DATABASE_URL" -c "TRUNCATE user_sessions"
```

(Or do it via the Supabase SQL editor.)

- [ ] **Step 4: Test signup**

In an incognito browser window, visit your Vercel URL. You should land on `/signup`. Create "Acme Coffee" with username "acme_owner". Log in. Dashboard should be empty (no menu, no sales, no employees yet other than you).

- [ ] **Step 5: Test isolation**

In a second incognito window, log in as the existing Sample Shop owner (`owner` / `demo123` from the earlier seed). Confirm you see all 27 menu items + 28 sales sessions. Confirm Acme Coffee is invisible.

- [ ] **Step 6: Commit the deploy notes**

```bash
echo "Multi-tenant cutover on $(date)" >> docs/RUNBOOK.md
git add docs/RUNBOOK.md
git commit -m "ops: log multi-tenant cutover date"
git push
```

---

## Self-Review Notes

**Spec coverage:**
- shops table — Task 1 ✓
- shop_id on every existing table — Task 1 ✓
- /signup flow that creates shop + first owner atomically — Task 20 ✓
- login resolves and stores shop_id — Task 19 ✓
- every query in every model filters by shop_id — Tasks 7-15 ✓
- storage paths scoped under `shops/{shopId}/...` — Task 17 ✓
- RLS policies — Task 1 (in `006_multitenant.sql`) ✓
- data migration assigning existing rows to a default Sample Shop — Task 1 (the `INSERT INTO shops VALUES (1, 'Sample Shop')` + `DEFAULT 1` on each `ALTER TABLE`) ✓
- test refactor so each test seeds its own shop — Task 23 ✓
- settings as composite (shop_id, key) PK — Task 1 + Task 15 ✓

**Open issues callouts:**
- **Username uniqueness is per-shop, not global.** Two shops can both have a user named "owner". This is correct for SaaS (every shop has its own namespace) but breaks the `findByUsername` login lookup: it returns the FIRST match across shops. Task 7 documents this. A real production fix would be to scope login by shop too — e.g., login URL like `/login?shop=acme` or a separate shop-picker step. For the current scope this is acceptable since the demo shop's username is "owner" and new signups should pick unique usernames; document as a known limitation.
- **The 60+ commits will need rebasing if other PRs land on `main` in the interim.** Keep the branch up to date with `git rebase main` periodically.
- **bin/copy-sqlite-to-supabase.ts and bin/copy-uploads-to-supabase.ts** are not refactored — they're one-time tools and the migration's already been done. They'd misbehave if re-run now, but no operator should re-run them.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-17-multi-tenant-saas-rewrite.md`.**

This plan has **24 tasks** spread across 6 conceptual phases:
1. Schema (Task 1)
2. Types + helpers (Tasks 2-5)
3. Library refactors (Tasks 6, 16, 17)
4. Model conversions (Tasks 7-15)
5. Middleware + auth + signup (Tasks 18-21)
6. Seeding + tests + cutover (Tasks 22-24)

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Best for a refactor this size — each task gets a clean context window.

**2. Inline Execution** — I work through the tasks in this session using batch execution with checkpoints. More expensive on context.

**Which approach?**
