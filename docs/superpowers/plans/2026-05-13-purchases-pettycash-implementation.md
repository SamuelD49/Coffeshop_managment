# Plan 4 — Purchases & Petty Cash Implementation Plan

> **For agentic workers:** Per-task subagent dispatch. Each task ends in a commit.

**Goal:** Replace the paper "Purchase Requisition" and "Petty Cash Replenishment" logs with digital equivalents. Both are owner-only flat logs with date filtering, inline-add-row UX, and totals at the bottom. Petty cash additionally computes a running cash-on-hand at render time (no stored running balance — derived per spec).

**Tables already in schema:** `purchase_requisitions` and `petty_cash_entries`. No migration needed.

**Design system rules continue.** No HTMX needed here — plain forms, page redirect after POST. Buna Ledger primitives only.

---

## File map

```
src/
├── models/
│   ├── purchases.ts       # NEW
│   └── pettyCash.ts       # NEW
├── controllers/
│   ├── purchasesController.ts  # NEW
│   └── pettyCashController.ts  # NEW
├── routes/
│   ├── purchases.ts       # NEW
│   └── pettyCash.ts       # NEW
└── views/
    ├── purchases/
    │   ├── list.ejs       # inline add-row at top, log table below
    │   └── edit.ejs       # tiny edit modal/page for a single row
    └── petty-cash/
        ├── list.ejs       # same shape, includes type selector + running balance
        └── edit.ejs
```

---

## Task 1: Purchases model (TDD)

**Files:** `src/models/purchases.ts`, `tests/models/purchases.test.ts`

- [ ] **Step 1: Write tests `tests/models/purchases.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { unlinkSync, existsSync } from "fs";
import { closeDb, runMigrations } from "../../src/lib/db";
import * as Purchases from "../../src/models/purchases";

const TEST_DB = "./data/test-purchases.db";
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

describe("Purchases", () => {
  it("create() inserts and returns the row with computed total", () => {
    const p = Purchases.create({
      purchase_date: "2026-05-12",
      description: "Beans",
      unit: "kg",
      qty: 2,
      unit_price: 100000,
      remark: null,
      entered_by: null,
    });
    expect(p.id).toBeGreaterThan(0);
    expect(p.total).toBe(200000);
  });

  it("findById() and update()", () => {
    const p = Purchases.create({ purchase_date: "2026-05-12", description: "Beans", unit: "kg", qty: 2, unit_price: 100000, remark: null, entered_by: null });
    expect(Purchases.findById(p.id)?.description).toBe("Beans");
    Purchases.update(p.id, { purchase_date: "2026-05-13", description: "Premium beans", unit: "kg", qty: 3, unit_price: 110000, remark: "house blend" });
    const got = Purchases.findById(p.id);
    expect(got?.description).toBe("Premium beans");
    expect(got?.total).toBe(330000);
    expect(got?.remark).toBe("house blend");
  });

  it("listAll() orders by purchase_date desc, id desc", () => {
    Purchases.create({ purchase_date: "2026-05-10", description: "A", unit: null, qty: 1, unit_price: 100, remark: null, entered_by: null });
    Purchases.create({ purchase_date: "2026-05-12", description: "B", unit: null, qty: 1, unit_price: 100, remark: null, entered_by: null });
    Purchases.create({ purchase_date: "2026-05-11", description: "C", unit: null, qty: 1, unit_price: 100, remark: null, entered_by: null });
    expect(Purchases.listAll().map(p => p.description)).toEqual(["B", "C", "A"]);
  });

  it("listAll() filters by date range", () => {
    Purchases.create({ purchase_date: "2026-05-10", description: "A", unit: null, qty: 1, unit_price: 100, remark: null, entered_by: null });
    Purchases.create({ purchase_date: "2026-05-12", description: "B", unit: null, qty: 1, unit_price: 100, remark: null, entered_by: null });
    Purchases.create({ purchase_date: "2026-05-15", description: "C", unit: null, qty: 1, unit_price: 100, remark: null, entered_by: null });
    expect(Purchases.listAll({ from: "2026-05-11", to: "2026-05-13" }).map(p => p.description)).toEqual(["B"]);
  });

  it("remove() deletes a row", () => {
    const p = Purchases.create({ purchase_date: "2026-05-12", description: "X", unit: null, qty: 1, unit_price: 100, remark: null, entered_by: null });
    Purchases.remove(p.id);
    expect(Purchases.findById(p.id)).toBeNull();
  });

  it("sumTotalInRange()", () => {
    Purchases.create({ purchase_date: "2026-05-12", description: "A", unit: null, qty: 2, unit_price: 100, remark: null, entered_by: null });
    Purchases.create({ purchase_date: "2026-05-12", description: "B", unit: null, qty: 1, unit_price: 300, remark: null, entered_by: null });
    Purchases.create({ purchase_date: "2026-05-20", description: "C", unit: null, qty: 1, unit_price: 999, remark: null, entered_by: null });
    expect(Purchases.sumTotalInRange("2026-05-12", "2026-05-12")).toBe(500); // 200 + 300
  });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
npm test -- purchases
```

- [ ] **Step 3: Implement `src/models/purchases.ts`**

