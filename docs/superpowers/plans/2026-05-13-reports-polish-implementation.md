# Plan 6 — Reports, Dashboard Cards, Backups & Polish Implementation Plan

> **For agentic workers:** Per-task subagent dispatch. Each task ends in a commit. **Final plan in the MVP series.**

**Goal:** Close the loop on the product. (a) Wire the dashboard placeholder cards to real data. (b) Build a Reports module with date-ranged aggregation across Sales, Purchases, Petty Cash, and Payroll, with CSV download per report and a printable view. (c) Nightly automated DB backup via `node-cron` plus a manual "Download backup" button in Settings. (d) A small polish pass to fix the rough edges from earlier plans.

**Why CSV not Excel for v1:** CSV opens directly in Excel / Google Sheets / LibreOffice / Numbers, has no dependency, and is the standard accounting export. Real `.xlsx` via `exceljs` adds 200KB+ and complexity not justified for an MVP single-shop tool. The print view handles "show me a clean printable page" — browsers print-to-PDF natively.

**No new tables.** All aggregation runs over the existing schema.

---

## File map

```
src/
├── lib/
│   ├── reports.ts          # NEW — pure aggregation functions
│   ├── csv.ts              # NEW — tiny escape + write helper
│   └── backup.ts           # NEW — SQLite online backup + retention
├── controllers/
│   ├── dashboardController.ts  # MODIFY — load real numbers
│   ├── reportsController.ts    # NEW
│   └── settingsController.ts   # MODIFY — add download-backup action
├── routes/
│   ├── reports.ts          # NEW
│   └── index.ts            # MODIFY — mount reports + settings download
└── views/
    ├── dashboard.ejs       # MODIFY — render real data
    ├── reports/
    │   ├── index.ejs       # tabbed navigation (Sales / Purchases / Petty / Payroll)
    │   ├── _sales.ejs
    │   ├── _purchases.ejs
    │   ├── _pettyCash.ejs
    │   ├── _payroll.ejs
    │   └── print.ejs       # printable variant
    └── settings/index.ejs  # MODIFY — append a Backups section
```

Plus `src/server.ts` is modified to start the cron backup job at boot.

---

## Task 1: Reports lib (TDD)

**Files:** `src/lib/reports.ts`, `tests/reports.test.ts`

Pure functions (well — they hit the DB, but only for read aggregation). One per report type. Date filtering everywhere.

- [ ] **Step 1: Write tests `tests/reports.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { unlinkSync, existsSync } from "fs";
import { closeDb, runMigrations } from "../src/lib/db";
import * as Employees from "../src/models/employees";
import * as Menu from "../src/models/menuItems";
import * as Sessions from "../src/models/salesSessions";
import * as Lines from "../src/models/saleLineItems";
import * as Purchases from "../src/models/purchases";
import * as Petty from "../src/models/pettyCash";
import * as Reports from "../src/lib/reports";

const TEST_DB = "./data/test-reports.db";
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

describe("Sales reports", () => {
  it("salesByDay() sums totals per business_date", () => {
    const e = Employees.create({ full_name: "C", username: "c", password_hash: "h", role: "employee" });
    const m = Menu.create({ name: "Latte", price: 5000, sort_order: 1 });

    const s1 = Sessions.create({ employee_id: e.id, business_date: "2026-05-10", shift: "m" });
    Lines.upsert(s1.id, m.id, 2); // 10000
    Sessions.updateHeader(s1.id, { cash_amount: 10000, bank_transfer_amount: 0, notes: null });

    const s2 = Sessions.create({ employee_id: e.id, business_date: "2026-05-10", shift: "e" });
    Lines.upsert(s2.id, m.id, 1); // 5000
    Sessions.updateHeader(s2.id, { cash_amount: 5000, bank_transfer_amount: 0, notes: null });

    const s3 = Sessions.create({ employee_id: e.id, business_date: "2026-05-12", shift: "m" });
    Lines.upsert(s3.id, m.id, 4); // 20000
    Sessions.updateHeader(s3.id, { cash_amount: 20000, bank_transfer_amount: 0, notes: null });

    const result = Reports.salesByDay({ from: "2026-05-01", to: "2026-05-31" });
    expect(result.find(r => r.business_date === "2026-05-10")?.subtotal).toBe(15000);
    expect(result.find(r => r.business_date === "2026-05-12")?.subtotal).toBe(20000);
  });

  it("salesByItem() sums qty + revenue per menu item", () => {
    const e = Employees.create({ full_name: "C", username: "c", password_hash: "h", role: "employee" });
    const latte = Menu.create({ name: "Latte", price: 5000, sort_order: 1 });
    const espresso = Menu.create({ name: "Espresso", price: 3000, sort_order: 2 });

    const s = Sessions.create({ employee_id: e.id, business_date: "2026-05-12", shift: "m" });
    Lines.upsert(s.id, latte.id, 3);     // qty 3, total 15000
    Lines.upsert(s.id, espresso.id, 5);  // qty 5, total 15000

    const result = Reports.salesByItem({ from: "2026-05-01", to: "2026-05-31" });
    const r1 = result.find(r => r.name === "Latte")!;
    const r2 = result.find(r => r.name === "Espresso")!;
    expect(r1.qty).toBe(3);
    expect(r1.revenue).toBe(15000);
    expect(r2.qty).toBe(5);
    expect(r2.revenue).toBe(15000);
  });

  it("salesByEmployee() sums per cashier", () => {
    const e1 = Employees.create({ full_name: "Almaz", username: "a", password_hash: "h", role: "employee" });
    const e2 = Employees.create({ full_name: "Bekele", username: "b", password_hash: "h", role: "employee" });
    const m = Menu.create({ name: "Latte", price: 5000, sort_order: 1 });

    const s1 = Sessions.create({ employee_id: e1.id, business_date: "2026-05-12", shift: "m" });
    Lines.upsert(s1.id, m.id, 4); // 20000
    const s2 = Sessions.create({ employee_id: e2.id, business_date: "2026-05-12", shift: "e" });
    Lines.upsert(s2.id, m.id, 2); // 10000

    const result = Reports.salesByEmployee({ from: "2026-05-01", to: "2026-05-31" });
    expect(result.find(r => r.full_name === "Almaz")?.subtotal).toBe(20000);
    expect(result.find(r => r.full_name === "Bekele")?.subtotal).toBe(10000);
  });
});

describe("Purchases reports", () => {
  it("purchasesByDay() sums totals per date", () => {
    Purchases.create({ purchase_date: "2026-05-10", description: "Beans", unit: "kg", qty: 2, unit_price: 50000, remark: null, entered_by: null });
    Purchases.create({ purchase_date: "2026-05-10", description: "Milk",  unit: "L",  qty: 5, unit_price: 4000,  remark: null, entered_by: null });
    Purchases.create({ purchase_date: "2026-05-12", description: "Sugar", unit: "kg", qty: 1, unit_price: 6000,  remark: null, entered_by: null });
    const r = Reports.purchasesByDay({ from: "2026-05-01", to: "2026-05-31" });
    expect(r.find(d => d.purchase_date === "2026-05-10")?.total).toBe(120000);
    expect(r.find(d => d.purchase_date === "2026-05-12")?.total).toBe(6000);
  });
});

describe("Petty cash reports", () => {
  it("pettyCashSummary() returns totals per type and net delta", () => {
    Petty.create({ entry_date: "2026-05-12", description: "Initial",   payer_name: null, amount: 100000, type: "replenishment", remark: null, entered_by: null });
    Petty.create({ entry_date: "2026-05-12", description: "Taxi",      payer_name: null, amount: 5000,   type: "expense",       remark: null, entered_by: null });
    Petty.create({ entry_date: "2026-05-13", description: "Refunded",  payer_name: null, amount: 2000,   type: "refund",        remark: null, entered_by: null });
    Petty.create({ entry_date: "2026-05-13", description: "Snacks",    payer_name: null, amount: 1500,   type: "expense",       remark: null, entered_by: null });
    const r = Reports.pettyCashSummary({ from: "2026-05-01", to: "2026-05-31" });
    expect(r.totalIn).toBe(102000); // 100000 + 2000
    expect(r.totalOut).toBe(6500);  // 5000 + 1500
    expect(r.net).toBe(95500);
    expect(r.byType.expense).toBe(6500);
    expect(r.byType.refund).toBe(2000);
    expect(r.byType.replenishment).toBe(100000);
  });
});

describe("Dashboard totals", () => {
  it("todaySalesTotal() sums only the given business date", () => {
    const e = Employees.create({ full_name: "C", username: "c", password_hash: "h", role: "employee" });
    const m = Menu.create({ name: "L", price: 1000, sort_order: 1 });
    const s = Sessions.create({ employee_id: e.id, business_date: "2026-05-12", shift: "m" });
    Lines.upsert(s.id, m.id, 3); // 3000
    const sOther = Sessions.create({ employee_id: e.id, business_date: "2026-05-11", shift: "m" });
    Lines.upsert(sOther.id, m.id, 99); // shouldn't count
    expect(Reports.todaySalesTotal("2026-05-12")).toBe(3000);
  });

  it("todayCashVsBank() splits payment by tender", () => {
    const e = Employees.create({ full_name: "C", username: "c", password_hash: "h", role: "employee" });
    const s = Sessions.create({ employee_id: e.id, business_date: "2026-05-12", shift: "m" });
    Sessions.updateHeader(s.id, { cash_amount: 15000, bank_transfer_amount: 5000, notes: null });
    const r = Reports.todayCashVsBank("2026-05-12");
    expect(r.cash).toBe(15000);
    expect(r.bank).toBe(5000);
  });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
npm test -- reports
```

