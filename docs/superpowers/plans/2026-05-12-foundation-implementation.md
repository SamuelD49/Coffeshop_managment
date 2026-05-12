# Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Coffee Shop Management app's foundation: project scaffolding, TypeScript build, SQLite database with the full schema, session-based auth (bcrypt), first-run owner setup, base EJS layout with role-aware sidebar, dashboard skeleton, settings page, change-password page. After this plan, the owner can log in and see an empty system ready for the resource plans (2–6).

**Architecture:** Classic Express MVC. Single Node process per shop PC. `better-sqlite3` for synchronous DB access. EJS server-rendered views + Tailwind (via standalone CLI) + a small amount of HTMX (vendored). All DB access goes through `/src/models/*` — the only layer that touches `better-sqlite3`. The full 10-table schema lands in migration 001 even though most tables are unused in Plan 1, so future plans don't need to add columns to existing tables.

**Tech Stack:** Node.js, TypeScript, Express, EJS, `better-sqlite3`, `express-session` + `connect-sqlite3`, `bcrypt`, Tailwind CLI standalone, `vitest` (tests), `supertest` (integration), `tsx` (dev runner), hand-rolled CSRF (csurf is deprecated).

**Coding rules carried from the spec:**
- Money stored as integer cents. Never use floats for money.
- All DB access goes through `/src/models/*`.
- Every state-changing write should call `audit.write()` (the helper from `lib/audit.ts`).

---

## Project file structure (created by this plan)

```
coffeeshop-mgmt/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── tailwind.config.js
├── .env.example
├── .gitignore
├── README.md
├── /migrations
│   ├── 001_init.sql              # All 10 tables + indices
│   └── 002_seed_settings.sql     # Default settings rows
├── /src
│   ├── server.ts                 # Entry point — runs migrations then listens
│   ├── app.ts                    # Express app + middleware composition
│   ├── /lib
│   │   ├── db.ts                 # better-sqlite3 wrapper + migration runner
│   │   ├── session.ts            # express-session + connect-sqlite3 config
│   │   ├── money.ts              # cents math + formatter
│   │   ├── dates.ts              # business_date helpers, timezone
│   │   ├── audit.ts              # writeAudit(actor, action, entity, id)
│   │   ├── csrf.ts               # hand-rolled CSRF
│   │   └── flash.ts              # session-flash helper for one-shot messages
│   ├── /models
│   │   ├── employees.ts          # Plan 1 uses only: findByUsername, create, count, updatePassword
│   │   └── settings.ts           # getAll, get, set
│   ├── /middleware
│   │   ├── requireAuth.ts
│   │   ├── requireOwner.ts
│   │   ├── requireSetup.ts       # Redirects to /setup when employees table empty
│   │   ├── csrf.ts               # binds csrf token to res.locals
│   │   ├── locals.ts             # binds user/role/shop_name to res.locals
│   │   └── errorHandler.ts
│   ├── /controllers
│   │   ├── authController.ts     # GET/POST /login, POST /logout
│   │   ├── setupController.ts    # GET/POST /setup (first-run owner)
│   │   ├── dashboardController.ts# GET /
│   │   ├── settingsController.ts # GET/POST /settings
│   │   └── accountController.ts  # GET/POST /account
│   ├── /routes
│   │   └── index.ts              # wires controllers to paths
│   └── /views
│       ├── /layouts/main.ejs
│       ├── /partials/{sidebar,flash,head}.ejs
│       ├── login.ejs
│       ├── setup.ejs
│       ├── dashboard.ejs
│       ├── /settings/index.ejs
│       ├── account.ejs
│       └── /errors/{404,500}.ejs
├── /public
│   ├── /css/app.css              # tailwind output (gitignored, built)
│   └── /js/htmx.min.js           # vendored
├── /data                         # gitignored
│   └── (shop.db, sessions.db created at runtime)
└── /tests
    ├── money.test.ts
    ├── dates.test.ts
    ├── models/settings.test.ts
    ├── models/employees.test.ts
    └── integration/auth.test.ts
```

---

## Task 1: Initialize Node project, TypeScript, and basic tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`, `README.md`, `src/server.ts`

- [ ] **Step 1: Initialize npm and install runtime dependencies**

```bash
cd /Users/sam/Desktop/Coffeshop_managment
rm -f d                       # remove the stray empty file
npm init -y
npm install express ejs better-sqlite3 express-session connect-sqlite3 bcrypt dotenv
npm install -D typescript @types/node @types/express @types/ejs @types/better-sqlite3 @types/express-session @types/bcrypt tsx vitest supertest @types/supertest
```

- [ ] **Step 2: Replace package.json scripts**

Open `package.json` and set the `scripts` block to:

```json
"scripts": {
  "dev": "tsx watch src/server.ts",
  "build": "tsc",
  "start": "node dist/server.js",
  "test": "vitest run",
  "test:watch": "vitest",
  "css:build": "tailwindcss -i public/css/app.css.src -o public/css/app.css --minify",
  "css:watch": "tailwindcss -i public/css/app.css.src -o public/css/app.css --watch"
}
```

Also add `"type": "commonjs"` if not present (better-sqlite3 plays best with CJS). Set `"main": "dist/server.js"`.

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
dist/
data/
.env
public/css/app.css
*.log
.DS_Store
```

- [ ] **Step 5: Create `.env.example`**

```
PORT=3000
SESSION_SECRET=change-me-to-a-long-random-string
NODE_ENV=development
```

- [ ] **Step 6: Create minimal `src/server.ts` to verify build runs**

```ts
import express from "express";

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});
```

- [ ] **Step 7: Verify dev runs**

```bash
npm run dev
```

In another terminal: `curl http://localhost:3000/health` → `{"ok":true}`. Stop the dev process.

- [ ] **Step 8: Verify build works**

```bash
npm run build
ls dist/server.js
```

Expected: `dist/server.js` exists.

- [ ] **Step 9: Create minimal `README.md`**

```markdown
# Coffee Shop Management

Local-first management system for a coffee shop. See [the design spec](docs/superpowers/specs/2026-05-12-coffee-shop-management-design.md) for what it does.

## Quick start (development)

```bash
cp .env.example .env
npm install
npm run css:build       # one-time, builds Tailwind output
npm run dev             # starts on http://localhost:3000
```

First visit redirects to `/setup` to create the owner account.

## Tests

```bash
npm test
```
```

- [ ] **Step 10: Commit**

```bash
git add .
git commit -m "chore: initialize TypeScript Express project"
```

---

## Task 2: Set up Tailwind via standalone CLI

**Files:**
- Create: `tailwind.config.js`, `public/css/app.css.src`

- [ ] **Step 1: Install Tailwind (PostCSS-free standalone)**

```bash
npm install -D tailwindcss
```

- [ ] **Step 2: Create `tailwind.config.js`**

```js
module.exports = {
  content: ["./src/views/**/*.ejs"],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

- [ ] **Step 3: Create `public/css/app.css.src`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 4: Build CSS and verify output exists**

```bash
npm run css:build
ls -la public/css/app.css
```

Expected: `public/css/app.css` exists and is non-empty.

- [ ] **Step 5: Commit**

```bash
git add tailwind.config.js public/css/app.css.src package.json package-lock.json
git commit -m "chore: add Tailwind via standalone CLI"
```

---

## Task 3: Build money helper with TDD

**Files:**
- Create: `src/lib/money.ts`
- Test: `tests/money.test.ts`

This is math-critical code. Test everything.

- [ ] **Step 1: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 2: Write failing tests `tests/money.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { toCents, fromCents, formatMoney, addCents, multiplyCents } from "../src/lib/money";

describe("toCents", () => {
  it("converts a whole-number string to cents", () => {
    expect(toCents("10")).toBe(1000);
  });
  it("converts a decimal string to cents", () => {
    expect(toCents("10.50")).toBe(1050);
  });
  it("rounds half-up at the cent boundary", () => {
    expect(toCents("10.555")).toBe(1056);
    expect(toCents("10.554")).toBe(1055);
  });
  it("handles zero", () => {
    expect(toCents("0")).toBe(0);
  });
  it("throws on invalid input", () => {
    expect(() => toCents("abc")).toThrow();
    expect(() => toCents("")).toThrow();
  });
});

describe("fromCents", () => {
  it("converts cents back to a number with 2 decimals", () => {
    expect(fromCents(1050)).toBe(10.5);
    expect(fromCents(0)).toBe(0);
    expect(fromCents(99)).toBe(0.99);
  });
});

describe("formatMoney", () => {
  it("formats with default ETB Br symbol and 2 decimals", () => {
    expect(formatMoney(1050)).toBe("Br 10.50");
    expect(formatMoney(0)).toBe("Br 0.00");
    expect(formatMoney(123456)).toBe("Br 1,234.56");
  });
  it("respects custom symbol and decimals", () => {
    expect(formatMoney(1050, { symbol: "$", decimalPlaces: 2 })).toBe("$ 10.50");
    expect(formatMoney(1050, { symbol: "Br", decimalPlaces: 0 })).toBe("Br 11");
  });
  it("handles negative amounts", () => {
    expect(formatMoney(-1050)).toBe("Br -10.50");
  });
});