```ts
import { getDb } from "../lib/db";

export type Purchase = {
  id: number;
  purchase_date: string;
  description: string;
  unit: string | null;
  qty: number;
  unit_price: number;
  total: number;
  remark: string | null;
  entered_by: number | null;
  created_at: string;
  updated_at: string;
};

export type CreateInput = Omit<Purchase, "id" | "total" | "created_at" | "updated_at">;
export type UpdateInput = Omit<CreateInput, "entered_by">;

export function create(input: CreateInput): Purchase {
  const total = Math.round(input.qty * input.unit_price);
  const r = getDb().prepare(`
    INSERT INTO purchase_requisitions (purchase_date, description, unit, qty, unit_price, total, remark, entered_by)
    VALUES (@purchase_date, @description, @unit, @qty, @unit_price, @total, @remark, @entered_by)
  `).run({ ...input, total });
  return findById(Number(r.lastInsertRowid))!;
}

export function findById(id: number): Purchase | null {
  const r = getDb().prepare("SELECT * FROM purchase_requisitions WHERE id = ?").get(id) as Purchase | undefined;
  return r ?? null;
}

export function update(id: number, input: UpdateInput): void {
  const total = Math.round(input.qty * input.unit_price);
  getDb().prepare(`
    UPDATE purchase_requisitions
    SET purchase_date = @purchase_date, description = @description, unit = @unit,
        qty = @qty, unit_price = @unit_price, total = @total, remark = @remark,
        updated_at = datetime('now')
    WHERE id = @id
  `).run({ ...input, total, id });
}

export function remove(id: number): void {
  getDb().prepare("DELETE FROM purchase_requisitions WHERE id = ?").run(id);
}

export function listAll(filters: { from?: string; to?: string } = {}): Purchase[] {
  const where: string[] = [];
  const params: any = {};
  if (filters.from) { where.push("purchase_date >= @from"); params.from = filters.from; }
  if (filters.to)   { where.push("purchase_date <= @to");   params.to = filters.to; }
  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
  return getDb().prepare(`SELECT * FROM purchase_requisitions ${whereSql} ORDER BY purchase_date DESC, id DESC`).all(params) as Purchase[];
}

export function sumTotalInRange(from: string, to: string): number {
  const r = getDb().prepare("SELECT COALESCE(SUM(total), 0) AS s FROM purchase_requisitions WHERE purchase_date BETWEEN ? AND ?").get(from, to) as { s: number };
  return r.s;
}
```

- [ ] **Step 4: Pass + commit**

```bash
npm test
git add src/models/purchases.ts tests/models/purchases.test.ts
git commit -m "feat(models): purchase requisitions CRUD with auto-total + sum"
```

---

## Task 2: Petty cash model with running balance (TDD)

**Files:** `src/models/pettyCash.ts`, `tests/models/pettyCash.test.ts`

The signed-amount convention (`expense` = -, `refund/replenishment` = +) lives in the model. `listWithBalance()` returns each entry annotated with `running_balance` computed in order.

- [ ] **Step 1: Write tests `tests/models/pettyCash.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { unlinkSync, existsSync } from "fs";
import { closeDb, runMigrations } from "../../src/lib/db";
import * as Petty from "../../src/models/pettyCash";

const TEST_DB = "./data/test-petty.db";
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

describe("PettyCash", () => {
  it("create() and findById()", () => {
    const e = Petty.create({ entry_date: "2026-05-12", description: "Taxi", payer_name: "Sam", amount: 5000, type: "expense", remark: null, entered_by: null });
    expect(e.id).toBeGreaterThan(0);
    expect(Petty.findById(e.id)?.description).toBe("Taxi");
  });

  it("signedAmount() returns + for replenishment/refund, - for expense", () => {
    expect(Petty.signedAmount({ type: "replenishment", amount: 1000 } as any)).toBe(1000);
    expect(Petty.signedAmount({ type: "refund", amount: 500 } as any)).toBe(500);
    expect(Petty.signedAmount({ type: "expense", amount: 200 } as any)).toBe(-200);
  });

  it("listWithBalance() computes a running balance ordered chronologically", () => {
    Petty.create({ entry_date: "2026-05-12", description: "Initial cash",   payer_name: null, amount: 100000, type: "replenishment", remark: null, entered_by: null });
    Petty.create({ entry_date: "2026-05-12", description: "Taxi",           payer_name: null, amount: 5000,   type: "expense",       remark: null, entered_by: null });
    Petty.create({ entry_date: "2026-05-13", description: "Returned coins", payer_name: null, amount: 2000,   type: "refund",        remark: null, entered_by: null });
    Petty.create({ entry_date: "2026-05-13", description: "Snacks",         payer_name: null, amount: 1500,   type: "expense",       remark: null, entered_by: null });

    const rows = Petty.listWithBalance();
    // newest first in display order, but balance computed chronologically:
    expect(rows.map(r => r.running_balance)).toEqual([95500, 97000, 95000, 100000]);
    // rows are returned newest-first
    expect(rows[0].description).toBe("Snacks");
    expect(rows[3].description).toBe("Initial cash");
  });

  it("listWithBalance() filters by date range", () => {
    Petty.create({ entry_date: "2026-05-10", description: "Old", payer_name: null, amount: 1, type: "replenishment", remark: null, entered_by: null });
    Petty.create({ entry_date: "2026-05-12", description: "Mid", payer_name: null, amount: 1, type: "expense", remark: null, entered_by: null });
    Petty.create({ entry_date: "2026-05-15", description: "New", payer_name: null, amount: 1, type: "expense", remark: null, entered_by: null });
    const rows = Petty.listWithBalance({ from: "2026-05-11", to: "2026-05-13" });
    expect(rows.map(r => r.description)).toEqual(["Mid"]);
  });

  it("update() and remove() work", () => {
    const e = Petty.create({ entry_date: "2026-05-12", description: "X", payer_name: null, amount: 500, type: "expense", remark: null, entered_by: null });
    Petty.update(e.id, { entry_date: "2026-05-13", description: "Y", payer_name: "Sam", amount: 700, type: "expense", remark: "updated" });
    const got = Petty.findById(e.id);
    expect(got?.description).toBe("Y");
    expect(got?.amount).toBe(700);
    Petty.remove(e.id);
    expect(Petty.findById(e.id)).toBeNull();
  });

  it("currentBalance() returns the total signed sum", () => {
    Petty.create({ entry_date: "2026-05-12", description: "in",  payer_name: null, amount: 10000, type: "replenishment", remark: null, entered_by: null });
    Petty.create({ entry_date: "2026-05-12", description: "out", payer_name: null, amount: 3000,  type: "expense",       remark: null, entered_by: null });
    expect(Petty.currentBalance()).toBe(7000);
  });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
npm test -- petty
```