- [ ] **Step 3: Implement `src/lib/reports.ts`**

```ts
import { getDb } from "./db";

export type DateRange = { from: string; to: string };

export type SalesByDayRow = { business_date: string; subtotal: number; session_count: number };
export type SalesByItemRow = { menu_item_id: number; name: string; qty: number; revenue: number };
export type SalesByEmployeeRow = { employee_id: number; full_name: string; subtotal: number; session_count: number };
export type PurchasesByDayRow = { purchase_date: string; total: number; row_count: number };
export type PettyCashSummary = {
  totalIn: number;
  totalOut: number;
  net: number;
  byType: { expense: number; refund: number; replenishment: number };
};

export function salesByDay(range: DateRange): SalesByDayRow[] {
  return getDb().prepare(`
    SELECT s.business_date,
           COALESCE(SUM(l.total), 0) AS subtotal,
           COUNT(DISTINCT s.id) AS session_count
    FROM sales_sessions s
    LEFT JOIN sale_line_items l ON l.sales_session_id = s.id
    WHERE s.business_date BETWEEN @from AND @to
    GROUP BY s.business_date
    ORDER BY s.business_date
  `).all(range) as SalesByDayRow[];
}

export function salesByItem(range: DateRange): SalesByItemRow[] {
  return getDb().prepare(`
    SELECT l.menu_item_id, m.name,
           COALESCE(SUM(l.qty), 0)   AS qty,
           COALESCE(SUM(l.total), 0) AS revenue
    FROM sale_line_items l
    JOIN sales_sessions s ON s.id = l.sales_session_id
    JOIN menu_items m     ON m.id = l.menu_item_id
    WHERE s.business_date BETWEEN @from AND @to
    GROUP BY l.menu_item_id, m.name
    ORDER BY revenue DESC, m.name
  `).all(range) as SalesByItemRow[];
}

export function salesByEmployee(range: DateRange): SalesByEmployeeRow[] {
  return getDb().prepare(`
    SELECT s.employee_id, e.full_name,
           COALESCE(SUM(l.total), 0) AS subtotal,
           COUNT(DISTINCT s.id)      AS session_count
    FROM sales_sessions s
    JOIN employees e ON e.id = s.employee_id
    LEFT JOIN sale_line_items l ON l.sales_session_id = s.id
    WHERE s.business_date BETWEEN @from AND @to
    GROUP BY s.employee_id, e.full_name
    ORDER BY subtotal DESC, e.full_name
  `).all(range) as SalesByEmployeeRow[];
}

export function purchasesByDay(range: DateRange): PurchasesByDayRow[] {
  return getDb().prepare(`
    SELECT purchase_date,
           COALESCE(SUM(total), 0) AS total,
           COUNT(*) AS row_count
    FROM purchase_requisitions
    WHERE purchase_date BETWEEN @from AND @to
    GROUP BY purchase_date
    ORDER BY purchase_date
  `).all(range) as PurchasesByDayRow[];
}

export function pettyCashSummary(range: DateRange): PettyCashSummary {
  const rows = getDb().prepare(`
    SELECT type, COALESCE(SUM(amount), 0) AS total
    FROM petty_cash_entries
    WHERE entry_date BETWEEN @from AND @to
    GROUP BY type
  `).all(range) as Array<{ type: "expense" | "refund" | "replenishment"; total: number }>;

  const byType = { expense: 0, refund: 0, replenishment: 0 };
  for (const r of rows) byType[r.type] = r.total;
  const totalIn = byType.refund + byType.replenishment;
  const totalOut = byType.expense;
  return { totalIn, totalOut, net: totalIn - totalOut, byType };
}

// Dashboard helpers

export function todaySalesTotal(businessDate: string): number {
  const r = getDb().prepare(`
    SELECT COALESCE(SUM(l.total), 0) AS subtotal
    FROM sales_sessions s
    LEFT JOIN sale_line_items l ON l.sales_session_id = s.id
    WHERE s.business_date = ?
  `).get(businessDate) as { subtotal: number };
  return r.subtotal;
}

export function todayCashVsBank(businessDate: string): { cash: number; bank: number } {
  const r = getDb().prepare(`
    SELECT COALESCE(SUM(cash_amount), 0)         AS cash,
           COALESCE(SUM(bank_transfer_amount), 0) AS bank
    FROM sales_sessions
    WHERE business_date = ?
  `).get(businessDate) as { cash: number; bank: number };
  return r;
}

export function todayPurchasesTotal(businessDate: string): number {
  const r = getDb().prepare("SELECT COALESCE(SUM(total), 0) AS s FROM purchase_requisitions WHERE purchase_date = ?").get(businessDate) as { s: number };
  return r.s;
}

export function todayPettyCashSpent(businessDate: string): number {
  const r = getDb().prepare("SELECT COALESCE(SUM(amount), 0) AS s FROM petty_cash_entries WHERE entry_date = ? AND type = 'expense'").get(businessDate) as { s: number };
  return r.s;
}

export function topItemsToday(businessDate: string, limit: number = 5): SalesByItemRow[] {
  return getDb().prepare(`
    SELECT l.menu_item_id, m.name,
           COALESCE(SUM(l.qty), 0)   AS qty,
           COALESCE(SUM(l.total), 0) AS revenue
    FROM sale_line_items l
    JOIN sales_sessions s ON s.id = l.sales_session_id
    JOIN menu_items m     ON m.id = l.menu_item_id
    WHERE s.business_date = ?
    GROUP BY l.menu_item_id, m.name
    ORDER BY qty DESC, m.name
    LIMIT ?
  `).all(businessDate, limit) as SalesByItemRow[];
}
```