describe("addCents", () => {
  it("sums an array of cent values", () => {
    expect(addCents([100, 200, 300])).toBe(600);
    expect(addCents([])).toBe(0);
    expect(addCents([-100, 100])).toBe(0);
  });
});

describe("multiplyCents", () => {
  it("multiplies cents by a whole quantity", () => {
    expect(multiplyCents(1050, 3)).toBe(3150);
  });
  it("multiplies cents by a fractional quantity and rounds half-up", () => {
    // 1050 * 1.5 = 1575
    expect(multiplyCents(1050, 1.5)).toBe(1575);
    // 333 * 3 = 999 (no rounding needed)
    expect(multiplyCents(333, 3)).toBe(999);
    // 100 * (1/3) = 33.333... → rounds to 33
    expect(multiplyCents(100, 1 / 3)).toBe(33);
  });
});
```

- [ ] **Step 3: Run tests and verify they fail**

```bash
npm test
```

Expected: module not found / function not defined errors.

- [ ] **Step 4: Implement `src/lib/money.ts`**

```ts
export type FormatOptions = {
  symbol?: string;
  decimalPlaces?: number;
  thousandSeparator?: string;
  decimalSeparator?: string;
};

const DEFAULTS: Required<FormatOptions> = {
  symbol: "Br",
  decimalPlaces: 2,
  thousandSeparator: ",",
  decimalSeparator: ".",
};

function halfUp(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

export function toCents(input: string): number {
  if (typeof input !== "string" || input.trim() === "") {
    throw new Error(`toCents: invalid input "${input}"`);
  }
  const n = Number(input);
  if (!Number.isFinite(n)) {
    throw new Error(`toCents: invalid input "${input}"`);
  }
  return halfUp(n * 100);
}

export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

export function formatMoney(cents: number, opts: FormatOptions = {}): string {
  const o = { ...DEFAULTS, ...opts };
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const fraction = abs % 100;

  // Apply requested decimal places (round if < 2, pad if > 2)
  let display: string;
  if (o.decimalPlaces === 2) {
    display = `${whole.toLocaleString("en-US").replace(/,/g, o.thousandSeparator)}${o.decimalSeparator}${fraction.toString().padStart(2, "0")}`;
  } else {
    const asNumber = abs / 100;
    const rounded = halfUp(asNumber * Math.pow(10, o.decimalPlaces)) / Math.pow(10, o.decimalPlaces);
    const [w, f = ""] = rounded.toFixed(o.decimalPlaces).split(".");
    const wFmt = Number(w).toLocaleString("en-US").replace(/,/g, o.thousandSeparator);
    display = o.decimalPlaces === 0 ? wFmt : `${wFmt}${o.decimalSeparator}${f}`;
  }

  return `${o.symbol} ${negative ? "-" : ""}${display}`;
}

export function addCents(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

export function multiplyCents(cents: number, qty: number): number {
  return halfUp(cents * qty);
}
```

- [ ] **Step 5: Run tests and verify they pass**

```bash
npm test
```

Expected: all `money.test.ts` tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/money.ts tests/money.test.ts vitest.config.ts
git commit -m "feat(lib): money helpers with cents math and formatter"
```

---

## Task 4: Build dates helper with TDD

**Files:**
- Create: `src/lib/dates.ts`
- Test: `tests/dates.test.ts`

`businessDate(now, cutoffHHMM, tz)` returns the YYYY-MM-DD that a timestamp "belongs to" given the shop's business-day cutoff.

- [ ] **Step 1: Write failing tests `tests/dates.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { businessDate, parseHHMM, todayBusinessDate } from "../src/lib/dates";

describe("parseHHMM", () => {
  it("parses HH:MM strings", () => {
    expect(parseHHMM("00:00")).toEqual({ hours: 0, minutes: 0 });
    expect(parseHHMM("04:30")).toEqual({ hours: 4, minutes: 30 });
    expect(parseHHMM("23:59")).toEqual({ hours: 23, minutes: 59 });
  });
  it("throws on invalid input", () => {
    expect(() => parseHHMM("24:00")).toThrow();
    expect(() => parseHHMM("12:60")).toThrow();
    expect(() => parseHHMM("abc")).toThrow();
  });
});

describe("businessDate", () => {
  const tz = "Africa/Addis_Ababa";

  it("returns calendar date when cutoff is 00:00", () => {
    const result = businessDate(new Date("2026-05-12T20:00:00Z"), "00:00", tz);
    // 20:00 UTC = 23:00 EAT on 2026-05-12
    expect(result).toBe("2026-05-12");
  });

  it("rolls back to prior day when timestamp is before cutoff", () => {
    // 01:00 EAT with cutoff 04:00 → belongs to previous day
    const result = businessDate(new Date("2026-05-12T22:00:00Z"), "04:00", tz);
    // 22:00 UTC May 12 = 01:00 EAT May 13; before 04:00 cutoff, so belongs to May 12
    expect(result).toBe("2026-05-12");
  });

  it("uses the new day when timestamp is at or after cutoff", () => {
    // 05:00 EAT with cutoff 04:00 → belongs to the same day
    const result = businessDate(new Date("2026-05-13T02:00:00Z"), "04:00", tz);
    // 02:00 UTC May 13 = 05:00 EAT May 13; after 04:00 cutoff
    expect(result).toBe("2026-05-13");
  });
});

describe("todayBusinessDate", () => {
  it("returns a string in YYYY-MM-DD format", () => {
    const today = todayBusinessDate("00:00", "Africa/Addis_Ababa");
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

```bash
npm test
```

Expected: module not found.

- [ ] **Step 3: Implement `src/lib/dates.ts`**

```ts
export type HHMM = { hours: number; minutes: number };

export function parseHHMM(s: string): HHMM {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) throw new Error(`parseHHMM: invalid "${s}"`);
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`parseHHMM: out of range "${s}"`);
  }
  return { hours, minutes };
}

function partsInTimezone(d: Date, tz: string): { year: number; month: number; day: number; hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === "24" ? "0" : parts.hour),
    minute: Number(parts.minute),
  };
}

export function businessDate(now: Date, cutoffHHMM: string, tz: string): string {
  const { hours: ch, minutes: cm } = parseHHMM(cutoffHHMM);
  const p = partsInTimezone(now, tz);
  const minutesIntoDay = p.hour * 60 + p.minute;
  const cutoffMinutes = ch * 60 + cm;

  // Build a date object representing local midnight, then subtract a day if before cutoff
  const local = new Date(Date.UTC(p.year, p.month - 1, p.day));
  if (minutesIntoDay < cutoffMinutes) {
    local.setUTCDate(local.getUTCDate() - 1);
  }
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, "0");
  const d = String(local.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayBusinessDate(cutoffHHMM: string, tz: string): string {
  return businessDate(new Date(), cutoffHHMM, tz);
}
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
npm test
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/dates.ts tests/dates.test.ts
git commit -m "feat(lib): business-date helpers with timezone + cutoff"
```

---

## Task 5: Database connection + migration runner

**Files:**
- Create: `src/lib/db.ts`, `migrations/001_init.sql`, `migrations/002_seed_settings.sql`

The migration runner reads numbered `.sql` files, tracks applied ones in a `schema_migrations` table, and applies new ones in order. Synchronous via `better-sqlite3`.

- [ ] **Step 1: Create `migrations/001_init.sql` with the full schema**

```sql
-- Employees + HR
CREATE TABLE employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_employees_username ON employees(username);
CREATE INDEX idx_employees_active ON employees(is_active);

CREATE TABLE guarantors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_guarantors_employee ON guarantors(employee_id);

CREATE TABLE attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('employee','guarantor')),
  owner_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('profile_photo','id_front','id_back','contract','guarantor_letter','other')),
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  uploaded_by INTEGER REFERENCES employees(id)
);
CREATE INDEX idx_attachments_owner ON attachments(owner_type, owner_id);

-- Menu
CREATE TABLE menu_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_menu_active_sort ON menu_items(is_active, sort_order);

-- Sales
CREATE TABLE sales_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  business_date TEXT NOT NULL,
  shift TEXT,
  cash_amount INTEGER NOT NULL DEFAULT 0,
  bank_transfer_amount INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sales_date ON sales_sessions(business_date);
CREATE INDEX idx_sales_employee_date ON sales_sessions(employee_id, business_date);