- [ ] **Step 3: Implement `src/models/pettyCash.ts`**

```ts
import { getDb } from "../lib/db";

export type PettyType = "expense" | "refund" | "replenishment";

export type PettyEntry = {
  id: number;
  entry_date: string;
  description: string;
  payer_name: string | null;
  amount: number;
  type: PettyType;
  remark: string | null;
  entered_by: number | null;
  created_at: string;
  updated_at: string;
};

export type PettyEntryWithBalance = PettyEntry & { running_balance: number };

export type CreateInput = Omit<PettyEntry, "id" | "created_at" | "updated_at">;
export type UpdateInput = Omit<CreateInput, "entered_by">;

export function signedAmount(e: Pick<PettyEntry, "amount" | "type">): number {
  return e.type === "expense" ? -e.amount : e.amount;
}

export function create(input: CreateInput): PettyEntry {
  const r = getDb().prepare(`
    INSERT INTO petty_cash_entries (entry_date, description, payer_name, amount, type, remark, entered_by)
    VALUES (@entry_date, @description, @payer_name, @amount, @type, @remark, @entered_by)
  `).run(input);
  return findById(Number(r.lastInsertRowid))!;
}

export function findById(id: number): PettyEntry | null {
  const r = getDb().prepare("SELECT * FROM petty_cash_entries WHERE id = ?").get(id) as PettyEntry | undefined;
  return r ?? null;
}

export function update(id: number, input: UpdateInput): void {
  getDb().prepare(`
    UPDATE petty_cash_entries
    SET entry_date = @entry_date, description = @description, payer_name = @payer_name,
        amount = @amount, type = @type, remark = @remark, updated_at = datetime('now')
    WHERE id = @id
  `).run({ ...input, id });
}

export function remove(id: number): void {
  getDb().prepare("DELETE FROM petty_cash_entries WHERE id = ?").run(id);
}

// Returns rows newest-first, but with running_balance computed chronologically
// (each row's running_balance is the cumulative signed sum at and including that row's date/id).
export function listWithBalance(filters: { from?: string; to?: string } = {}): PettyEntryWithBalance[] {
  const where: string[] = [];
  const params: any = {};
  if (filters.from) { where.push("entry_date >= @from"); params.from = filters.from; }
  if (filters.to)   { where.push("entry_date <= @to");   params.to = filters.to; }
  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";

  // Fetch chronologically to build the balance, then reverse for display.
  const asc = getDb().prepare(`SELECT * FROM petty_cash_entries ${whereSql} ORDER BY entry_date ASC, id ASC`).all(params) as PettyEntry[];
  let bal = 0;
  const annotated: PettyEntryWithBalance[] = asc.map(row => {
    bal += signedAmount(row);
    return { ...row, running_balance: bal };
  });
  return annotated.reverse();
}

export function currentBalance(): number {
  const r = getDb().prepare(`
    SELECT COALESCE(SUM(CASE WHEN type = 'expense' THEN -amount ELSE amount END), 0) AS bal
    FROM petty_cash_entries
  `).get() as { bal: number };
  return r.bal;
}
```

- [ ] **Step 4: Pass + commit**

```bash
npm test
git add src/models/pettyCash.ts tests/models/pettyCash.test.ts
git commit -m "feat(models): petty cash entries with chronological running balance"
```

---

## Task 3: Purchases controller + router + list page

**Files:** `src/routes/purchases.ts`, `src/routes/index.ts` (mount), `src/controllers/purchasesController.ts`, `src/views/purchases/list.ejs`, `src/views/purchases/edit.ejs`

- [ ] **Step 1: Create `src/routes/purchases.ts`**

```ts
import { Router } from "express";
import * as Ctrl from "../controllers/purchasesController";
import { requireAuth } from "../middleware/requireAuth";
import { requireOwner } from "../middleware/requireOwner";

export const purchasesRouter = Router();
purchasesRouter.use(requireAuth, requireOwner);

purchasesRouter.get("/",            Ctrl.list);
purchasesRouter.post("/",           Ctrl.create);
purchasesRouter.get("/:id/edit",    Ctrl.showEdit);
purchasesRouter.post("/:id",        Ctrl.update);
purchasesRouter.post("/:id/delete", Ctrl.remove);
```

- [ ] **Step 2: Mount in `src/routes/index.ts`**

```ts
import { purchasesRouter } from "./purchases";
// ...
router.use("/purchases", purchasesRouter);
```

- [ ] **Step 3: Create `src/controllers/purchasesController.ts`**