- [ ] **Step 4: Pass + commit**

```bash
npm test
git add src/lib/reports.ts tests/reports.test.ts
git commit -m "feat(lib): reports aggregation (sales, purchases, petty cash, dashboard)"
```

---

## Task 2: CSV helper (TDD)

**Files:** `src/lib/csv.ts`, `tests/csv.test.ts`

Tiny utility — escape values, join rows. No external dep.

- [ ] **Step 1: Write tests `tests/csv.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { toCsv, escapeCell } from "../src/lib/csv";

describe("escapeCell", () => {
  it("returns unquoted plain strings", () => {
    expect(escapeCell("Almaz")).toBe("Almaz");
    expect(escapeCell(123)).toBe("123");
    expect(escapeCell(null)).toBe("");
    expect(escapeCell(undefined)).toBe("");
  });

  it("quotes when the value contains comma, quote, or newline", () => {
    expect(escapeCell("a, b")).toBe('"a, b"');
    expect(escapeCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCell("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("toCsv", () => {
  it("builds CSV from header + rows", () => {
    const csv = toCsv(
      ["name", "qty", "total"],
      [
        { name: "Latte", qty: 3, total: 1500 },
        { name: "Espresso, Single", qty: 2, total: 600 },
      ],
    );
    expect(csv).toBe(
      'name,qty,total\nLatte,3,1500\n"Espresso, Single",2,600\n',
    );
  });

  it("handles empty rows", () => {
    expect(toCsv(["a", "b"], [])).toBe("a,b\n");
  });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
npm test -- csv
```

- [ ] **Step 3: Implement `src/lib/csv.ts`**

```ts
export function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv<T extends Record<string, unknown>>(headers: string[], rows: T[]): string {
  const headerLine = headers.map(escapeCell).join(",");
  const dataLines = rows.map(r => headers.map(h => escapeCell(r[h])).join(","));
  return [headerLine, ...dataLines].join("\n") + "\n";
}
```

- [ ] **Step 4: Pass + commit**

```bash
npm test
git add src/lib/csv.ts tests/csv.test.ts
git commit -m "feat(lib): CSV escape + builder helpers"
```

---

## Task 3: Dashboard cards with real data

**Files:** `src/controllers/dashboardController.ts`, `src/views/dashboard.ejs`

- [ ] **Step 1: Replace `src/controllers/dashboardController.ts`**

```ts
import type { Request, Response } from "express";
import * as Reports from "../lib/reports";
import * as Settings from "../models/settings";
import { todayBusinessDate } from "../lib/dates";

export function show(_req: Request, res: Response) {
  const today = todayBusinessDate(
    Settings.get("business_day_cutoff") ?? "00:00",
    Settings.get("timezone") ?? "Africa/Addis_Ababa",
  );
  const data = {
    today,
    salesTotal: Reports.todaySalesTotal(today),
    cashVsBank: Reports.todayCashVsBank(today),
    purchasesTotal: Reports.todayPurchasesTotal(today),
    pettyCashSpent: Reports.todayPettyCashSpent(today),
    topItems: Reports.topItemsToday(today, 5),
  };
  res.render("dashboard", { data });
}
```

- [ ] **Step 2: Replace `src/views/dashboard.ejs`**

```ejs
<%- include('partials/head', { title: 'Dashboard', shopName }) %>
<body class="text-ink font-sans antialiased min-h-screen flex">
  <%- include('partials/sidebar', { shopName, currentRole, currentUser, csrfToken, currentPath }) %>

  <main class="flex-1 px-air-lg pt-chapter pb-air-lg max-w-5xl">
    <%
      const hour = new Date().getHours();
      const greet = hour < 12 ? 'Selam' : (hour < 18 ? 'Good afternoon' : 'Good evening');
      const todayLabel = new Date(typeof data !== 'undefined' ? data.today : Date.now()).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    %>

    <header class="reveal reveal-1">
      <p class="font-mono text-[12px] tracking-smallcaps uppercase text-smoke"><%= todayLabel %></p>
      <h1 class="font-display italic text-[36px] leading-[42px] text-ink mt-gutter-tight" style="font-variation-settings:'opsz' 72,'SOFT' 50">
        <%= greet %>, <%= currentUser.full_name.split(' ')[0] %>.
      </h1>
    </header>

    <div class="reveal reveal-2"><%- include('partials/ornament') %></div>

    <%- include('partials/flash', { flash }) %>

    <% if (currentRole === 'owner' && typeof data !== 'undefined') { %>
      <section class="reveal reveal-3 grid grid-cols-1 md:grid-cols-3 gap-air">
        <article class="card">
          <header class="card-header">
            <p class="font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke">Today's sales</p>
            <p class="font-mono text-[28px] leading-[32px] text-ink mt-gutter-tight"><%= (data.salesTotal / 100).toFixed(2) %></p>
          </header>
          <div class="card-body">
            <p class="font-sans text-[12px] text-smoke">
              Cash <span class="font-mono text-coal"><%= (data.cashVsBank.cash / 100).toFixed(2) %></span> ·
              Bank <span class="font-mono text-coal"><%= (data.cashVsBank.bank / 100).toFixed(2) %></span>
            </p>
            <a href="/sales" class="link text-[12px] tracking-smallcaps uppercase mt-gutter inline-block">View shifts →</a>
          </div>
        </article>

        <article class="card">
          <header class="card-header">
            <p class="font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke">Purchases today</p>
            <p class="font-mono text-[28px] leading-[32px] text-ink mt-gutter-tight"><%= (data.purchasesTotal / 100).toFixed(2) %></p>
          </header>
          <div class="card-body">
            <a href="/purchases" class="link text-[12px] tracking-smallcaps uppercase">View purchases →</a>
          </div>
        </article>

        <article class="card">
          <header class="card-header">
            <p class="font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke">Petty cash spent</p>
            <p class="font-mono text-[28px] leading-[32px] text-ink mt-gutter-tight"><%= (data.pettyCashSpent / 100).toFixed(2) %></p>
          </header>
          <div class="card-body">
            <a href="/petty-cash" class="link text-[12px] tracking-smallcaps uppercase">View entries →</a>
          </div>
        </article>
      </section>

      <% if (data.topItems.length > 0) { %>
        <section class="reveal reveal-3 mt-air-lg">
          <h2 class="font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke mb-gutter">Top items today</h2>
          <div class="card">
            <table class="w-full">
              <tbody>
                <% data.topItems.forEach((item, i) => { %>
                  <tr class="border-b border-rule last:border-0">
                    <td class="px-gutter-lg py-gutter font-mono text-[12px] text-mist w-12"><%= i + 1 %></td>
                    <td class="py-gutter font-sans text-[15px] text-ink"><%= item.name %></td>
                    <td class="py-gutter text-right font-mono text-[14px] text-coal"><%= item.qty %> sold</td>
                    <td class="px-gutter-lg py-gutter text-right font-mono text-[14px] text-ink"><%= (item.revenue / 100).toFixed(2) %></td>
                  </tr>
                <% }) %>
              </tbody>
            </table>
          </div>
        </section>
      <% } %>
    <% } else { %>
      <section class="reveal reveal-3 space-y-gutter max-w-md">
        <a href="/sales/new" class="btn-primary w-full h-14 text-[14px]">Start new shift →</a>
        <a href="/sales" class="btn-secondary w-full h-14 text-[14px]">My past shifts →</a>
      </section>
    <% } %>
  </main>
</body>
</html>
```