CREATE TABLE sale_line_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sales_session_id INTEGER NOT NULL REFERENCES sales_sessions(id) ON DELETE CASCADE,
  menu_item_id INTEGER NOT NULL REFERENCES menu_items(id),
  qty INTEGER NOT NULL DEFAULT 0,
  unit_price_snapshot INTEGER NOT NULL,
  total INTEGER NOT NULL,
  remark TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sale_lines_session ON sale_line_items(sales_session_id);

-- Purchases
CREATE TABLE purchase_requisitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_date TEXT NOT NULL,
  description TEXT NOT NULL,
  unit TEXT,
  qty REAL NOT NULL DEFAULT 0,
  unit_price INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  remark TEXT,
  entered_by INTEGER REFERENCES employees(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_purchases_date ON purchase_requisitions(purchase_date);

-- Petty cash
CREATE TABLE petty_cash_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_date TEXT NOT NULL,
  description TEXT NOT NULL,
  payer_name TEXT,
  amount INTEGER NOT NULL DEFAULT 0,
  type TEXT NOT NULL CHECK (type IN ('expense','refund','replenishment')),
  remark TEXT,
  entered_by INTEGER REFERENCES employees(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_petty_date ON petty_cash_entries(entry_date);

-- Payroll
CREATE TABLE payroll_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved')),
  prepared_by INTEGER REFERENCES employees(id),
  approved_by INTEGER REFERENCES employees(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (year, month)
);

CREATE TABLE payroll_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payroll_run_id INTEGER NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  days_worked REAL NOT NULL DEFAULT 0,
  basic_salary INTEGER NOT NULL DEFAULT 0,
  pension_employer_pct REAL NOT NULL DEFAULT 0,
  pension_employee_pct REAL NOT NULL DEFAULT 0,
  pension_employer_amount INTEGER NOT NULL DEFAULT 0,
  pension_employee_amount INTEGER NOT NULL DEFAULT 0,
  gross_salary INTEGER NOT NULL DEFAULT 0,
  income_tax INTEGER NOT NULL DEFAULT 0,
  advance_salary INTEGER NOT NULL DEFAULT 0,
  total_deduction INTEGER NOT NULL DEFAULT 0,
  net_payment INTEGER NOT NULL DEFAULT 0,
  signed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (payroll_run_id, employee_id)
);

-- Settings (key/value)
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Audit log
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER REFERENCES employees(id),
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_audit_at ON audit_log(at);
CREATE INDEX idx_audit_entity ON audit_log(entity, entity_id);
```

- [ ] **Step 2: Create `migrations/002_seed_settings.sql`**

```sql
INSERT INTO settings (key, value) VALUES
  ('shop_name', 'My Coffee Shop'),
  ('shop_address', ''),
  ('shop_phone', ''),
  ('logo_path', ''),
  ('currency_code', 'ETB'),
  ('currency_symbol', 'Br'),
  ('decimal_places', '2'),
  ('thousand_separator', ','),
  ('decimal_separator', '.'),
  ('pension_employer_default_pct', '11'),
  ('pension_employee_default_pct', '7'),
  ('standard_days_in_month', '30'),
  ('require_complete_hr_before_payroll', 'true'),
  ('business_day_cutoff', '00:00'),
  ('timezone', 'Africa/Addis_Ababa'),
  ('backup_path', './data/backups/');
```

- [ ] **Step 3: Implement `src/lib/db.ts`**

```ts
import Database from "better-sqlite3";
import { readdirSync, readFileSync, mkdirSync, existsSync } from "fs";
import { join, resolve } from "path";

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  const dataDir = resolve(process.cwd(), "data");
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  const dbPath = process.env.DB_PATH ?? join(dataDir, "shop.db");
  _db = new Database(dbPath);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  return _db;
}

export function runMigrations(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const migrationsDir = resolve(process.cwd(), "migrations");
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

  const applied = new Set(
    db.prepare("SELECT filename FROM schema_migrations").all().map((r: any) => r.filename)
  );

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(migrationsDir, file), "utf-8");
    const tx = db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (filename) VALUES (?)").run(file);
    });
    tx();
    console.log(`Applied migration: ${file}`);
  }
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
```

- [ ] **Step 4: Wire migrations into `src/server.ts`**

Replace the contents of `src/server.ts`:

```ts
import "dotenv/config";
import { app } from "./app";
import { runMigrations } from "./lib/db";

const port = Number(process.env.PORT ?? 3000);

runMigrations();

app.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});
```

- [ ] **Step 5: Create stub `src/app.ts`**

```ts
import express from "express";

export const app = express();

app.get("/health", (_req, res) => res.json({ ok: true }));
```

- [ ] **Step 6: Run dev and verify migrations apply**

```bash
rm -rf data && npm run dev
```

Expected console:
```
Applied migration: 001_init.sql
Applied migration: 002_seed_settings.sql
Listening on http://localhost:3000
```

Stop dev. Verify tables:
```bash
sqlite3 data/shop.db ".tables"
```
Expected: lists employees, guarantors, attachments, menu_items, sales_sessions, sale_line_items, purchase_requisitions, petty_cash_entries, payroll_runs, payroll_entries, settings, audit_log, schema_migrations.

- [ ] **Step 7: Commit**

```bash
git add src/lib/db.ts src/app.ts src/server.ts migrations/
git commit -m "feat(db): SQLite schema + idempotent migration runner"
```

---

## Task 6: Settings model with TDD

**Files:**
- Create: `src/models/settings.ts`
- Test: `tests/models/settings.test.ts`

- [ ] **Step 1: Write failing tests `tests/models/settings.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { unlinkSync, existsSync } from "fs";
import { closeDb, runMigrations } from "../../src/lib/db";
import * as Settings from "../../src/models/settings";

const TEST_DB = "./data/test-settings.db";
process.env.DB_PATH = TEST_DB;

beforeEach(() => {
  closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  runMigrations();
});