```ts
import type { Request, Response } from "express";
import * as Purchases from "../models/purchases";
import { writeAudit } from "../lib/audit";
import { pushFlash } from "../lib/flash";
import { todayBusinessDate } from "../lib/dates";
import * as Settings from "../models/settings";

function actor(req: Request): number | null { return req.session.employeeId ?? null; }

function parseMajor(v: unknown): number {
  const n = Number(String(v ?? "0"));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function todayDate(): string {
  return todayBusinessDate(Settings.get("business_day_cutoff") ?? "00:00", Settings.get("timezone") ?? "Africa/Addis_Ababa");
}

export function list(req: Request, res: Response) {
  const filters: { from?: string; to?: string } = {};
  if (req.query.from) filters.from = String(req.query.from);
  if (req.query.to)   filters.to   = String(req.query.to);
  const purchases = Purchases.listAll(filters);
  const sumTotal = purchases.reduce((acc, p) => acc + p.total, 0);
  res.render("purchases/list", { purchases, filters, sumTotal, today: todayDate() });
}

export function create(req: Request, res: Response) {
  const description = (req.body.description ?? "").toString().trim();
  if (!description) {
    pushFlash(req, "error", "Description is required");
    return res.redirect("/purchases");
  }
  const purchase_date = (req.body.purchase_date ?? todayDate()).toString();
  const qty = Number(req.body.qty || 0);
  const p = Purchases.create({
    purchase_date,
    description,
    unit: (req.body.unit || null) as string | null,
    qty: Number.isFinite(qty) ? qty : 0,
    unit_price: parseMajor(req.body.unit_price),
    remark: (req.body.remark || null) as string | null,
    entered_by: actor(req),
  });
  writeAudit({ actor_id: actor(req), action: "create_purchase", entity: "purchase_requisitions", entity_id: p.id });
  pushFlash(req, "success", "Purchase logged");
  res.redirect("/purchases");
}

export function showEdit(req: Request, res: Response) {
  const p = Purchases.findById(Number(req.params.id));
  if (!p) return res.status(404).render("errors/404");
  res.render("purchases/edit", { purchase: p });
}

export function update(req: Request, res: Response) {
  const id = Number(req.params.id);
  const p = Purchases.findById(id);
  if (!p) return res.status(404).render("errors/404");
  Purchases.update(id, {
    purchase_date: (req.body.purchase_date || p.purchase_date).toString(),
    description: (req.body.description || p.description).toString(),
    unit: (req.body.unit || null) as string | null,
    qty: Number(req.body.qty || 0),
    unit_price: parseMajor(req.body.unit_price),
    remark: (req.body.remark || null) as string | null,
  });
  writeAudit({ actor_id: actor(req), action: "update_purchase", entity: "purchase_requisitions", entity_id: id });
  pushFlash(req, "success", "Purchase updated");
  res.redirect("/purchases");
}

export function remove(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Purchases.findById(id)) return res.status(404).render("errors/404");
  Purchases.remove(id);
  writeAudit({ actor_id: actor(req), action: "delete_purchase", entity: "purchase_requisitions", entity_id: id });
  pushFlash(req, "success", "Purchase removed");
  res.redirect("/purchases");
}
```

- [ ] **Step 4: Create `src/views/purchases/list.ejs`**

```ejs
<%- include('../partials/head', { title: 'Purchases', shopName }) %>
<body class="text-ink font-sans antialiased min-h-screen flex">
  <%- include('../partials/sidebar', { shopName, currentRole, currentUser, csrfToken, currentPath }) %>

  <main class="flex-1 px-air-lg pt-chapter pb-air-lg max-w-5xl">
    <header class="reveal reveal-1">
      <p class="font-mono text-[12px] tracking-smallcaps uppercase text-smoke">Outgoing</p>
      <h1 class="font-display text-[36px] leading-[42px] text-ink mt-gutter-tight" style="font-variation-settings:'opsz' 72,'SOFT' 50">Purchases</h1>
    </header>

    <div class="reveal reveal-2"><%- include('../partials/ornament') %></div>

    <form method="GET" class="flex items-end gap-gutter mb-air">
      <label class="block">
        <span class="field-label">From</span>
        <input type="date" name="from" value="<%= filters.from || '' %>" class="field-input field-mono" />
      </label>
      <label class="block">
        <span class="field-label">To</span>
        <input type="date" name="to" value="<%= filters.to || '' %>" class="field-input field-mono" />
      </label>
      <button class="btn-secondary">Filter</button>
    </form>

    <%- include('../partials/flash', { flash }) %>

    <form method="POST" action="/purchases" class="reveal reveal-3 card mb-air">
      <input type="hidden" name="_csrf" value="<%= csrfToken %>" />
      <header class="card-header">
        <h2 class="card-title">Log a purchase</h2>
        <p class="card-meta">Inline add — date defaults to today</p>
      </header>
      <div class="card-body grid grid-cols-6 gap-gutter">
        <label class="col-span-2">
          <span class="field-label">Date</span>
          <input type="date" name="purchase_date" value="<%= today %>" required class="field-input field-mono" />
        </label>
        <label class="col-span-3">
          <span class="field-label">Description</span>
          <input name="description" required class="field-input" placeholder="Beans, milk, sugar..." />
        </label>
        <label>
          <span class="field-label">Unit</span>
          <input name="unit" class="field-input field-mono" placeholder="kg, L" />
        </label>
        <label>
          <span class="field-label">Qty</span>
          <input name="qty" required class="field-input field-mono" placeholder="0" />
        </label>
        <label>
          <span class="field-label">Unit price</span>
          <input name="unit_price" required class="field-input field-mono" placeholder="0.00" />
        </label>
        <label class="col-span-3">
          <span class="field-label">Remark</span>
          <input name="remark" class="field-input" />
        </label>
        <div class="col-span-1 flex items-end justify-end">
          <button class="btn-primary w-full">Add</button>
        </div>
      </div>
    </form>

    <% if (purchases.length === 0) { %>
      <div class="card">
        <div class="card-body text-center py-air">
          <p class="font-display italic text-[20px] text-coal" style="font-variation-settings:'opsz' 24,'SOFT' 50">No purchases match.</p>
        </div>
      </div>
    <% } else { %>
      <div class="card">
        <table class="w-full">
          <thead>
            <tr class="border-b border-rule">
              <th class="text-left font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke px-gutter-lg py-gutter">Date</th>
              <th class="text-left font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke py-gutter">Description</th>
              <th class="text-left font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke py-gutter">Unit</th>
              <th class="text-right font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke py-gutter">Qty</th>
              <th class="text-right font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke py-gutter">Unit price</th>
              <th class="text-right font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke py-gutter">Total</th>
              <th class="text-left font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke py-gutter pl-gutter-lg">Remark</th>
              <th class="px-gutter-lg"></th>
            </tr>
          </thead>
          <tbody>
            <% purchases.forEach(p => { %>
              <tr class="border-b border-rule last:border-0 hover:bg-paper transition-colors">
                <td class="px-gutter-lg py-gutter font-mono text-[13px] text-coal"><%= p.purchase_date %></td>
                <td class="py-gutter font-sans text-[14px] text-ink"><%= p.description %></td>
                <td class="py-gutter font-mono text-[13px] text-smoke"><%= p.unit || '—' %></td>
                <td class="py-gutter text-right font-mono text-[13px] text-coal"><%= p.qty %></td>
                <td class="py-gutter text-right font-mono text-[13px] text-coal"><%= (p.unit_price / 100).toFixed(2) %></td>
                <td class="py-gutter text-right font-mono text-[14px] text-ink"><%= (p.total / 100).toFixed(2) %></td>
                <td class="py-gutter pl-gutter-lg font-sans text-[13px] text-smoke truncate max-w-[200px]"><%= p.remark || '' %></td>
                <td class="px-gutter-lg py-gutter text-right whitespace-nowrap">
                  <a href="/purchases/<%= p.id %>/edit" class="font-sans text-[12px] tracking-smallcaps uppercase text-ember hover:text-ember-deep transition-colors mr-gutter">Edit</a>
                  <form method="POST" action="/purchases/<%= p.id %>/delete" onsubmit="return confirm('Delete this row?')" class="inline">
                    <input type="hidden" name="_csrf" value="<%= csrfToken %>" />
                    <button class="font-sans text-[12px] tracking-smallcaps uppercase text-crimson hover:text-ember-deep transition-colors">Delete</button>
                  </form>
                </td>
              </tr>
            <% }) %>
          </tbody>
          <tfoot>
            <tr class="border-t-2 border-rule-strong bg-paper">
              <td colspan="5" class="px-gutter-lg py-gutter-lg text-right font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke">Total</td>
              <td class="py-gutter-lg text-right font-mono text-[18px] text-ink"><%= (sumTotal / 100).toFixed(2) %></td>
              <td colspan="2"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    <% } %>
  </main>
</body>
</html>
```