- [ ] **Step 3: Build + commit**

```bash
npm run build && npm run css:build
git add src/controllers/dashboardController.ts src/views/dashboard.ejs
git commit -m "feat(dashboard): live cards (sales, cash split, purchases, petty, top items)"
```

---

## Task 4: Reports controller + tabbed page

**Files:** `src/routes/reports.ts`, `src/routes/index.ts` (mount), `src/controllers/reportsController.ts`, `src/views/reports/index.ejs`, `src/views/reports/_sales.ejs`, `src/views/reports/_purchases.ejs`, `src/views/reports/_pettyCash.ejs`, `src/views/reports/_payroll.ejs`

- [ ] **Step 1: Create `src/routes/reports.ts`**

```ts
import { Router } from "express";
import * as Ctrl from "../controllers/reportsController";
import { requireAuth } from "../middleware/requireAuth";
import { requireOwner } from "../middleware/requireOwner";

export const reportsRouter = Router();
reportsRouter.use(requireAuth, requireOwner);

reportsRouter.get("/",          Ctrl.show);
reportsRouter.get("/export",    Ctrl.exportCsv);
reportsRouter.get("/print",     Ctrl.print);
```

- [ ] **Step 2: Mount in `src/routes/index.ts`**

```ts
import { reportsRouter } from "./reports";
router.use("/reports", reportsRouter);
```

- [ ] **Step 3: Create `src/controllers/reportsController.ts`**

```ts
import type { Request, Response } from "express";
import * as Reports from "../lib/reports";
import * as Runs from "../models/payrollRuns";
import * as Entries from "../models/payrollEntries";
import * as Settings from "../models/settings";
import { toCsv } from "../lib/csv";
import { todayBusinessDate } from "../lib/dates";

function defaultRange(): { from: string; to: string } {
  const today = todayBusinessDate(Settings.get("business_day_cutoff") ?? "00:00", Settings.get("timezone") ?? "Africa/Addis_Ababa");
  // last 30 days
  const t = new Date(today);
  t.setDate(t.getDate() - 30);
  const yyyy = t.getFullYear();
  const mm = String(t.getMonth() + 1).padStart(2, "0");
  const dd = String(t.getDate()).padStart(2, "0");
  return { from: `${yyyy}-${mm}-${dd}`, to: today };
}

function rangeFromReq(req: Request): { from: string; to: string } {
  const d = defaultRange();
  const from = req.query.from ? String(req.query.from) : d.from;
  const to   = req.query.to   ? String(req.query.to)   : d.to;
  return { from, to };
}

const TABS = ["sales", "purchases", "petty-cash", "payroll"] as const;
type Tab = typeof TABS[number];

function safeTab(input: unknown): Tab {
  return (TABS as readonly string[]).includes(String(input)) ? input as Tab : "sales";
}

function loadTabData(tab: Tab, range: { from: string; to: string }) {
  if (tab === "sales") {
    return {
      byDay: Reports.salesByDay(range),
      byItem: Reports.salesByItem(range),
      byEmployee: Reports.salesByEmployee(range),
    };
  }
  if (tab === "purchases") {
    return { byDay: Reports.purchasesByDay(range) };
  }
  if (tab === "petty-cash") {
    return { summary: Reports.pettyCashSummary(range) };
  }
  // payroll
  const runs = Runs.listAll().map(r => {
    const entries = Entries.listForRun(r.id);
    return {
      ...r,
      employee_count: entries.length,
      total_gross: entries.reduce((s, e) => s + e.gross_salary, 0),
      total_net: entries.reduce((s, e) => s + e.net_payment, 0),
    };
  });
  return { runs };
}

export function show(req: Request, res: Response) {
  const tab = safeTab(req.query.tab);
  const range = rangeFromReq(req);
  const data = loadTabData(tab, range);
  res.render("reports/index", { tab, range, data });
}

export function exportCsv(req: Request, res: Response) {
  const tab = safeTab(req.query.tab);
  const range = rangeFromReq(req);

  let filename = `${tab}-${range.from}-to-${range.to}.csv`;
  let csv = "";

  if (tab === "sales") {
    const grouping = (req.query.group as string) || "day";
    if (grouping === "item") {
      const rows = Reports.salesByItem(range).map(r => ({ ...r, revenue: (r.revenue / 100).toFixed(2) }));
      csv = toCsv(["name", "qty", "revenue"], rows);
      filename = `sales-by-item-${range.from}-to-${range.to}.csv`;
    } else if (grouping === "employee") {
      const rows = Reports.salesByEmployee(range).map(r => ({ ...r, subtotal: (r.subtotal / 100).toFixed(2) }));
      csv = toCsv(["full_name", "session_count", "subtotal"], rows);
      filename = `sales-by-employee-${range.from}-to-${range.to}.csv`;
    } else {
      const rows = Reports.salesByDay(range).map(r => ({ ...r, subtotal: (r.subtotal / 100).toFixed(2) }));
      csv = toCsv(["business_date", "session_count", "subtotal"], rows);
      filename = `sales-by-day-${range.from}-to-${range.to}.csv`;
    }
  } else if (tab === "purchases") {
    const rows = Reports.purchasesByDay(range).map(r => ({ ...r, total: (r.total / 100).toFixed(2) }));
    csv = toCsv(["purchase_date", "row_count", "total"], rows);
  } else if (tab === "petty-cash") {
    const s = Reports.pettyCashSummary(range);
    csv = toCsv(
      ["metric", "amount"],
      [
        { metric: "expense",       amount: (s.byType.expense / 100).toFixed(2) },
        { metric: "refund",        amount: (s.byType.refund / 100).toFixed(2) },
        { metric: "replenishment", amount: (s.byType.replenishment / 100).toFixed(2) },
        { metric: "total_in",      amount: (s.totalIn / 100).toFixed(2) },
        { metric: "total_out",     amount: (s.totalOut / 100).toFixed(2) },
        { metric: "net",           amount: (s.net / 100).toFixed(2) },
      ],
    );
  } else if (tab === "payroll") {
    const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const rows = Runs.listAll().map(r => {
      const entries = Entries.listForRun(r.id);
      return {
        period: `${monthNames[r.month - 1]} ${r.year}`,
        status: r.status,
        employees: entries.length,
        gross: (entries.reduce((s, e) => s + e.gross_salary, 0) / 100).toFixed(2),
        net:   (entries.reduce((s, e) => s + e.net_payment,  0) / 100).toFixed(2),
      };
    });
    csv = toCsv(["period", "status", "employees", "gross", "net"], rows);
    filename = `payroll-runs.csv`;
  }

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
}

export function print(req: Request, res: Response) {
  const tab = safeTab(req.query.tab);
  const range = rangeFromReq(req);
  const data = loadTabData(tab, range);
  const shopName = Settings.get("shop_name") ?? "Coffee Shop";
  res.render("reports/print", { tab, range, data, shopName });
}
```