afterAll(() => {
  closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

describe("Settings model", () => {
  it("reads seeded defaults", () => {
    expect(Settings.get("shop_name")).toBe("My Coffee Shop");
    expect(Settings.get("currency_symbol")).toBe("Br");
  });

  it("returns null for unknown keys", () => {
    expect(Settings.get("nonexistent")).toBeNull();
  });

  it("set() upserts a value", () => {
    Settings.set("shop_name", "Bunna Café");
    expect(Settings.get("shop_name")).toBe("Bunna Café");
    Settings.set("shop_name", "Bunna Café v2");
    expect(Settings.get("shop_name")).toBe("Bunna Café v2");
  });

  it("getAll() returns every key as a flat object", () => {
    const all = Settings.getAll();
    expect(all.shop_name).toBe("My Coffee Shop");
    expect(all.currency_code).toBe("ETB");
    expect(all.business_day_cutoff).toBe("00:00");
  });

  it("getNumber / getBool coerce types", () => {
    expect(Settings.getNumber("decimal_places")).toBe(2);
    expect(Settings.getNumber("pension_employer_default_pct")).toBe(11);
    expect(Settings.getBool("require_complete_hr_before_payroll")).toBe(true);
    Settings.set("require_complete_hr_before_payroll", "false");
    expect(Settings.getBool("require_complete_hr_before_payroll")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

```bash
npm test -- settings
```

Expected: module not found.

- [ ] **Step 3: Implement `src/models/settings.ts`**

```ts
import { getDb } from "../lib/db";

export function get(key: string): string | null {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function set(key: string, value: string): void {
  getDb()
    .prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `)
    .run(key, value);
}

export function getAll(): Record<string, string> {
  const rows = getDb().prepare("SELECT key, value FROM settings").all() as Array<{ key: string; value: string }>;
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function getNumber(key: string): number {
  const v = get(key);
  if (v === null) throw new Error(`settings.getNumber: missing key "${key}"`);
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`settings.getNumber: "${key}" not numeric ("${v}")`);
  return n;
}

export function getBool(key: string): boolean {
  return get(key) === "true";
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
npm test -- settings
```

- [ ] **Step 5: Commit**

```bash
git add src/models/settings.ts tests/models/settings.test.ts
git commit -m "feat(models): settings key/value model"
```

---

## Task 7: Employees model (minimal — auth-only surface) with TDD

**Files:**
- Create: `src/models/employees.ts`
- Test: `tests/models/employees.test.ts`

Plan 1 needs only: `count`, `findByUsername`, `findById`, `create` (for setup), `updatePassword`. Plan 2 will add the rest.

- [ ] **Step 1: Write failing tests `tests/models/employees.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { unlinkSync, existsSync } from "fs";
import { closeDb, runMigrations } from "../../src/lib/db";
import * as Employees from "../../src/models/employees";

const TEST_DB = "./data/test-employees.db";
process.env.DB_PATH = TEST_DB;

beforeEach(() => {
  closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  runMigrations();
});

afterAll(() => {
  closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

describe("Employees model (auth surface)", () => {
  it("count() returns 0 on empty DB", () => {
    expect(Employees.count()).toBe(0);
  });

  it("create() inserts and returns the row", () => {
    const e = Employees.create({
      full_name: "Sam",
      username: "sam",
      password_hash: "hash",
      role: "owner",
    });
    expect(e.id).toBeGreaterThan(0);
    expect(e.full_name).toBe("Sam");
    expect(e.role).toBe("owner");
    expect(Employees.count()).toBe(1);
  });

  it("findByUsername() returns the row or null", () => {
    Employees.create({ full_name: "Sam", username: "sam", password_hash: "h", role: "owner" });
    const found = Employees.findByUsername("sam");
    expect(found?.full_name).toBe("Sam");
    expect(Employees.findByUsername("nobody")).toBeNull();
  });

  it("findById() returns the row or null", () => {
    const e = Employees.create({ full_name: "Sam", username: "sam", password_hash: "h", role: "owner" });
    expect(Employees.findById(e.id)?.full_name).toBe("Sam");
    expect(Employees.findById(99999)).toBeNull();
  });

  it("findByUsername ignores inactive rows", () => {
    const e = Employees.create({ full_name: "Sam", username: "sam", password_hash: "h", role: "owner" });
    Employees.setActive(e.id, false);
    expect(Employees.findByUsername("sam")).toBeNull();
  });

  it("updatePassword() updates the hash", () => {
    const e = Employees.create({ full_name: "Sam", username: "sam", password_hash: "old", role: "owner" });
    Employees.updatePassword(e.id, "new");
    expect(Employees.findById(e.id)?.password_hash).toBe("new");
  });
});
```

- [ ] **Step 2: Run tests, verify failure**

```bash
npm test -- employees
```

- [ ] **Step 3: Implement `src/models/employees.ts`**

```ts
import { getDb } from "../lib/db";

export type Employee = {
  id: number;
  full_name: string;
  phone: string | null;
  username: string | null;
  password_hash: string | null;
  role: "owner" | "employee";
  is_active: number;
  onboarding_status: "incomplete" | "complete";
  basic_salary: number;
  created_at: string;
  updated_at: string;
  // remaining HR columns left as `any` until Plan 2 surfaces them
};

export type CreateInput = {
  full_name: string;
  username?: string | null;
  password_hash?: string | null;
  role: "owner" | "employee";
  phone?: string | null;
};

export function count(): number {
  const row = getDb().prepare("SELECT COUNT(*) AS c FROM employees").get() as { c: number };
  return row.c;
}

export function create(input: CreateInput): Employee {
  const result = getDb()
    .prepare(`
      INSERT INTO employees (full_name, phone, username, password_hash, role)
      VALUES (@full_name, @phone, @username, @password_hash, @role)
    `)
    .run({
      full_name: input.full_name,
      phone: input.phone ?? null,
      username: input.username ?? null,
      password_hash: input.password_hash ?? null,
      role: input.role,
    });
  return findById(Number(result.lastInsertRowid))!;
}

export function findByUsername(username: string): Employee | null {
  const row = getDb()
    .prepare("SELECT * FROM employees WHERE username = ? AND is_active = 1")
    .get(username) as Employee | undefined;
  return row ?? null;
}

export function findById(id: number): Employee | null {
  const row = getDb().prepare("SELECT * FROM employees WHERE id = ?").get(id) as Employee | undefined;
  return row ?? null;
}

export function updatePassword(id: number, password_hash: string): void {
  getDb()
    .prepare("UPDATE employees SET password_hash = ?, updated_at = datetime('now') WHERE id = ?")
    .run(password_hash, id);
}

export function setActive(id: number, active: boolean): void {
  getDb()
    .prepare("UPDATE employees SET is_active = ?, updated_at = datetime('now') WHERE id = ?")
    .run(active ? 1 : 0, id);
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
npm test -- employees
```

- [ ] **Step 5: Commit**

```bash
git add src/models/employees.ts tests/models/employees.test.ts
git commit -m "feat(models): employees auth-surface (count, find, create, password)"
```

---

## Task 8: Audit log helper

**Files:**
- Create: `src/lib/audit.ts`
- Test: `tests/audit.test.ts`

- [ ] **Step 1: Write failing test `tests/audit.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { unlinkSync, existsSync } from "fs";
import { closeDb, runMigrations, getDb } from "../src/lib/db";
import { writeAudit } from "../src/lib/audit";

const TEST_DB = "./data/test-audit.db";
process.env.DB_PATH = TEST_DB;

beforeEach(() => {
  closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  runMigrations();
});

afterAll(() => {
  closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

describe("writeAudit", () => {
  it("inserts a row", () => {
    writeAudit({ actor_id: null, action: "login", entity: "session", entity_id: null });
    const rows = getDb().prepare("SELECT * FROM audit_log").all() as any[];
    expect(rows.length).toBe(1);
    expect(rows[0].action).toBe("login");
    expect(rows[0].entity).toBe("session");
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
npm test -- audit
```

- [ ] **Step 3: Implement `src/lib/audit.ts`**

```ts
import { getDb } from "./db";

export type AuditEntry = {
  actor_id: number | null;
  action: string;
  entity: string;
  entity_id: number | null;
};

export function writeAudit(entry: AuditEntry): void {
  getDb()
    .prepare(`
      INSERT INTO audit_log (actor_id, action, entity, entity_id)
      VALUES (@actor_id, @action, @entity, @entity_id)
    `)
    .run(entry);
}
```

- [ ] **Step 4: Run, expect pass**

```bash
npm test -- audit
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/audit.ts tests/audit.test.ts
git commit -m "feat(lib): audit log writer"
```

---

## Task 9: Session config + CSRF helpers

**Files:**
- Create: `src/lib/session.ts`, `src/lib/csrf.ts`, `src/lib/flash.ts`

No tests for these — they're framework glue. They get integration-tested in Task 13.

- [ ] **Step 1: Implement `src/lib/session.ts`**

```ts
import session from "express-session";
import connectSqlite3 from "connect-sqlite3";
import { resolve } from "path";

const SQLiteStore = connectSqlite3(session);

export function sessionMiddleware() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");

  return session({
    store: new SQLiteStore({
      db: "sessions.db",
      dir: resolve(process.cwd(), "data"),
    }) as session.Store,
    secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
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

- [ ] **Step 2: Implement `src/lib/csrf.ts`**

```ts
import { randomBytes } from "crypto";
import type { Request, Response, NextFunction } from "express";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

export function ensureToken(req: Request): string {
  if (!req.session.csrfToken) {
    req.session.csrfToken = randomBytes(32).toString("hex");
  }
  return req.session.csrfToken;
}

export function csrfMiddleware(req: Request, res: Response, next: NextFunction) {
  ensureToken(req);
  res.locals.csrfToken = req.session.csrfToken;
  if (SAFE.has(req.method)) return next();

  const submitted = (req.body && req.body._csrf) || req.header("x-csrf-token");
  if (!submitted || submitted !== req.session.csrfToken) {
    return res.status(403).render("errors/403", { message: "Invalid CSRF token" });
  }
  next();
}
```

- [ ] **Step 3: Implement `src/lib/flash.ts`**

```ts
import type { Request, Response, NextFunction } from "express";

export type FlashType = "success" | "error" | "info";

export function pushFlash(req: Request, type: FlashType, text: string) {
  if (!req.session.flash) req.session.flash = [];
  req.session.flash.push({ type, text });
}

export function flashMiddleware(req: Request, res: Response, next: NextFunction) {
  res.locals.flash = req.session.flash ?? [];
  req.session.flash = [];
  next();
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/session.ts src/lib/csrf.ts src/lib/flash.ts
git commit -m "feat(lib): session + CSRF + flash helpers"
```

---

## Task 10: Middlewares (requireAuth, requireOwner, requireSetup, locals, errorHandler)

**Files:**
- Create: `src/middleware/requireAuth.ts`, `src/middleware/requireOwner.ts`, `src/middleware/requireSetup.ts`, `src/middleware/locals.ts`, `src/middleware/errorHandler.ts`

- [ ] **Step 1: Implement `src/middleware/requireAuth.ts`**

```ts
import type { Request, Response, NextFunction } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.employeeId) {
    return res.redirect("/login");
  }
  next();
}
```

- [ ] **Step 2: Implement `src/middleware/requireOwner.ts`**

```ts
import type { Request, Response, NextFunction } from "express";

export function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (req.session.role !== "owner") {
    return res.status(403).render("errors/403", { message: "Owner access required" });
  }
  next();
}
```

- [ ] **Step 3: Implement `src/middleware/requireSetup.ts`**

```ts
import type { Request, Response, NextFunction } from "express";
import * as Employees from "../models/employees";

export function requireSetup(req: Request, res: Response, next: NextFunction) {
  // Allow /setup itself and static assets
  if (req.path.startsWith("/setup") || req.path.startsWith("/css") || req.path.startsWith("/js")) {
    return next();
  }
  if (Employees.count() === 0) {
    return res.redirect("/setup");
  }
  next();
}
```

- [ ] **Step 4: Implement `src/middleware/locals.ts`**

```ts
import type { Request, Response, NextFunction } from "express";
import * as Settings from "../models/settings";
import * as Employees from "../models/employees";

export function localsMiddleware(req: Request, res: Response, next: NextFunction) {
  res.locals.shopName = Settings.get("shop_name") ?? "Coffee Shop";
  res.locals.currentUser = null;
  res.locals.currentRole = null;
  if (req.session.employeeId) {
    const u = Employees.findById(req.session.employeeId);
    if (u) {
      res.locals.currentUser = u;
      res.locals.currentRole = u.role;
    }
  }
  next();
}
```

- [ ] **Step 5: Implement `src/middleware/errorHandler.ts`**

```ts
import type { Request, Response, NextFunction } from "express";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).render("errors/404");
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  console.error(err);
  res.status(500).render("errors/500", { message: process.env.NODE_ENV === "development" ? err.message : "Server error" });
}
```

- [ ] **Step 6: Commit**

```bash
git add src/middleware/
git commit -m "feat(middleware): auth, owner, setup, locals, error handlers"
```

---

## Task 11: EJS layout + partials + error pages

**Files:**
- Create: `src/views/layouts/main.ejs`, `src/views/partials/head.ejs`, `src/views/partials/sidebar.ejs`, `src/views/partials/flash.ejs`, `src/views/errors/404.ejs`, `src/views/errors/403.ejs`, `src/views/errors/500.ejs`

EJS does not have native layouts — we use an include-from-the-bottom pattern: every page renders its own `<%- include('layouts/main', { body: ... }) %>` via a small helper, or just renders a page that itself includes head + sidebar + flash + content. Simplest pattern: each page is a self-contained template that includes partials. No layout indirection.

- [ ] **Step 1: Create `src/views/partials/head.ejs`**

```ejs
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title><%= title || shopName %></title>
  <link rel="stylesheet" href="/css/app.css" />
  <script src="/js/htmx.min.js" defer></script>
</head>
```

- [ ] **Step 2: Create `src/views/partials/flash.ejs`**

```ejs
<% if (flash && flash.length) { %>
  <div class="space-y-2 mb-4">
    <% flash.forEach(f => { %>
      <div class="px-4 py-2 rounded
        <%= f.type === 'success' ? 'bg-green-100 text-green-800' : '' %>
        <%= f.type === 'error'   ? 'bg-red-100 text-red-800'   : '' %>
        <%= f.type === 'info'    ? 'bg-blue-100 text-blue-800' : '' %>">
        <%= f.text %>
      </div>
    <% }) %>
  </div>
<% } %>
```

- [ ] **Step 3: Create `src/views/partials/sidebar.ejs`**

```ejs
<aside class="w-56 bg-slate-900 text-slate-100 min-h-screen p-4 relative">
  <h1 class="text-lg font-semibold mb-6"><%= shopName %></h1>
  <nav class="space-y-1 text-sm">
    <a href="/" class="block px-2 py-1 rounded hover:bg-slate-800">Dashboard</a>
    <% if (currentRole === 'owner') { %>
      <a href="/sales" class="block px-2 py-1 rounded hover:bg-slate-800">Sales</a>
      <a href="/menu" class="block px-2 py-1 rounded hover:bg-slate-800">Menu</a>
      <a href="/employees" class="block px-2 py-1 rounded hover:bg-slate-800">Employees</a>
      <a href="/purchases" class="block px-2 py-1 rounded hover:bg-slate-800">Purchases</a>
      <a href="/petty-cash" class="block px-2 py-1 rounded hover:bg-slate-800">Petty Cash</a>
      <a href="/payroll" class="block px-2 py-1 rounded hover:bg-slate-800">Payroll</a>
      <a href="/reports" class="block px-2 py-1 rounded hover:bg-slate-800">Reports</a>
      <a href="/settings" class="block px-2 py-1 rounded hover:bg-slate-800">Settings</a>
    <% } else { %>
      <a href="/sales/new" class="block px-2 py-1 rounded hover:bg-slate-800">Start new shift</a>
      <a href="/sales" class="block px-2 py-1 rounded hover:bg-slate-800">My past shifts</a>
    <% } %>
  </nav>
  <div class="absolute bottom-4 left-4 right-4 text-xs text-slate-400">
    <% if (currentUser) { %>
      <div class="mb-2">Signed in as <strong class="text-slate-200"><%= currentUser.full_name %></strong></div>
      <a href="/account" class="hover:text-slate-200">Account</a>
      <form action="/logout" method="POST" class="inline">
        <input type="hidden" name="_csrf" value="<%= csrfToken %>" />
        <button class="ml-2 hover:text-slate-200">Logout</button>
      </form>
    <% } %>
  </div>
</aside>
```

- [ ] **Step 4: Create `src/views/errors/404.ejs`**

```ejs
<%- include('../partials/head', { title: 'Not found', shopName }) %>
<body class="bg-slate-50 text-slate-900">
  <main class="max-w-lg mx-auto py-20 text-center">
    <h1 class="text-3xl font-semibold">404</h1>
    <p class="mt-2 text-slate-600">Page not found.</p>
    <a href="/" class="mt-6 inline-block text-blue-600 hover:underline">Go home</a>
  </main>
</body>
</html>
```

- [ ] **Step 5: Create `src/views/errors/403.ejs`**

```ejs
<%- include('../partials/head', { title: 'Forbidden', shopName }) %>
<body class="bg-slate-50 text-slate-900">
  <main class="max-w-lg mx-auto py-20 text-center">
    <h1 class="text-3xl font-semibold">403</h1>
    <p class="mt-2 text-slate-600"><%= typeof message !== 'undefined' ? message : 'Forbidden.' %></p>
    <a href="/" class="mt-6 inline-block text-blue-600 hover:underline">Go home</a>
  </main>
</body>
</html>
```

- [ ] **Step 6: Create `src/views/errors/500.ejs`**

```ejs
<%- include('../partials/head', { title: 'Server error', shopName }) %>
<body class="bg-slate-50 text-slate-900">
  <main class="max-w-lg mx-auto py-20 text-center">
    <h1 class="text-3xl font-semibold">500</h1>
    <p class="mt-2 text-slate-600"><%= typeof message !== 'undefined' ? message : 'Something went wrong.' %></p>
  </main>
</body>
</html>
```

- [ ] **Step 7: Commit**

```bash
git add src/views/partials/ src/views/errors/
git commit -m "feat(views): base partials and error pages"
```

---

## Task 12: Wire express app and routes

**Files:**
- Modify: `src/app.ts`
- Create: `src/routes/index.ts`

The controller files referenced here are written in subsequent tasks.

- [ ] **Step 1: Replace `src/app.ts`**

```ts
import express from "express";
import { resolve } from "path";
import { sessionMiddleware } from "./lib/session";
import { csrfMiddleware } from "./lib/csrf";
import { flashMiddleware } from "./lib/flash";
import { localsMiddleware } from "./middleware/locals";
import { requireSetup } from "./middleware/requireSetup";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler";
import { router } from "./routes";

export const app = express();

app.set("view engine", "ejs");
app.set("views", resolve(__dirname, "views"));

app.use("/css", express.static(resolve(process.cwd(), "public/css")));
app.use("/js", express.static(resolve(process.cwd(), "public/js")));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(sessionMiddleware());
app.use(localsMiddleware);
app.use(flashMiddleware);
app.use(csrfMiddleware);
app.use(requireSetup);

app.use(router);

app.use(notFoundHandler);
app.use(errorHandler);
```

- [ ] **Step 2: Create `src/routes/index.ts`** (placeholder routes — controllers come next)

```ts
import { Router } from "express";
import * as Auth from "../controllers/authController";
import * as Setup from "../controllers/setupController";
import * as Dashboard from "../controllers/dashboardController";
import * as Settings from "../controllers/settingsController";
import * as Account from "../controllers/accountController";
import { requireAuth } from "../middleware/requireAuth";
import { requireOwner } from "../middleware/requireOwner";

export const router = Router();

// Setup (only reachable when employees table is empty — enforced by requireSetup middleware)
router.get("/setup", Setup.showForm);
router.post("/setup", Setup.submit);

// Auth
router.get("/login", Auth.showLogin);
router.post("/login", Auth.submitLogin);
router.post("/logout", Auth.logout);

// Dashboard
router.get("/", requireAuth, Dashboard.show);

// Account (any logged-in user)
router.get("/account", requireAuth, Account.show);
router.post("/account/password", requireAuth, Account.changePassword);

// Settings (owner only)
router.get("/settings", requireAuth, requireOwner, Settings.show);
router.post("/settings", requireAuth, requireOwner, Settings.update);
```

- [ ] **Step 3: Commit**

```bash
git add src/app.ts src/routes/index.ts
git commit -m "feat(app): wire express middleware + route map"
```

(Build will fail until controllers exist — that's expected. Next tasks add them.)

---

## Task 13: Setup controller + view + integration test

**Files:**
- Create: `src/controllers/setupController.ts`, `src/views/setup.ejs`
- Test: `tests/integration/setup.test.ts`

- [ ] **Step 1: Write failing integration test `tests/integration/setup.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { unlinkSync, existsSync } from "fs";
import { closeDb, runMigrations } from "../../src/lib/db";

const TEST_DB = "./data/test-setup.db";
process.env.DB_PATH = TEST_DB;
process.env.SESSION_SECRET = "test-secret";

async function freshApp() {
  closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  // Force re-import after env change
  const dbMod = await import("../../src/lib/db");
  dbMod.runMigrations();
  const { app } = await import("../../src/app");
  return app;
}

beforeEach(() => {
  closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  runMigrations();
});

afterAll(() => {
  closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

describe("First-run setup", () => {
  it("redirects any request to /setup when no employees exist", async () => {
    const { app } = await import("../../src/app");
    const res = await request(app).get("/").expect(302);
    expect(res.headers.location).toBe("/setup");
  });

  it("shows the setup form on GET /setup", async () => {
    const { app } = await import("../../src/app");
    const res = await request(app).get("/setup").expect(200);
    expect(res.text).toContain("Create owner account");
  });

  it("creates owner on POST /setup and redirects to /", async () => {
    const { app } = await import("../../src/app");
    const agent = request.agent(app);
    // Fetch GET first to obtain a session and CSRF token via cookies
    const getRes = await agent.get("/setup");
    const csrf = /name="_csrf" value="([^"]+)"/.exec(getRes.text)?.[1];
    expect(csrf).toBeDefined();

    const res = await agent.post("/setup").type("form").send({
      _csrf: csrf,
      full_name: "Sam",
      username: "sam",
      password: "secret123",
    });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/");
  });

  it("rejects POST /setup if employees already exist", async () => {
    const { app } = await import("../../src/app");
    const agent = request.agent(app);
    const getRes = await agent.get("/setup");
    const csrf = /name="_csrf" value="([^"]+)"/.exec(getRes.text)?.[1]!;
    await agent.post("/setup").type("form").send({ _csrf: csrf, full_name: "Sam", username: "sam", password: "secret123" });

    const getRes2 = await agent.get("/setup");
    // After setup, requireSetup no longer redirects to /setup — root works.
    // The /setup route itself should refuse re-creation. We'll assert it returns 302 to / or shows a "disabled" state.
    expect(getRes2.status).toBe(302);
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
npm test -- setup
```

- [ ] **Step 3: Implement `src/views/setup.ejs`**

```ejs
<%- include('partials/head', { title: 'Set up owner account', shopName }) %>
<body class="bg-slate-50 min-h-screen flex items-center justify-center">
  <main class="bg-white rounded-lg shadow p-8 w-full max-w-md">
    <h1 class="text-xl font-semibold mb-1">Create owner account</h1>
    <p class="text-sm text-slate-600 mb-6">This is the first account — it will have full access.</p>
    <%- include('partials/flash', { flash }) %>
    <form method="POST" action="/setup" class="space-y-4">
      <input type="hidden" name="_csrf" value="<%= csrfToken %>" />
      <label class="block">
        <span class="text-sm text-slate-700">Full name</span>
        <input name="full_name" required class="mt-1 w-full border rounded px-3 py-2" />
      </label>
      <label class="block">
        <span class="text-sm text-slate-700">Username</span>
        <input name="username" required class="mt-1 w-full border rounded px-3 py-2" />
      </label>
      <label class="block">
        <span class="text-sm text-slate-700">Password</span>
        <input name="password" type="password" required minlength="6" class="mt-1 w-full border rounded px-3 py-2" />
      </label>
      <button class="w-full bg-slate-900 text-white py-2 rounded hover:bg-slate-800">Create account</button>
    </form>
  </main>
</body>
</html>
```

- [ ] **Step 4: Implement `src/controllers/setupController.ts`**

```ts
import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import * as Employees from "../models/employees";
import { writeAudit } from "../lib/audit";
import { pushFlash } from "../lib/flash";

export function showForm(req: Request, res: Response) {
  if (Employees.count() > 0) return res.redirect("/");
  res.render("setup");
}

export async function submit(req: Request, res: Response) {
  if (Employees.count() > 0) return res.redirect("/");
  const { full_name, username, password } = req.body as Record<string, string>;
  if (!full_name || !username || !password || password.length < 6) {
    pushFlash(req, "error", "All fields required, password ≥ 6 chars");
    return res.redirect("/setup");
  }
  const hash = await bcrypt.hash(password, 12);
  const owner = Employees.create({
    full_name,
    username,
    password_hash: hash,
    role: "owner",
  });
  writeAudit({ actor_id: owner.id, action: "setup_owner", entity: "employees", entity_id: owner.id });
  req.session.employeeId = owner.id;
  req.session.role = "owner";
  pushFlash(req, "success", "Owner account created");
  res.redirect("/");
}
```

- [ ] **Step 5: Run integration tests, verify pass**

```bash
npm test -- setup
```

- [ ] **Step 6: Commit**

```bash
git add src/controllers/setupController.ts src/views/setup.ejs tests/integration/setup.test.ts
git commit -m "feat(setup): first-run owner setup flow"
```

---

## Task 14: Auth controller (login/logout) + view + integration tests

**Files:**
- Create: `src/controllers/authController.ts`, `src/views/login.ejs`
- Test: `tests/integration/auth.test.ts`

- [ ] **Step 1: Write failing integration test `tests/integration/auth.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { unlinkSync, existsSync } from "fs";
import { closeDb, runMigrations } from "../../src/lib/db";
import * as Employees from "../../src/models/employees";

const TEST_DB = "./data/test-auth.db";
process.env.DB_PATH = TEST_DB;
process.env.SESSION_SECRET = "test-secret";

async function seedOwner() {
  const hash = await bcrypt.hash("secret123", 12);
  Employees.create({ full_name: "Sam", username: "sam", password_hash: hash, role: "owner" });
}

beforeEach(async () => {
  closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  runMigrations();
  await seedOwner();
});

afterAll(() => {
  closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

async function getCsrf(agent: request.SuperAgentTest, path: string): Promise<string> {
  const res = await agent.get(path);
  const m = /name="_csrf" value="([^"]+)"/.exec(res.text);
  if (!m) throw new Error("no csrf token on " + path);
  return m[1];
}

describe("Auth", () => {
  it("GET /login renders the form", async () => {
    const { app } = await import("../../src/app");
    const res = await request(app).get("/login").expect(200);
    expect(res.text).toContain("Sign in");
  });

  it("rejects invalid credentials", async () => {
    const { app } = await import("../../src/app");
    const agent = request.agent(app);
    const csrf = await getCsrf(agent, "/login");
    const res = await agent.post("/login").type("form").send({ _csrf: csrf, username: "sam", password: "wrong" });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/login");
  });

  it("accepts valid credentials and redirects to /", async () => {
    const { app } = await import("../../src/app");
    const agent = request.agent(app);
    const csrf = await getCsrf(agent, "/login");
    const res = await agent.post("/login").type("form").send({ _csrf: csrf, username: "sam", password: "secret123" });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/");

    const home = await agent.get("/");
    expect(home.status).toBe(200);
    expect(home.text).toContain("Dashboard");
  });

  it("requireAuth redirects unauthenticated user to /login", async () => {
    const { app } = await import("../../src/app");
    const res = await request(app).get("/").expect(302);
    expect(res.headers.location).toBe("/login");
  });

  it("logout clears the session", async () => {
    const { app } = await import("../../src/app");
    const agent = request.agent(app);
    let csrf = await getCsrf(agent, "/login");
    await agent.post("/login").type("form").send({ _csrf: csrf, username: "sam", password: "secret123" });
    csrf = await getCsrf(agent, "/");
    await agent.post("/logout").type("form").send({ _csrf: csrf });
    const res = await agent.get("/");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/login");
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
npm test -- auth
```

- [ ] **Step 3: Implement `src/views/login.ejs`**

```ejs
<%- include('partials/head', { title: 'Sign in', shopName }) %>
<body class="bg-slate-50 min-h-screen flex items-center justify-center">
  <main class="bg-white rounded-lg shadow p-8 w-full max-w-sm">
    <h1 class="text-xl font-semibold mb-6">Sign in to <%= shopName %></h1>
    <%- include('partials/flash', { flash }) %>
    <form method="POST" action="/login" class="space-y-4">
      <input type="hidden" name="_csrf" value="<%= csrfToken %>" />
      <label class="block">
        <span class="text-sm text-slate-700">Username</span>
        <input name="username" required autofocus class="mt-1 w-full border rounded px-3 py-2" />
      </label>
      <label class="block">
        <span class="text-sm text-slate-700">Password</span>
        <input name="password" type="password" required class="mt-1 w-full border rounded px-3 py-2" />
      </label>
      <button class="w-full bg-slate-900 text-white py-2 rounded hover:bg-slate-800">Sign in</button>
    </form>
  </main>
</body>
</html>
```

- [ ] **Step 4: Implement `src/controllers/authController.ts`**

```ts
import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import * as Employees from "../models/employees";
import { writeAudit } from "../lib/audit";
import { pushFlash } from "../lib/flash";

export function showLogin(req: Request, res: Response) {
  if (req.session.employeeId) return res.redirect("/");
  res.render("login");
}

export async function submitLogin(req: Request, res: Response) {
  const { username, password } = req.body as Record<string, string>;
  const user = username ? Employees.findByUsername(username) : null;
  if (!user || !user.password_hash) {
    pushFlash(req, "error", "Invalid username or password");
    return res.redirect("/login");
  }
  const ok = await bcrypt.compare(password ?? "", user.password_hash);
  if (!ok) {
    pushFlash(req, "error", "Invalid username or password");
    return res.redirect("/login");
  }
  req.session.employeeId = user.id;
  req.session.role = user.role;
  writeAudit({ actor_id: user.id, action: "login", entity: "session", entity_id: null });
  res.redirect("/");
}

export function logout(req: Request, res: Response) {
  const id = req.session.employeeId ?? null;
  req.session.destroy(() => {
    if (id) writeAudit({ actor_id: id, action: "logout", entity: "session", entity_id: null });
    res.redirect("/login");
  });
}
```

- [ ] **Step 5: Run tests, expect pass**

```bash
npm test -- auth
```

- [ ] **Step 6: Commit**

```bash
git add src/controllers/authController.ts src/views/login.ejs tests/integration/auth.test.ts
git commit -m "feat(auth): login/logout flow with bcrypt + sessions"
```

---

## Task 15: Dashboard controller + view (skeleton)

**Files:**
- Create: `src/controllers/dashboardController.ts`, `src/views/dashboard.ejs`

The dashboard cards (today's sales, etc.) come in Plan 6 — for now, render a placeholder so the app is navigable end-to-end.

- [ ] **Step 1: Implement `src/views/dashboard.ejs`**

```ejs
<%- include('partials/head', { title: 'Dashboard', shopName }) %>
<body class="bg-slate-50 min-h-screen flex">
  <%- include('partials/sidebar', { shopName, currentRole, currentUser, csrfToken }) %>
  <main class="flex-1 p-8">
    <h1 class="text-2xl font-semibold mb-6">Dashboard</h1>
    <%- include('partials/flash', { flash }) %>
    <% if (currentRole === 'owner') { %>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="bg-white rounded-lg shadow p-6">
          <div class="text-sm text-slate-500">Today's sales</div>
          <div class="text-2xl font-semibold mt-1 text-slate-400">—</div>
          <div class="text-xs text-slate-400 mt-2">Coming in Sales module</div>
        </div>
        <div class="bg-white rounded-lg shadow p-6">
          <div class="text-sm text-slate-500">Purchases today</div>
          <div class="text-2xl font-semibold mt-1 text-slate-400">—</div>
        </div>
        <div class="bg-white rounded-lg shadow p-6">
          <div class="text-sm text-slate-500">Petty cash spent</div>
          <div class="text-2xl font-semibold mt-1 text-slate-400">—</div>
        </div>
      </div>
    <% } else { %>
      <div class="space-y-3 max-w-sm">
        <a href="/sales/new" class="block bg-slate-900 text-white rounded px-4 py-3 text-center hover:bg-slate-800">Start new shift</a>
        <a href="/sales" class="block bg-white border rounded px-4 py-3 text-center hover:bg-slate-50">My past shifts</a>
      </div>
    <% } %>
  </main>
</body>
</html>
```

- [ ] **Step 2: Implement `src/controllers/dashboardController.ts`**

```ts
import type { Request, Response } from "express";

export function show(_req: Request, res: Response) {
  res.render("dashboard");
}
```

- [ ] **Step 3: Manual check**

```bash
npm run css:build && npm run dev
```

Open `http://localhost:3000`, log in as the owner from Task 13. Verify dashboard renders, sidebar shows owner links. Stop dev.

- [ ] **Step 4: Commit**

```bash
git add src/controllers/dashboardController.ts src/views/dashboard.ejs
git commit -m "feat(dashboard): skeleton dashboard with role-aware shell"
```

---

## Task 16: Settings controller + view

**Files:**
- Create: `src/controllers/settingsController.ts`, `src/views/settings/index.ejs`

- [ ] **Step 1: Implement `src/views/settings/index.ejs`**

```ejs
<%- include('../partials/head', { title: 'Settings', shopName }) %>
<body class="bg-slate-50 min-h-screen flex">
  <%- include('../partials/sidebar', { shopName, currentRole, currentUser, csrfToken }) %>
  <main class="flex-1 p-8 max-w-3xl">
    <h1 class="text-2xl font-semibold mb-6">Settings</h1>
    <%- include('../partials/flash', { flash }) %>
    <form method="POST" action="/settings" class="space-y-8 bg-white rounded-lg shadow p-6">
      <input type="hidden" name="_csrf" value="<%= csrfToken %>" />

      <section>
        <h2 class="text-lg font-medium mb-3">Shop</h2>
        <% ['shop_name','shop_address','shop_phone'].forEach(k => { %>
          <label class="block mb-3">
            <span class="text-sm text-slate-700"><%= k.replace('_',' ') %></span>
            <input name="<%= k %>" value="<%= settings[k] || '' %>" class="mt-1 w-full border rounded px-3 py-2" />
          </label>
        <% }) %>
      </section>

      <section>
        <h2 class="text-lg font-medium mb-3">Money</h2>
        <div class="grid grid-cols-2 gap-4">
          <% ['currency_code','currency_symbol','decimal_places','thousand_separator','decimal_separator'].forEach(k => { %>
            <label class="block">
              <span class="text-sm text-slate-700"><%= k.replace(/_/g,' ') %></span>
              <input name="<%= k %>" value="<%= settings[k] || '' %>" class="mt-1 w-full border rounded px-3 py-2" />
            </label>
          <% }) %>
        </div>
      </section>

      <section>
        <h2 class="text-lg font-medium mb-3">Payroll defaults</h2>
        <div class="grid grid-cols-2 gap-4">
          <label class="block">
            <span class="text-sm text-slate-700">Employer pension %</span>
            <input name="pension_employer_default_pct" value="<%= settings.pension_employer_default_pct %>" class="mt-1 w-full border rounded px-3 py-2" />
          </label>
          <label class="block">
            <span class="text-sm text-slate-700">Employee pension %</span>
            <input name="pension_employee_default_pct" value="<%= settings.pension_employee_default_pct %>" class="mt-1 w-full border rounded px-3 py-2" />
          </label>
          <label class="block">
            <span class="text-sm text-slate-700">Standard days / month</span>
            <input name="standard_days_in_month" value="<%= settings.standard_days_in_month %>" class="mt-1 w-full border rounded px-3 py-2" />
          </label>
          <label class="block flex items-center gap-2 mt-6">
            <input type="checkbox" name="require_complete_hr_before_payroll" value="true" <%= settings.require_complete_hr_before_payroll === 'true' ? 'checked' : '' %> />
            <span class="text-sm text-slate-700">Require complete HR record before payroll</span>
          </label>
        </div>
      </section>

      <section>
        <h2 class="text-lg font-medium mb-3">System</h2>
        <div class="grid grid-cols-2 gap-4">
          <label class="block">
            <span class="text-sm text-slate-700">Business-day cutoff (HH:MM)</span>
            <input name="business_day_cutoff" value="<%= settings.business_day_cutoff %>" class="mt-1 w-full border rounded px-3 py-2" />
          </label>
          <label class="block">
            <span class="text-sm text-slate-700">Timezone</span>
            <input name="timezone" value="<%= settings.timezone %>" class="mt-1 w-full border rounded px-3 py-2" />
          </label>
        </div>
      </section>

      <button class="bg-slate-900 text-white px-4 py-2 rounded hover:bg-slate-800">Save</button>
    </form>
  </main>
</body>
</html>
```

- [ ] **Step 2: Implement `src/controllers/settingsController.ts`**

```ts
import type { Request, Response } from "express";
import * as Settings from "../models/settings";
import { writeAudit } from "../lib/audit";
import { pushFlash } from "../lib/flash";

const ALLOWED_KEYS = [
  "shop_name", "shop_address", "shop_phone",
  "currency_code", "currency_symbol", "decimal_places", "thousand_separator", "decimal_separator",
  "pension_employer_default_pct", "pension_employee_default_pct", "standard_days_in_month",
  "business_day_cutoff", "timezone",
] as const;

export function show(_req: Request, res: Response) {
  res.render("settings/index", { settings: Settings.getAll() });
}

export function update(req: Request, res: Response) {
  for (const key of ALLOWED_KEYS) {
    if (typeof req.body[key] === "string") Settings.set(key, req.body[key]);
  }
  // Checkbox: present means "true", absent means "false"
  Settings.set("require_complete_hr_before_payroll", req.body.require_complete_hr_before_payroll === "true" ? "true" : "false");
  writeAudit({ actor_id: req.session.employeeId ?? null, action: "update_settings", entity: "settings", entity_id: null });
  pushFlash(req, "success", "Settings saved");
  res.redirect("/settings");
}
```

- [ ] **Step 3: Manual check**

```bash
npm run dev
```

Log in as owner → click "Settings" → change shop_name → save → verify it reflects in the sidebar header. Stop dev.

- [ ] **Step 4: Commit**

```bash
git add src/controllers/settingsController.ts src/views/settings/
git commit -m "feat(settings): editable settings page with allowlisted keys"
```

---

## Task 17: Account page (change own password)

**Files:**
- Create: `src/controllers/accountController.ts`, `src/views/account.ejs`

- [ ] **Step 1: Implement `src/views/account.ejs`**

```ejs
<%- include('partials/head', { title: 'My account', shopName }) %>
<body class="bg-slate-50 min-h-screen flex">
  <%- include('partials/sidebar', { shopName, currentRole, currentUser, csrfToken }) %>
  <main class="flex-1 p-8 max-w-lg">
    <h1 class="text-2xl font-semibold mb-6">My account</h1>
    <%- include('partials/flash', { flash }) %>
    <div class="bg-white rounded-lg shadow p-6 mb-6">
      <div class="text-sm text-slate-500">Full name</div>
      <div class="text-lg"><%= currentUser.full_name %></div>
      <div class="text-sm text-slate-500 mt-3">Role</div>
      <div class="text-lg capitalize"><%= currentUser.role %></div>
    </div>

    <form method="POST" action="/account/password" class="bg-white rounded-lg shadow p-6 space-y-4">
      <h2 class="text-lg font-medium">Change password</h2>
      <input type="hidden" name="_csrf" value="<%= csrfToken %>" />
      <label class="block">
        <span class="text-sm text-slate-700">Current password</span>
        <input name="current" type="password" required class="mt-1 w-full border rounded px-3 py-2" />
      </label>
      <label class="block">
        <span class="text-sm text-slate-700">New password (≥ 6 chars)</span>
        <input name="next" type="password" minlength="6" required class="mt-1 w-full border rounded px-3 py-2" />
      </label>
      <button class="bg-slate-900 text-white px-4 py-2 rounded hover:bg-slate-800">Update password</button>
    </form>
  </main>
</body>
</html>
```

- [ ] **Step 2: Implement `src/controllers/accountController.ts`**

```ts
import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import * as Employees from "../models/employees";
import { writeAudit } from "../lib/audit";
import { pushFlash } from "../lib/flash";

export function show(_req: Request, res: Response) {
  res.render("account");
}

export async function changePassword(req: Request, res: Response) {
  const id = req.session.employeeId!;
  const user = Employees.findById(id);
  if (!user || !user.password_hash) {
    pushFlash(req, "error", "Account not found");
    return res.redirect("/account");
  }
  const { current, next } = req.body as Record<string, string>;
  if (!next || next.length < 6) {
    pushFlash(req, "error", "New password must be at least 6 characters");
    return res.redirect("/account");
  }
  const ok = await bcrypt.compare(current ?? "", user.password_hash);
  if (!ok) {
    pushFlash(req, "error", "Current password is incorrect");
    return res.redirect("/account");
  }
  const newHash = await bcrypt.hash(next, 12);
  Employees.updatePassword(id, newHash);
  writeAudit({ actor_id: id, action: "change_own_password", entity: "employees", entity_id: id });
  pushFlash(req, "success", "Password updated");
  res.redirect("/account");
}
```

- [ ] **Step 3: Manual check**

```bash
npm run dev
```

Log in → /account → change password → log out → log in with new password.

- [ ] **Step 4: Commit**

```bash
git add src/controllers/accountController.ts src/views/account.ejs
git commit -m "feat(account): change own password"
```

---

## Task 18: Final integration sweep — full happy path

**Files:**
- Test: `tests/integration/happy-path.test.ts`

End-to-end: fresh DB → setup owner → log out → log back in → visit /settings → update shop_name → log out.

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { unlinkSync, existsSync } from "fs";
import { closeDb, runMigrations } from "../../src/lib/db";

const TEST_DB = "./data/test-happy.db";
process.env.DB_PATH = TEST_DB;
process.env.SESSION_SECRET = "test-secret";

beforeEach(() => {
  closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  runMigrations();
});

afterAll(() => {
  closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

async function csrf(agent: request.SuperAgentTest, path: string): Promise<string> {
  const r = await agent.get(path);
  return /name="_csrf" value="([^"]+)"/.exec(r.text)![1];
}

describe("happy path", () => {
  it("setup → settings update → logout → login → settings reflect", async () => {
    const { app } = await import("../../src/app");
    const agent = request.agent(app);

    // Setup
    let t = await csrf(agent, "/setup");
    await agent.post("/setup").type("form").send({ _csrf: t, full_name: "Sam", username: "sam", password: "secret123" });

    // Settings update
    t = await csrf(agent, "/settings");
    await agent.post("/settings").type("form").send({ _csrf: t, shop_name: "Bunna Café" });

    // Verify reflected in dashboard
    const home = await agent.get("/");
    expect(home.text).toContain("Bunna Café");

    // Logout
    t = await csrf(agent, "/");
    await agent.post("/logout").type("form").send({ _csrf: t });

    // Login again
    const agent2 = request.agent(app);
    t = await csrf(agent2, "/login");
    await agent2.post("/login").type("form").send({ _csrf: t, username: "sam", password: "secret123" });
    const home2 = await agent2.get("/");
    expect(home2.text).toContain("Bunna Café");
  });
});
```

- [ ] **Step 2: Run tests, expect pass**

```bash
npm test
```

All test files should pass.

- [ ] **Step 3: Final manual smoke test**

```bash
rm -rf data
npm run css:build
npm run dev
```

Browse to `http://localhost:3000` → setup form → create owner → land on dashboard. Click Settings → edit shop name → save → see it in sidebar. Click Account → change password → log out → log in with new password. Stop dev.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/happy-path.test.ts
git commit -m "test: end-to-end happy path for foundation"
```

---

## Plan 1 done — what works now

- Project builds, dev runs, prod build works.
- SQLite database schema is complete (all 10 future tables exist, ready for Plans 2–6).
- First-run setup creates the owner.
- Login/logout with bcrypt + persistent sessions.
- Role-aware sidebar (owner gets full nav; employee gets shift shortcuts).
- Empty dashboard skeleton (cards reserved for Plan 6).
- Settings page reads/writes the seeded keys.
- Account page lets any logged-in user change their own password.
- CSRF protection on all state-changing routes.
- Audit log writing on auth and settings events.
- Tests: `money`, `dates`, `audit`, `settings`, `employees` models, plus integration tests for setup, auth, and the happy path.

---

## Plans 2–6 — to be written when Plan 1 lands

Each gets its own file under `docs/superpowers/plans/` and follows the same TDD bite-sized structure.

- **Plan 2 — Employees & HR:** Full employee profile (personal, ID & docs, guarantors, employment). `multer` + `sharp` for uploads. Models: `employees` (full surface), `guarantors`, `attachments`. Onboarding completeness calculator. *Outcome:* owner can fully onboard staff.

- **Plan 3 — Menu & Sales:** `menu_items` CRUD + reorder. `sales_sessions` + `sale_line_items` with live totals via HTMX. Session totals computed on read. Difference is computed, not typed. *Outcome:* cashiers log shifts end-to-end.

- **Plan 4 — Purchases & Petty Cash:** Two structurally-similar inline-add-row resources. Petty cash running balance computed at render time. *Outcome:* owner tracks all expenses.

- **Plan 5 — Payroll:** Payroll-run creation auto-populates entries from active employees + snapshotted rates. Inline editing of days/tax/advance. Calculations stored (immutable after approve). Approval lock. PDF print via `pdfkit` matching the paper sheet. *Outcome:* monthly payroll workflow complete.

- **Plan 6 — Reports, Dashboard cards, Backups & Polish:** Reports tabs across all data with date range + group-by + Excel/PDF export. Wire actual numbers into the dashboard cards. `node-cron` nightly DB backup with retention. "Download backup" button in Settings. *Outcome:* end-to-end product.