- [ ] **Step 5: Create `src/views/purchases/edit.ejs`**

```ejs
<%- include('../partials/head', { title: 'Edit purchase', shopName }) %>
<body class="text-ink font-sans antialiased min-h-screen flex">
  <%- include('../partials/sidebar', { shopName, currentRole, currentUser, csrfToken, currentPath }) %>
  <main class="flex-1 px-air-lg pt-chapter pb-air-lg max-w-2xl">
    <header class="reveal reveal-1">
      <p class="font-mono text-[12px] tracking-smallcaps uppercase text-smoke">
        <a href="/purchases" class="hover:text-ink transition-colors">Purchases</a> · Edit
      </p>
      <h1 class="font-display text-[36px] leading-[42px] text-ink mt-gutter-tight" style="font-variation-settings:'opsz' 72,'SOFT' 50"><%= purchase.description %></h1>
    </header>

    <div class="reveal reveal-2"><%- include('../partials/ornament') %></div>

    <%- include('../partials/flash', { flash }) %>

    <form method="POST" action="/purchases/<%= purchase.id %>" class="reveal reveal-3 card">
      <input type="hidden" name="_csrf" value="<%= csrfToken %>" />
      <div class="card-body grid grid-cols-2 gap-x-air gap-y-gutter-lg">
        <label class="block">
          <span class="field-label">Date</span>
          <input type="date" name="purchase_date" value="<%= purchase.purchase_date %>" class="field-input field-mono" />
        </label>
        <label class="block">
          <span class="field-label">Unit</span>
          <input name="unit" value="<%= purchase.unit || '' %>" class="field-input field-mono" />
        </label>
        <label class="block col-span-2">
          <span class="field-label">Description</span>
          <input name="description" required value="<%= purchase.description %>" class="field-input" />
        </label>
        <label class="block">
          <span class="field-label">Qty</span>
          <input name="qty" value="<%= purchase.qty %>" class="field-input field-mono" />
        </label>
        <label class="block">
          <span class="field-label">Unit price</span>
          <input name="unit_price" value="<%= (purchase.unit_price / 100).toFixed(2) %>" class="field-input field-mono" />
        </label>
        <label class="block col-span-2">
          <span class="field-label">Remark</span>
          <input name="remark" value="<%= purchase.remark || '' %>" class="field-input" />
        </label>
      </div>
      <div class="px-gutter-lg pb-gutter-lg flex items-center justify-end gap-gutter">
        <a href="/purchases" class="btn-secondary">Cancel</a>
        <button class="btn-primary">Save changes</button>
      </div>
    </form>
  </main>
</body>
</html>
```

- [ ] **Step 6: Build + commit**

```bash
npm run build && npm run css:build
git add src/routes/purchases.ts src/routes/index.ts src/controllers/purchasesController.ts src/views/purchases/
git commit -m "feat(purchases): list page with inline add, edit, delete"
```

---

## Task 4: Petty cash controller + router + list page

**Files:** `src/routes/pettyCash.ts`, `src/routes/index.ts` (mount), `src/controllers/pettyCashController.ts`, `src/views/petty-cash/list.ejs`, `src/views/petty-cash/edit.ejs`

Mirrors the purchases shape but adds a `type` selector (expense / refund / replenishment), running cash-on-hand column, and a "Current balance" header card.

- [ ] **Step 1: Create `src/routes/pettyCash.ts`**

```ts
import { Router } from "express";
import * as Ctrl from "../controllers/pettyCashController";
import { requireAuth } from "../middleware/requireAuth";
import { requireOwner } from "../middleware/requireOwner";

export const pettyCashRouter = Router();
pettyCashRouter.use(requireAuth, requireOwner);

pettyCashRouter.get("/",            Ctrl.list);
pettyCashRouter.post("/",           Ctrl.create);
pettyCashRouter.get("/:id/edit",    Ctrl.showEdit);
pettyCashRouter.post("/:id",        Ctrl.update);
pettyCashRouter.post("/:id/delete", Ctrl.remove);
```

- [ ] **Step 2: Mount in `src/routes/index.ts`**