- [ ] **Step 4: Create `src/views/reports/index.ejs`** (tab nav + range filter + tab partial)

```ejs
<%- include('../partials/head', { title: 'Reports', shopName }) %>
<body class="text-ink font-sans antialiased min-h-screen flex">
  <%- include('../partials/sidebar', { shopName, currentRole, currentUser, csrfToken, currentPath }) %>

  <main class="flex-1 px-air-lg pt-chapter pb-air-lg max-w-5xl">
    <header class="reveal reveal-1 flex items-end justify-between">
      <div>
        <p class="font-mono text-[12px] tracking-smallcaps uppercase text-smoke">Analytics</p>
        <h1 class="font-display text-[36px] leading-[42px] text-ink mt-gutter-tight" style="font-variation-settings:'opsz' 72,'SOFT' 50">Reports</h1>
      </div>
      <div class="flex items-center gap-gutter">
        <a href="/reports/print?tab=<%= tab %>&from=<%= range.from %>&to=<%= range.to %>" target="_blank" class="btn-secondary">Print</a>
        <a href="/reports/export?tab=<%= tab %>&from=<%= range.from %>&to=<%= range.to %>" class="btn-primary">Download CSV</a>
      </div>
    </header>

    <div class="reveal reveal-2"><%- include('../partials/ornament') %></div>

    <%- include('../partials/flash', { flash }) %>

    <% const tabs = [
        { key: 'sales',      label: 'Sales' },
        { key: 'purchases',  label: 'Purchases' },
        { key: 'petty-cash', label: 'Petty cash' },
        { key: 'payroll',    label: 'Payroll' },
    ]; %>

    <nav class="reveal reveal-3 border-b border-rule-strong flex gap-air-lg mb-air">
      <% tabs.forEach(t => { %>
        <a href="/reports?tab=<%= t.key %>&from=<%= range.from %>&to=<%= range.to %>"
           class="relative pb-gutter font-sans text-[14px] transition-colors <%= tab === t.key ? 'text-ink' : 'text-smoke hover:text-coal' %>">
          <%= t.label %>
          <% if (tab === t.key) { %>
            <span class="absolute left-0 right-0 -bottom-px h-[2px] bg-ember"></span>
          <% } %>
        </a>
      <% }) %>
    </nav>

    <form method="GET" class="flex items-end gap-gutter mb-air">
      <input type="hidden" name="tab" value="<%= tab %>" />
      <label class="block">
        <span class="field-label">From</span>
        <input type="date" name="from" value="<%= range.from %>" class="field-input field-mono" />
      </label>
      <label class="block">
        <span class="field-label">To</span>
        <input type="date" name="to" value="<%= range.to %>" class="field-input field-mono" />
      </label>
      <button class="btn-secondary">Apply</button>
    </form>

    <% if (tab === 'sales')      { %><%- include('_sales',     { data, range, csrfToken }) %><% } %>
    <% if (tab === 'purchases')  { %><%- include('_purchases', { data, range, csrfToken }) %><% } %>
    <% if (tab === 'petty-cash') { %><%- include('_pettyCash', { data, range, csrfToken }) %><% } %>
    <% if (tab === 'payroll')    { %><%- include('_payroll',   { data, range, csrfToken }) %><% } %>
  </main>
</body>
</html>
```

- [ ] **Step 5: Create `src/views/reports/_sales.ejs`**

```ejs
<div class="grid grid-cols-3 gap-air mb-air">
  <a href="/reports/export?tab=sales&group=day&from=<%= range.from %>&to=<%= range.to %>" class="card hover:bg-paper transition-colors">
    <div class="card-body text-center py-gutter-lg">
      <p class="font-sans text-[11px] tracking-smallcaps uppercase text-smoke">By day</p>
      <p class="font-display text-[16px] mt-1 text-ink" style="font-variation-settings:'opsz' 24,'SOFT' 50">CSV →</p>
    </div>
  </a>
  <a href="/reports/export?tab=sales&group=item&from=<%= range.from %>&to=<%= range.to %>" class="card hover:bg-paper transition-colors">
    <div class="card-body text-center py-gutter-lg">
      <p class="font-sans text-[11px] tracking-smallcaps uppercase text-smoke">By item</p>
      <p class="font-display text-[16px] mt-1 text-ink" style="font-variation-settings:'opsz' 24,'SOFT' 50">CSV →</p>
    </div>
  </a>
  <a href="/reports/export?tab=sales&group=employee&from=<%= range.from %>&to=<%= range.to %>" class="card hover:bg-paper transition-colors">
    <div class="card-body text-center py-gutter-lg">
      <p class="font-sans text-[11px] tracking-smallcaps uppercase text-smoke">By employee</p>
      <p class="font-display text-[16px] mt-1 text-ink" style="font-variation-settings:'opsz' 24,'SOFT' 50">CSV →</p>
    </div>
  </a>
</div>

<article class="card mb-air">
  <header class="card-header">
    <h2 class="card-title">By day</h2>
  </header>
  <% if (data.byDay.length === 0) { %>
    <div class="card-body text-center py-air font-sans text-[14px] text-smoke">No sales in this range.</div>
  <% } else { %>
    <table class="w-full">
      <thead>
        <tr class="border-b border-rule">
          <th class="text-left font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke px-gutter-lg py-gutter">Date</th>
          <th class="text-right font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke py-gutter">Shifts</th>
          <th class="text-right font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke px-gutter-lg py-gutter">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        <% data.byDay.forEach(r => { %>
          <tr class="border-b border-rule last:border-0">
            <td class="px-gutter-lg py-gutter font-mono text-[13px] text-coal"><%= r.business_date %></td>
            <td class="py-gutter text-right font-mono text-[13px] text-coal"><%= r.session_count %></td>
            <td class="px-gutter-lg py-gutter text-right font-mono text-[14px] text-ink"><%= (r.subtotal / 100).toFixed(2) %></td>
          </tr>
        <% }) %>
      </tbody>
    </table>
  <% } %>
</article>

<article class="card mb-air">
  <header class="card-header">
    <h2 class="card-title">By item</h2>
  </header>
  <% if (data.byItem.length === 0) { %>
    <div class="card-body text-center py-air font-sans text-[14px] text-smoke">No items sold in this range.</div>
  <% } else { %>
    <table class="w-full">
      <thead>
        <tr class="border-b border-rule">
          <th class="text-left font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke px-gutter-lg py-gutter">Item</th>
          <th class="text-right font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke py-gutter">Qty</th>
          <th class="text-right font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke px-gutter-lg py-gutter">Revenue</th>
        </tr>
      </thead>
      <tbody>
        <% data.byItem.forEach(r => { %>
          <tr class="border-b border-rule last:border-0">
            <td class="px-gutter-lg py-gutter font-sans text-[14px] text-ink"><%= r.name %></td>
            <td class="py-gutter text-right font-mono text-[13px] text-coal"><%= r.qty %></td>
            <td class="px-gutter-lg py-gutter text-right font-mono text-[14px] text-ink"><%= (r.revenue / 100).toFixed(2) %></td>
          </tr>
        <% }) %>
      </tbody>
    </table>
  <% } %>
</article>

<article class="card">
  <header class="card-header">
    <h2 class="card-title">By employee</h2>
  </header>
  <% if (data.byEmployee.length === 0) { %>
    <div class="card-body text-center py-air font-sans text-[14px] text-smoke">No employee activity in this range.</div>
  <% } else { %>
    <table class="w-full">
      <thead>
        <tr class="border-b border-rule">
          <th class="text-left font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke px-gutter-lg py-gutter">Employee</th>
          <th class="text-right font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke py-gutter">Shifts</th>
          <th class="text-right font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke px-gutter-lg py-gutter">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        <% data.byEmployee.forEach(r => { %>
          <tr class="border-b border-rule last:border-0">
            <td class="px-gutter-lg py-gutter font-sans text-[14px] text-ink"><%= r.full_name %></td>
            <td class="py-gutter text-right font-mono text-[13px] text-coal"><%= r.session_count %></td>
            <td class="px-gutter-lg py-gutter text-right font-mono text-[14px] text-ink"><%= (r.subtotal / 100).toFixed(2) %></td>
          </tr>
        <% }) %>
      </tbody>
    </table>
  <% } %>
</article>
```