```ts
import { pettyCashRouter } from "./pettyCash";
router.use("/petty-cash", pettyCashRouter);
```

- [ ] **Step 3: Create `src/controllers/pettyCashController.ts`**

```ts
import type { Request, Response } from "express";
import * as Petty from "../models/pettyCash";
import * as Settings from "../models/settings";
import { writeAudit } from "../lib/audit";
import { pushFlash } from "../lib/flash";
import { todayBusinessDate } from "../lib/dates";

function actor(req: Request): number | null { return req.session.employeeId ?? null; }

function parseMajor(v: unknown): number {
  const n = Number(String(v ?? "0"));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function todayDate(): string {
  return todayBusinessDate(Settings.get("business_day_cutoff") ?? "00:00", Settings.get("timezone") ?? "Africa/Addis_Ababa");
}

function safeType(input: unknown): Petty.PettyType {
  return input === "expense" || input === "refund" || input === "replenishment" ? input : "expense";
}

export function list(req: Request, res: Response) {
  const filters: { from?: string; to?: string } = {};
  if (req.query.from) filters.from = String(req.query.from);
  if (req.query.to)   filters.to   = String(req.query.to);
  const entries = Petty.listWithBalance(filters);
  const balance = Petty.currentBalance();
  res.render("petty-cash/list", { entries, balance, filters, today: todayDate() });
}

export function create(req: Request, res: Response) {
  const description = (req.body.description ?? "").toString().trim();
  if (!description) {
    pushFlash(req, "error", "Description is required");
    return res.redirect("/petty-cash");
  }
  const e = Petty.create({
    entry_date: (req.body.entry_date ?? todayDate()).toString(),
    description,
    payer_name: (req.body.payer_name || null) as string | null,
    amount: parseMajor(req.body.amount),
    type: safeType(req.body.type),
    remark: (req.body.remark || null) as string | null,
    entered_by: actor(req),
  });
  writeAudit({ actor_id: actor(req), action: "create_petty_cash", entity: "petty_cash_entries", entity_id: e.id });
  pushFlash(req, "success", "Petty cash entry logged");
  res.redirect("/petty-cash");
}

export function showEdit(req: Request, res: Response) {
  const e = Petty.findById(Number(req.params.id));
  if (!e) return res.status(404).render("errors/404");
  res.render("petty-cash/edit", { entry: e });
}

export function update(req: Request, res: Response) {
  const id = Number(req.params.id);
  const e = Petty.findById(id);
  if (!e) return res.status(404).render("errors/404");
  Petty.update(id, {
    entry_date: (req.body.entry_date || e.entry_date).toString(),
    description: (req.body.description || e.description).toString(),
    payer_name: (req.body.payer_name || null) as string | null,
    amount: parseMajor(req.body.amount),
    type: safeType(req.body.type),
    remark: (req.body.remark || null) as string | null,
  });
  writeAudit({ actor_id: actor(req), action: "update_petty_cash", entity: "petty_cash_entries", entity_id: id });
  pushFlash(req, "success", "Entry updated");
  res.redirect("/petty-cash");
}

export function remove(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Petty.findById(id)) return res.status(404).render("errors/404");
  Petty.remove(id);
  writeAudit({ actor_id: actor(req), action: "delete_petty_cash", entity: "petty_cash_entries", entity_id: id });
  pushFlash(req, "success", "Entry removed");
  res.redirect("/petty-cash");
}
```

- [ ] **Step 4: Create `src/views/petty-cash/list.ejs`**

```ejs
<%- include('../partials/head', { title: 'Petty cash', shopName }) %>
<body class="text-ink font-sans antialiased min-h-screen flex">
  <%- include('../partials/sidebar', { shopName, currentRole, currentUser, csrfToken, currentPath }) %>

  <main class="flex-1 px-air-lg pt-chapter pb-air-lg max-w-5xl">
    <header class="reveal reveal-1 flex items-end justify-between">
      <div>
        <p class="font-mono text-[12px] tracking-smallcaps uppercase text-smoke">Cash on hand</p>
        <h1 class="font-display text-[36px] leading-[42px] text-ink mt-gutter-tight" style="font-variation-settings:'opsz' 72,'SOFT' 50">Petty cash</h1>
      </div>
      <div class="text-right">
        <p class="font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke">Current balance</p>
        <p class="font-mono text-[28px] mt-1 <%= balance < 0 ? 'text-crimson' : 'text-ink' %>"><%= (balance / 100).toFixed(2) %></p>
      </div>
    </header>

    <div class="reveal reveal-2"><%- include('../partials/ornament') %></div>

    <form method="GET" class="flex items-end gap-gutter mb-air">
      <label class="block">
        <span class="field-label">From</span>
        <input type="date" name="from" value="<%= filters.from || '' %>" class="field-input field-mono" />
      </label>
      <label class="block">
        <span class="field-label">To</span>
        <input type="date" name="to" value="<%= filters.to || '' %>" class="field-input field-mono" />
      </label>
      <button class="btn-secondary">Filter</button>
    </form>

    <%- include('../partials/flash', { flash }) %>

    <form method="POST" action="/petty-cash" class="reveal reveal-3 card mb-air">
      <input type="hidden" name="_csrf" value="<%= csrfToken %>" />
      <header class="card-header">
        <h2 class="card-title">Log a movement</h2>
        <p class="card-meta">Expense subtracts, refund and replenishment add</p>
      </header>
      <div class="card-body grid grid-cols-6 gap-gutter">
        <label class="col-span-2">
          <span class="field-label">Date</span>
          <input type="date" name="entry_date" value="<%= today %>" required class="field-input field-mono" />
        </label>
        <label class="col-span-2">
          <span class="field-label">Type</span>
          <select name="type" class="field-input">
            <option value="expense">Expense</option>
            <option value="refund">Refund</option>
            <option value="replenishment">Replenishment</option>
          </select>
        </label>
        <label class="col-span-2">
          <span class="field-label">Amount</span>
          <input name="amount" required class="field-input field-mono" placeholder="0.00" />
        </label>
        <label class="col-span-3">
          <span class="field-label">Description</span>
          <input name="description" required class="field-input" placeholder="What was this for?" />
        </label>
        <label class="col-span-2">
          <span class="field-label">Payer</span>
          <input name="payer_name" class="field-input" placeholder="Who paid / received?" />
        </label>
        <div class="col-span-1 flex items-end justify-end">
          <button class="btn-primary w-full">Add</button>
        </div>
        <label class="col-span-6">
          <span class="field-label">Remark</span>
          <input name="remark" class="field-input" />
        </label>
      </div>
    </form>

    <% if (entries.length === 0) { %>
      <div class="card">
        <div class="card-body text-center py-air">
          <p class="font-display italic text-[20px] text-coal" style="font-variation-settings:'opsz' 24,'SOFT' 50">No entries match.</p>
        </div>
      </div>
    <% } else { %>
      <div class="card">
        <table class="w-full">
          <thead>
            <tr class="border-b border-rule">
              <th class="text-left font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke px-gutter-lg py-gutter">Date</th>
              <th class="text-left font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke py-gutter">Type</th>
              <th class="text-left font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke py-gutter">Description</th>
              <th class="text-left font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke py-gutter">Payer</th>
              <th class="text-right font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke py-gutter">Amount</th>
              <th class="text-right font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke py-gutter">Balance</th>
              <th class="px-gutter-lg"></th>
            </tr>
          </thead>
          <tbody>
            <% entries.forEach(e => {
                 const sign = e.type === 'expense' ? -1 : 1;
                 const signed = (sign * e.amount) / 100;
            %>
              <tr class="border-b border-rule last:border-0 hover:bg-paper transition-colors">
                <td class="px-gutter-lg py-gutter font-mono text-[13px] text-coal"><%= e.entry_date %></td>
                <td class="py-gutter">
                  <% if (e.type === 'expense') { %>
                    <span class="pip pip-draft">Expense</span>
                  <% } else if (e.type === 'refund') { %>
                    <span class="pip pip-open">Refund</span>
                  <% } else { %>
                    <span class="pip pip-approved">Replenishment</span>
                  <% } %>
                </td>
                <td class="py-gutter font-sans text-[14px] text-ink"><%= e.description %></td>
                <td class="py-gutter font-sans text-[13px] text-smoke"><%= e.payer_name || '—' %></td>
                <td class="py-gutter text-right font-mono text-[14px] <%= sign < 0 ? 'text-crimson' : 'text-leaf' %>">
                  <%= sign > 0 ? '+' : '' %><%= signed.toFixed(2) %>
                </td>
                <td class="py-gutter text-right font-mono text-[13px] text-coal"><%= (e.running_balance / 100).toFixed(2) %></td>
                <td class="px-gutter-lg py-gutter text-right whitespace-nowrap">
                  <a href="/petty-cash/<%= e.id %>/edit" class="font-sans text-[12px] tracking-smallcaps uppercase text-ember hover:text-ember-deep transition-colors mr-gutter">Edit</a>
                  <form method="POST" action="/petty-cash/<%= e.id %>/delete" onsubmit="return confirm('Delete this row?')" class="inline">
                    <input type="hidden" name="_csrf" value="<%= csrfToken %>" />
                    <button class="font-sans text-[12px] tracking-smallcaps uppercase text-crimson hover:text-ember-deep transition-colors">Delete</button>
                  </form>
                </td>
              </tr>
            <% }) %>
          </tbody>
        </table>
      </div>
    <% } %>
  </main>
</body>
</html>
```

- [ ] **Step 5: Create `src/views/petty-cash/edit.ejs`**

```ejs
<%- include('../partials/head', { title: 'Edit petty cash entry', shopName }) %>
<body class="text-ink font-sans antialiased min-h-screen flex">
  <%- include('../partials/sidebar', { shopName, currentRole, currentUser, csrfToken, currentPath }) %>
  <main class="flex-1 px-air-lg pt-chapter pb-air-lg max-w-2xl">
    <header class="reveal reveal-1">
      <p class="font-mono text-[12px] tracking-smallcaps uppercase text-smoke">
        <a href="/petty-cash" class="hover:text-ink transition-colors">Petty cash</a> · Edit
      </p>
      <h1 class="font-display text-[36px] leading-[42px] text-ink mt-gutter-tight" style="font-variation-settings:'opsz' 72,'SOFT' 50"><%= entry.description %></h1>
    </header>

    <div class="reveal reveal-2"><%- include('../partials/ornament') %></div>

    <%- include('../partials/flash', { flash }) %>

    <form method="POST" action="/petty-cash/<%= entry.id %>" class="reveal reveal-3 card">
      <input type="hidden" name="_csrf" value="<%= csrfToken %>" />
      <div class="card-body grid grid-cols-2 gap-x-air gap-y-gutter-lg">
        <label class="block">
          <span class="field-label">Date</span>
          <input type="date" name="entry_date" value="<%= entry.entry_date %>" class="field-input field-mono" />
        </label>
        <label class="block">
          <span class="field-label">Type</span>
          <select name="type" class="field-input">
            <% ['expense', 'refund', 'replenishment'].forEach(t => { %>
              <option value="<%= t %>" <%= entry.type === t ? 'selected' : '' %>><%= t.charAt(0).toUpperCase() + t.slice(1) %></option>
            <% }) %>
          </select>
        </label>
        <label class="block col-span-2">
          <span class="field-label">Description</span>
          <input name="description" required value="<%= entry.description %>" class="field-input" />
        </label>
        <label class="block">
          <span class="field-label">Payer</span>
          <input name="payer_name" value="<%= entry.payer_name || '' %>" class="field-input" />
        </label>
        <label class="block">
          <span class="field-label">Amount</span>
          <input name="amount" value="<%= (entry.amount / 100).toFixed(2) %>" class="field-input field-mono" />
        </label>
        <label class="block col-span-2">
          <span class="field-label">Remark</span>
          <input name="remark" value="<%= entry.remark || '' %>" class="field-input" />
        </label>
      </div>
      <div class="px-gutter-lg pb-gutter-lg flex items-center justify-end gap-gutter">
        <a href="/petty-cash" class="btn-secondary">Cancel</a>
        <button class="btn-primary">Save changes</button>
      </div>
    </form>
  </main>
</body>
</html>
```