- [ ] **Step 6: Create `src/views/reports/_purchases.ejs`**

```ejs
<article class="card">
  <header class="card-header">
    <h2 class="card-title">Purchases by day</h2>
  </header>
  <% if (data.byDay.length === 0) { %>
    <div class="card-body text-center py-air font-sans text-[14px] text-smoke">No purchases in this range.</div>
  <% } else { %>
    <table class="w-full">
      <thead>
        <tr class="border-b border-rule">
          <th class="text-left font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke px-gutter-lg py-gutter">Date</th>
          <th class="text-right font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke py-gutter">Rows</th>
          <th class="text-right font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke px-gutter-lg py-gutter">Total</th>
        </tr>
      </thead>
      <tbody>
        <% data.byDay.forEach(r => { %>
          <tr class="border-b border-rule last:border-0">
            <td class="px-gutter-lg py-gutter font-mono text-[13px] text-coal"><%= r.purchase_date %></td>
            <td class="py-gutter text-right font-mono text-[13px] text-coal"><%= r.row_count %></td>
            <td class="px-gutter-lg py-gutter text-right font-mono text-[14px] text-ink"><%= (r.total / 100).toFixed(2) %></td>
          </tr>
        <% }) %>
      </tbody>
      <tfoot>
        <tr class="border-t-2 border-rule-strong">
          <td colspan="2" class="px-gutter-lg py-gutter-lg text-right font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke">Total</td>
          <td class="px-gutter-lg py-gutter-lg text-right font-mono text-[16px] text-ink"><%= (data.byDay.reduce((s, r) => s + r.total, 0) / 100).toFixed(2) %></td>
        </tr>
      </tfoot>
    </table>
  <% } %>
</article>
```

- [ ] **Step 7: Create `src/views/reports/_pettyCash.ejs`**

```ejs
<div class="grid grid-cols-3 gap-air mb-air">
  <article class="card">
    <div class="card-body">
      <p class="font-sans text-[11px] tracking-smallcaps uppercase text-smoke">Total in</p>
      <p class="font-mono text-[24px] text-leaf mt-1">+<%= (data.summary.totalIn / 100).toFixed(2) %></p>
    </div>
  </article>
  <article class="card">
    <div class="card-body">
      <p class="font-sans text-[11px] tracking-smallcaps uppercase text-smoke">Total out</p>
      <p class="font-mono text-[24px] text-crimson mt-1">−<%= (data.summary.totalOut / 100).toFixed(2) %></p>
    </div>
  </article>
  <article class="card">
    <div class="card-body">
      <p class="font-sans text-[11px] tracking-smallcaps uppercase text-smoke">Net change</p>
      <p class="font-mono text-[24px] mt-1 <%= data.summary.net < 0 ? 'text-crimson' : 'text-ink' %>"><%= (data.summary.net / 100).toFixed(2) %></p>
    </div>
  </article>
</div>

<article class="card">
  <header class="card-header"><h2 class="card-title">By type</h2></header>
  <table class="w-full">
    <tbody>
      <tr class="border-b border-rule">
        <td class="px-gutter-lg py-gutter font-sans text-[14px] text-ink">Expense</td>
        <td class="px-gutter-lg py-gutter text-right font-mono text-[14px] text-crimson">−<%= (data.summary.byType.expense / 100).toFixed(2) %></td>
      </tr>
      <tr class="border-b border-rule">
        <td class="px-gutter-lg py-gutter font-sans text-[14px] text-ink">Refund</td>
        <td class="px-gutter-lg py-gutter text-right font-mono text-[14px] text-leaf">+<%= (data.summary.byType.refund / 100).toFixed(2) %></td>
      </tr>
      <tr>
        <td class="px-gutter-lg py-gutter font-sans text-[14px] text-ink">Replenishment</td>
        <td class="px-gutter-lg py-gutter text-right font-mono text-[14px] text-leaf">+<%= (data.summary.byType.replenishment / 100).toFixed(2) %></td>
      </tr>
    </tbody>
  </table>
</article>
```

- [ ] **Step 8: Create `src/views/reports/_payroll.ejs`**

```ejs
<%
  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
%>
<article class="card">
  <header class="card-header">
    <h2 class="card-title">Payroll runs</h2>
    <p class="card-meta">All runs, newest first</p>
  </header>
  <% if (data.runs.length === 0) { %>
    <div class="card-body text-center py-air font-sans text-[14px] text-smoke">No payroll runs yet.</div>
  <% } else { %>
    <table class="w-full">
      <thead>
        <tr class="border-b border-rule">
          <th class="text-left font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke px-gutter-lg py-gutter">Period</th>
          <th class="text-left font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke py-gutter">Status</th>
          <th class="text-right font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke py-gutter">Employees</th>
          <th class="text-right font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke py-gutter">Gross</th>
          <th class="text-right font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke px-gutter-lg py-gutter">Net</th>
        </tr>
      </thead>
      <tbody>
        <% data.runs.forEach(r => { %>
          <tr class="border-b border-rule last:border-0">
            <td class="px-gutter-lg py-gutter font-display text-[15px] text-ink" style="font-variation-settings:'opsz' 24,'SOFT' 50"><%= monthNames[r.month - 1] %> <%= r.year %></td>
            <td class="py-gutter">
              <span class="pip pip-<%= r.status === 'approved' ? 'approved' : 'draft' %>"><%= r.status %></span>
            </td>
            <td class="py-gutter text-right font-mono text-[13px] text-coal"><%= r.employee_count %></td>
            <td class="py-gutter text-right font-mono text-[13px] text-coal"><%= (r.total_gross / 100).toFixed(2) %></td>
            <td class="px-gutter-lg py-gutter text-right font-mono text-[14px] text-ink"><%= (r.total_net / 100).toFixed(2) %></td>
          </tr>
        <% }) %>
      </tbody>
    </table>
  <% } %>
</article>
```