- [ ] **Step 6: Build + commit**

```bash
npm run build && npm run css:build
git add src/routes/pettyCash.ts src/routes/index.ts src/controllers/pettyCashController.ts src/views/petty-cash/
git commit -m "feat(petty-cash): list with running balance + inline add"
```

---

## Task 5: Integration tests

**Files:** `tests/integration/purchases-pettycash.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { unlinkSync, existsSync } from "fs";
import { closeDb, runMigrations } from "../../src/lib/db";
import * as Employees from "../../src/models/employees";
import * as Purchases from "../../src/models/purchases";
import * as Petty from "../../src/models/pettyCash";

const TEST_DB = "./data/test-purch-petty.db";
process.env.DB_PATH = TEST_DB;
process.env.SESSION_SECRET = "test-secret";

async function loginAs(app: any, u: string, p: string): Promise<request.SuperAgentTest> {
  const agent = request.agent(app);
  const r1 = await agent.get("/login");
  const csrf = /name="_csrf" value="([^"]+)"/.exec(r1.text)![1];
  await agent.post("/login").type("form").send({ _csrf: csrf, username: u, password: p });
  return agent;
}

async function csrfFrom(agent: any, path: string): Promise<string> {
  const r = await agent.get(path);
  return /name="_csrf" value="([^"]+)"/.exec(r.text)![1];
}

beforeEach(async () => {
  closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  runMigrations();
  const hash = await bcrypt.hash("pw", 12);
  Employees.create({ full_name: "Owner",   username: "owner", password_hash: hash, role: "owner" });
  Employees.create({ full_name: "Cashier", username: "cash",  password_hash: hash, role: "employee" });
});

afterAll(() => {
  closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

describe("Purchases", () => {
  it("owner can add a purchase via the inline form", async () => {
    const { app } = await import("../../src/app");
    const agent = await loginAs(app, "owner", "pw");
    const csrf = await csrfFrom(agent, "/purchases");
    const res = await agent.post("/purchases").type("form").send({
      _csrf: csrf, purchase_date: "2026-05-12", description: "Beans", unit: "kg", qty: "2", unit_price: "100.00", remark: "",
    });
    expect(res.status).toBe(302);
    const list = await agent.get("/purchases");
    expect(list.text).toContain("Beans");
    expect(list.text).toContain("200.00"); // 2 kg * 100.00
  });

  it("cashier cannot reach /purchases", async () => {
    const { app } = await import("../../src/app");
    const agent = await loginAs(app, "cash", "pw");
    const res = await agent.get("/purchases");
    expect(res.status).toBe(403);
  });

  it("update + delete cycle", async () => {
    const { app } = await import("../../src/app");
    const agent = await loginAs(app, "owner", "pw");
    const p = Purchases.create({ purchase_date: "2026-05-12", description: "X", unit: null, qty: 1, unit_price: 10000, remark: null, entered_by: null });
    let csrf = await csrfFrom(agent, `/purchases/${p.id}/edit`);
    await agent.post(`/purchases/${p.id}`).type("form").send({
      _csrf: csrf, purchase_date: "2026-05-13", description: "Y", unit: "kg", qty: "3", unit_price: "50.00", remark: "",
    });
    expect(Purchases.findById(p.id)?.description).toBe("Y");
    csrf = await csrfFrom(agent, "/purchases");
    await agent.post(`/purchases/${p.id}/delete`).type("form").send({ _csrf: csrf });
    expect(Purchases.findById(p.id)).toBeNull();
  });
});

describe("Petty cash", () => {
  it("running balance reflects entries by date", async () => {
    const { app } = await import("../../src/app");
    const agent = await loginAs(app, "owner", "pw");
    let csrf = await csrfFrom(agent, "/petty-cash");
    await agent.post("/petty-cash").type("form").send({ _csrf: csrf, entry_date: "2026-05-12", type: "replenishment", amount: "1000.00", description: "Initial", payer_name: "Sam", remark: "" });
    csrf = await csrfFrom(agent, "/petty-cash");
    await agent.post("/petty-cash").type("form").send({ _csrf: csrf, entry_date: "2026-05-12", type: "expense", amount: "50.00", description: "Taxi", payer_name: "", remark: "" });
    const list = await agent.get("/petty-cash");
    expect(list.text).toContain("Initial");
    expect(list.text).toContain("Taxi");
    expect(Petty.currentBalance()).toBe(95000); // 100000 - 5000
  });

  it("cashier cannot reach /petty-cash", async () => {
    const { app } = await import("../../src/app");
    const agent = await loginAs(app, "cash", "pw");
    const res = await agent.get("/petty-cash");
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run, expect pass**

```bash
npm test
```

Expected: 5 new tests pass. Cumulative ~83.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/purchases-pettycash.test.ts
git commit -m "test(purchases,petty-cash): role-gated CRUD + running balance"
```

---

## Plan 4 — done

After all 5 tasks land:
- Owner logs purchase requisitions with an inline-add-row form; total auto-computes from qty × unit price; date-range filter; edit + delete per row; footer shows sum.
- Owner logs petty cash movements (expense/refund/replenishment) with running cash-on-hand visible per row + current balance card at the top.
- Both pages 403 for cashiers.
- Test coverage grows by ~16 (model + integration).

**Next:** Plan 5 (Payroll) — the monthly run with snapshotted rates + PDF print.