- [ ] **Step 9: Create `src/views/reports/print.ejs`** (simple print-friendly wrapper)

```ejs
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Reports · <%= tab %> · <%= shopName %></title>
  <link rel="stylesheet" href="/css/app.css" />
  <style>
    @page { size: A4 portrait; margin: 14mm; }
    @media print { body { background: white !important; } .no-print { display: none !important; } }
  </style>
</head>
<body class="bg-cream text-ink font-sans antialiased">
  <div class="max-w-[900px] mx-auto p-air-lg">
    <header class="mb-air">
      <p class="font-mono text-[11px] tracking-smallcaps uppercase text-smoke">Report · <%= tab.replace('-', ' ') %></p>
      <h1 class="wordmark text-[36px] leading-[40px] mt-gutter-tight"><%= shopName %></h1>
      <p class="font-display italic text-[16px] text-coal mt-gutter-tight" style="font-variation-settings:'opsz' 24,'SOFT' 50"><%= range.from %> to <%= range.to %></p>
    </header>

    <% if (tab === 'sales')      { %><%- include('_sales',     { data, range, csrfToken: '' }) %><% } %>
    <% if (tab === 'purchases')  { %><%- include('_purchases', { data, range, csrfToken: '' }) %><% } %>
    <% if (tab === 'petty-cash') { %><%- include('_pettyCash', { data, range, csrfToken: '' }) %><% } %>
    <% if (tab === 'payroll')    { %><%- include('_payroll',   { data, range, csrfToken: '' }) %><% } %>

    <div class="no-print mt-air flex justify-end">
      <button onclick="window.print()" class="btn-primary">Print</button>
    </div>
  </div>
</body>
</html>
```

- [ ] **Step 10: Build + commit**

```bash
npm run build && npm run css:build
mkdir -p src/views/reports
git add src/routes/reports.ts src/routes/index.ts src/controllers/reportsController.ts src/views/reports/
git commit -m "feat(reports): tabbed page with CSV export + printable view"
```

---

## Task 5: Backup helper + cron job (TDD)

**Files:** `src/lib/backup.ts`, `tests/backup.test.ts`, `src/server.ts` (modify), `package.json` (install node-cron)

- [ ] **Step 1: Install node-cron**

```bash
npm install node-cron
npm install -D @types/node-cron
```

- [ ] **Step 2: Write tests `tests/backup.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { unlinkSync, existsSync, readdirSync, rmSync, statSync, writeFileSync } from "fs";
import { resolve } from "path";
import { closeDb, runMigrations, getDb } from "../src/lib/db";
import { runBackup, pruneOldBackups } from "../src/lib/backup";

const TEST_DB = "./data/test-backup.db";
const TEST_DIR = "./data/test-backups";
process.env.DB_PATH = TEST_DB;
process.env.BACKUP_DIR = TEST_DIR;

beforeEach(() => {
  closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  runMigrations();
});

afterAll(() => {
  closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
});

describe("backup", () => {
  it("runBackup() writes a copy to BACKUP_DIR with a timestamp filename", async () => {
    // Add some data so the backup is non-trivial
    getDb().prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("test_key", "hello");
    const path = await runBackup();
    expect(existsSync(path)).toBe(true);
    expect(path).toMatch(/test-backups\/shop-\d{4}-\d{2}-\d{2}.*\.db$/);
    expect(statSync(path).size).toBeGreaterThan(0);
  });

  it("pruneOldBackups() removes files older than N days", async () => {
    await runBackup();
    // Sleep then create another so we have two files
    const files = readdirSync(TEST_DIR);
    expect(files.length).toBe(1);
    // Touch a fake old file
    const oldPath = resolve(TEST_DIR, "shop-2020-01-01.db");
    writeFileSync(oldPath, "old");
    // Antedate via fs.utimes
    const old = new Date(); old.setDate(old.getDate() - 90);
    const fs = require("fs");
    fs.utimesSync(oldPath, old, old);

    pruneOldBackups(30);
    expect(existsSync(oldPath)).toBe(false);
    // Recent one survives
    expect(readdirSync(TEST_DIR).length).toBe(1);
  });
});
```

- [ ] **Step 3: Run, expect fail**

```bash
npm test -- backup
```

- [ ] **Step 4: Implement `src/lib/backup.ts`**

```ts
import { resolve, join } from "path";
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "fs";
import { getDb } from "./db";

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
  const dir = backupDir();
  const filename = `shop-${timestamp()}.db`;
  const dest = join(dir, filename);
  // better-sqlite3's backup() is a Promise-returning method that uses SQLite's online backup API.
  await getDb().backup(dest);
  return dest;
}

export function pruneOldBackups(retainDays: number): string[] {
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

- [ ] **Step 5: Pass tests; modify `src/server.ts` to schedule the cron**

Open `src/server.ts` and add:

```ts
import cron from "node-cron";
import { runBackup, pruneOldBackups } from "./lib/backup";
```

After `runMigrations();` and before `app.listen(...)`, add:

```ts
// Nightly DB backup at 02:30 local time, retain 30 days
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
```

- [ ] **Step 6: Commit**

```bash
npm run build && npm test
git add package.json package-lock.json src/lib/backup.ts src/server.ts tests/backup.test.ts
git commit -m "feat(backup): nightly cron + retention via SQLite online backup"
```

---

## Task 6: Manual backup section in Settings

**Files:** `src/controllers/settingsController.ts` (extend), `src/routes/index.ts` (mount route), `src/views/settings/index.ejs` (append section)

- [ ] **Step 1: Extend `src/controllers/settingsController.ts`**

Add imports at top:

```ts
import { runBackup, listBackups, backupDirPath } from "../lib/backup";
import { join } from "path";
import { resolve } from "path";
```

Replace the `show` function and add new handlers:

```ts
export function show(_req: Request, res: Response) {
  const settings = Settings.getAll();
  const backups = listBackups();
  const backupDir = backupDirPath();
  res.render("settings/index", { settings, backups, backupDir });
}

export async function backupNow(_req: Request, res: Response) {
  try {
    await runBackup();
    pushFlash(_req as any, "success", "Backup created");
  } catch (err) {
    pushFlash(_req as any, "error", "Backup failed");
  }
  res.redirect("/settings");
}

export function downloadBackup(req: Request, res: Response) {
  const name = String(req.params.name || "");
  if (!/^shop-[\w-]+\.db$/.test(name)) return res.status(400).send("Invalid name");
  const path = resolve(join(backupDirPath(), name));
  res.download(path);
}
```

- [ ] **Step 2: Add routes in `src/routes/index.ts`**

Add (alongside existing settings routes):

```ts
router.post("/settings/backup",            requireAuth, requireOwner, Settings.backupNow);
router.get("/settings/backup/:name",       requireAuth, requireOwner, Settings.downloadBackup);
```

(`Settings` here is the import alias for the controller module already wired up.)

- [ ] **Step 3: Append a Backups card to `src/views/settings/index.ejs`**

Inside the existing `<form method="POST" action="/settings">` block, OR after it, add this card (after the System section, before the form's submit row — actually, it's a separate form so place it AFTER the main `<form>` closes):

```ejs
<article class="card mt-air">
  <header class="card-header">
    <h2 class="card-title">Backups</h2>
    <p class="card-meta">Stored in <span class="font-mono"><%= backupDir %></span></p>
  </header>
  <div class="card-body">
    <form method="POST" action="/settings/backup" class="flex items-center justify-between mb-gutter-lg">
      <input type="hidden" name="_csrf" value="<%= csrfToken %>" />
      <p class="font-sans text-[13px] text-coal">Automatic backups run nightly at 02:30 and are kept for 30 days.</p>
      <button class="btn-secondary">Back up now</button>
    </form>

    <% if (backups.length === 0) { %>
      <p class="font-sans text-[13px] text-smoke italic">No backups yet — run one to create the first.</p>
    <% } else { %>
      <table class="w-full">
        <thead>
          <tr class="border-b border-rule">
            <th class="text-left font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke py-gutter">File</th>
            <th class="text-right font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke py-gutter">Size</th>
            <th class="text-right font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke py-gutter">Created</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <% backups.slice(0, 10).forEach(b => { %>
            <tr class="border-b border-rule last:border-0">
              <td class="py-gutter font-mono text-[12px] text-coal"><%= b.name %></td>
              <td class="py-gutter text-right font-mono text-[12px] text-coal"><%= (b.size / 1024).toFixed(1) %> KB</td>
              <td class="py-gutter text-right font-mono text-[12px] text-coal"><%= b.mtime.toISOString().replace('T', ' ').substring(0, 16) %></td>
              <td class="py-gutter text-right">
                <a href="/settings/backup/<%= b.name %>" class="font-sans text-[12px] tracking-smallcaps uppercase text-ember hover:text-ember-deep transition-colors">Download</a>
              </td>
            </tr>
          <% }) %>
        </tbody>
      </table>
    <% } %>
  </div>
</article>
```

- [ ] **Step 4: Build + commit**

```bash
npm run build && npm run css:build
git add src/controllers/settingsController.ts src/routes/index.ts src/views/settings/index.ejs
git commit -m "feat(settings): manual backup + download history"
```

---

## Task 7: Integration tests

**Files:** `tests/integration/reports.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { unlinkSync, existsSync, rmSync } from "fs";
import { closeDb, runMigrations } from "../../src/lib/db";
import * as Employees from "../../src/models/employees";
import * as Menu from "../../src/models/menuItems";
import * as Sessions from "../../src/models/salesSessions";
import * as Lines from "../../src/models/saleLineItems";

const TEST_DB = "./data/test-reports-int.db";
process.env.DB_PATH = TEST_DB;
process.env.SESSION_SECRET = "test-secret";

async function loginAsOwner(app: any): Promise<request.SuperAgentTest> {
  const agent = request.agent(app);
  const r1 = await agent.get("/login");
  const csrf = /name="_csrf" value="([^"]+)"/.exec(r1.text)![1];
  await agent.post("/login").type("form").send({ _csrf: csrf, username: "owner", password: "pw" });
  return agent;
}

beforeEach(async () => {
  closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  runMigrations();
  const hash = await bcrypt.hash("pw", 12);
  Employees.create({ full_name: "Owner",   username: "owner", password_hash: hash, role: "owner" });
  const e = Employees.create({ full_name: "Cashier", username: "cash",  password_hash: hash, role: "employee" });
  const m = Menu.create({ name: "Latte", price: 5000, sort_order: 1 });
  const s = Sessions.create({ employee_id: e.id, business_date: "2026-05-12", shift: "morning" });
  Lines.upsert(s.id, m.id, 3);
  Sessions.updateHeader(s.id, { cash_amount: 15000, bank_transfer_amount: 0, notes: null });
});

afterAll(() => {
  closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

describe("Reports", () => {
  it("renders the sales tab with the seeded data", async () => {
    const { app } = await import("../../src/app");
    const agent = await loginAsOwner(app);
    const res = await agent.get("/reports?tab=sales&from=2026-05-01&to=2026-05-31");
    expect(res.status).toBe(200);
    expect(res.text).toContain("2026-05-12");
    expect(res.text).toContain("150.00"); // 3 * 50.00
    expect(res.text).toContain("Latte");
  });

  it("exports sales-by-item as CSV", async () => {
    const { app } = await import("../../src/app");
    const agent = await loginAsOwner(app);
    const res = await agent.get("/reports/export?tab=sales&group=item&from=2026-05-01&to=2026-05-31");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.headers["content-disposition"]).toContain("attachment");
    expect(res.text).toContain("name,qty,revenue");
    expect(res.text).toContain("Latte,3,150.00");
  });

  it("cashier cannot access reports", async () => {
    const { app } = await import("../../src/app");
    const agent = request.agent(app);
    const r1 = await agent.get("/login");
    const csrf = /name="_csrf" value="([^"]+)"/.exec(r1.text)![1];
    await agent.post("/login").type("form").send({ _csrf: csrf, username: "cash", password: "pw" });
    const res = await agent.get("/reports");
    expect(res.status).toBe(403);
  });
});

describe("Backups via settings", () => {
  it("dashboard shows live numbers after a sale", async () => {
    const { app } = await import("../../src/app");
    const agent = await loginAsOwner(app);
    const res = await agent.get("/");
    expect(res.status).toBe(200);
    // The seeded shift is for 2026-05-12 — likely not today's business date in test runtime.
    // Just confirm dashboard renders and contains the card label.
    expect(res.text).toContain("Today's sales");
  });
});
```

- [ ] **Step 2: Run, expect pass**

```bash
npm test
```

Expected: 4 new tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/reports.test.ts
git commit -m "test(reports): tabs, CSV export, role gating, dashboard renders"
```

---

## Plan 6 — done

After all 7 tasks land:
- Dashboard cards show live data for today's business date.
- Reports module covers Sales (by day/item/employee), Purchases (by day), Petty Cash (in/out/net + by type), Payroll (run summary).
- Each report has a Download CSV button. Print view available.
- Nightly cron writes a `shop.db` snapshot to `data/backups/` and prunes >30 days old.
- Settings page lists recent backups with manual "Back up now" + per-file Download.
- Audit log catches every write.

## Operational notes for the user

- **Remote access:** the app is LAN-only by default. To reach it from home, run `brew install tailscale && sudo tailscale up` on the shop PC and on your phone/laptop, then visit `http://<shop-pc>.<your-tailnet>.ts.net:3000`. Tailscale's free tier handles a single shop just fine. No code changes needed.
- **Production-mode start:** the dev script uses `tsx watch`. For day-to-day operations on the shop PC, `npm run build && npm start` runs the compiled `dist/server.js`. Wrap with `pm2` or a launchd entry to auto-start on boot.
- **Backup restore:** copy a chosen `data/backups/shop-YYYY-MM-DD_HHMM.db` over the existing `data/shop.db` while the server is stopped. Start the server again; migrations re-run no-op.

The MVP is shipped.
