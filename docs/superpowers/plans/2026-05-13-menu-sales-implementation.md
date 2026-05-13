# Plan 3 — Menu & Sales Implementation Plan

> **For agentic workers:** Per-task subagent dispatch. Each task ends in a commit.

**Goal:** Make the cashier flow from the original paper "Daily Sales Income" form fully usable. Owner manages the menu (CRUD, reorder, activate/deactivate). Cashier (or owner) starts a shift, types qty against pre-rendered menu rows, sees live totals update as they type, fills in cash/bank/notes, closes the shift. Owner can view all shifts; cashier sees only their own.

**Design system rules:** continue applying Buna Ledger. The sales-entry table is the most distinctive screen in the app — generous row height, mono numbers, ember-flash on totals when they update.

**HTMX usage:** Tiny — qty inputs `hx-post` to a partial-update endpoint that returns the updated row totals + footer totals. The flash class `.num-flash` is already defined in CSS.

---

## File map

```
src/
├── models/
│   ├── menuItems.ts       # NEW
│   ├── salesSessions.ts   # NEW (with computed totals)
│   └── saleLineItems.ts   # NEW
├── controllers/
│   ├── menuController.ts  # NEW
│   └── salesController.ts # NEW
├── routes/
│   ├── menu.ts            # NEW
│   └── sales.ts           # NEW
└── views/
    ├── menu/
    │   ├── list.ejs
    │   ├── new.ejs
    │   └── edit.ejs
    └── sales/
        ├── list.ejs
        ├── new.ejs       # tiny: pick shift label + business_date
        ├── entry.ejs     # the big one — menu rows, qty inputs, live totals
        ├── _row.ejs      # partial returned by HTMX for one updated line row
        └── _totals.ejs   # partial returned by HTMX for the footer totals
```

---

## Task 1: Menu items model (TDD)

**Files:** `src/models/menuItems.ts`, `tests/models/menuItems.test.ts`

- [ ] **Step 1: Write tests `tests/models/menuItems.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { unlinkSync, existsSync } from "fs";
import { closeDb, runMigrations } from "../../src/lib/db";
import * as Menu from "../../src/models/menuItems";

const TEST_DB = "./data/test-menu.db";
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

describe("MenuItems", () => {
  it("create() and findById()", () => {
    const m = Menu.create({ name: "Macchiato", price: 4500, sort_order: 1 });
    expect(m.id).toBeGreaterThan(0);
    expect(m.name).toBe("Macchiato");
    expect(m.price).toBe(4500);
    expect(Menu.findById(m.id)?.name).toBe("Macchiato");
  });

  it("listActive() returns only active rows ordered by sort_order then name", () => {
    Menu.create({ name: "B", price: 100, sort_order: 2 });
    const a = Menu.create({ name: "A", price: 100, sort_order: 1 });
    Menu.create({ name: "C", price: 100, sort_order: 1 });
    Menu.setActive(a.id, true);
    expect(Menu.listActive().map(m => m.name)).toEqual(["A", "C", "B"]);
  });

  it("listAll() includes inactive", () => {
    const a = Menu.create({ name: "A", price: 1, sort_order: 1 });
    Menu.setActive(a.id, false);
    Menu.create({ name: "B", price: 1, sort_order: 2 });
    expect(Menu.listAll()).toHaveLength(2);
    expect(Menu.listActive()).toHaveLength(1);
  });

  it("update() persists changes", () => {
    const m = Menu.create({ name: "Macchiato", price: 4500, sort_order: 1 });
    Menu.update(m.id, { name: "Espresso", price: 3500, sort_order: 5 });
    const got = Menu.findById(m.id);
    expect(got?.name).toBe("Espresso");
    expect(got?.price).toBe(3500);
    expect(got?.sort_order).toBe(5);
  });

  it("setActive() toggles is_active", () => {
    const m = Menu.create({ name: "X", price: 1, sort_order: 1 });
    expect(Menu.findById(m.id)?.is_active).toBe(1);
    Menu.setActive(m.id, false);
    expect(Menu.findById(m.id)?.is_active).toBe(0);
  });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
npm test -- menu
```

- [ ] **Step 3: Implement `src/models/menuItems.ts`**

```ts
import { getDb } from "../lib/db";

export type MenuItem = {
  id: number;
  name: string;
  price: number;
  sort_order: number;
  is_active: number;
  created_at: string;
  updated_at: string;
};

export type CreateInput = { name: string; price: number; sort_order: number };
export type UpdateInput = { name: string; price: number; sort_order: number };

export function create(input: CreateInput): MenuItem {
  const r = getDb().prepare(`
    INSERT INTO menu_items (name, price, sort_order)
    VALUES (@name, @price, @sort_order)
  `).run(input);
  return findById(Number(r.lastInsertRowid))!;
}

export function findById(id: number): MenuItem | null {
  const r = getDb().prepare("SELECT * FROM menu_items WHERE id = ?").get(id) as MenuItem | undefined;
  return r ?? null;
}

export function listAll(): MenuItem[] {
  return getDb().prepare("SELECT * FROM menu_items ORDER BY sort_order, name").all() as MenuItem[];
}

export function listActive(): MenuItem[] {
  return getDb().prepare("SELECT * FROM menu_items WHERE is_active = 1 ORDER BY sort_order, name").all() as MenuItem[];
}

export function update(id: number, input: UpdateInput): void {
  getDb().prepare(`
    UPDATE menu_items
    SET name = @name, price = @price, sort_order = @sort_order, updated_at = datetime('now')
    WHERE id = @id
  `).run({ ...input, id });
}

export function setActive(id: number, active: boolean): void {
  getDb().prepare("UPDATE menu_items SET is_active = ?, updated_at = datetime('now') WHERE id = ?").run(active ? 1 : 0, id);
}

export function remove(id: number): void {
  // Soft delete: just deactivate. Hard delete would break historical sale_line_items FK.
  setActive(id, false);
}
```

- [ ] **Step 4: Run, expect pass; commit**

```bash
npm test
git add src/models/menuItems.ts tests/models/menuItems.test.ts
git commit -m "feat(models): menu items CRUD with soft delete"
```

---

## Task 2: Sales sessions model with computed totals (TDD)

**Files:** `src/models/salesSessions.ts`, `tests/models/salesSessions.test.ts`

The model exposes plain CRUD plus a `withTotals()` helper that computes subtotal, total_amount, and difference on demand (per spec — these are NOT stored columns).

- [ ] **Step 1: Write tests `tests/models/salesSessions.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { unlinkSync, existsSync } from "fs";
import { closeDb, runMigrations } from "../../src/lib/db";
import * as Employees from "../../src/models/employees";
import * as Menu from "../../src/models/menuItems";
import * as Sessions from "../../src/models/salesSessions";
import * as Lines from "../../src/models/saleLineItems";

const TEST_DB = "./data/test-sales.db";
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

function seedEmployee() {
  return Employees.create({ full_name: "Cashier", username: "c", password_hash: "h", role: "employee" });
}

describe("SalesSessions", () => {
  it("create() inserts an open session", () => {
    const e = seedEmployee();
    const s = Sessions.create({ employee_id: e.id, business_date: "2026-05-12", shift: "morning" });
    expect(s.id).toBeGreaterThan(0);
    expect(s.status).toBe("open");
    expect(s.cash_amount).toBe(0);
    expect(s.bank_transfer_amount).toBe(0);
  });

  it("updateHeader() persists cash, bank, notes", () => {
    const e = seedEmployee();
    const s = Sessions.create({ employee_id: e.id, business_date: "2026-05-12", shift: "morning" });
    Sessions.updateHeader(s.id, { cash_amount: 50000, bank_transfer_amount: 25000, notes: "smooth shift" });
    const got = Sessions.findById(s.id);
    expect(got?.cash_amount).toBe(50000);
    expect(got?.bank_transfer_amount).toBe(25000);
    expect(got?.notes).toBe("smooth shift");
  });

  it("withTotals() computes subtotal, total_amount, difference", () => {
    const e = seedEmployee();
    const m1 = Menu.create({ name: "Latte", price: 5000, sort_order: 1 });
    const m2 = Menu.create({ name: "Espresso", price: 3000, sort_order: 2 });
    const s = Sessions.create({ employee_id: e.id, business_date: "2026-05-12", shift: "morning" });
    Lines.upsert(s.id, m1.id, 3); // 3 * 5000 = 15000
    Lines.upsert(s.id, m2.id, 2); // 2 * 3000 = 6000
    Sessions.updateHeader(s.id, { cash_amount: 21000, bank_transfer_amount: 0, notes: null });
    const t = Sessions.withTotals(s.id);
    expect(t?.subtotal).toBe(21000);
    expect(t?.total_amount).toBe(21000);
    expect(t?.difference).toBe(0);
  });

  it("withTotals() computes negative difference when cash short", () => {
    const e = seedEmployee();
    const m1 = Menu.create({ name: "Latte", price: 5000, sort_order: 1 });
    const s = Sessions.create({ employee_id: e.id, business_date: "2026-05-12", shift: "morning" });
    Lines.upsert(s.id, m1.id, 2); // 10000 expected
    Sessions.updateHeader(s.id, { cash_amount: 9500, bank_transfer_amount: 0, notes: null });
    const t = Sessions.withTotals(s.id);
    expect(t?.subtotal).toBe(10000);
    expect(t?.total_amount).toBe(9500);
    expect(t?.difference).toBe(-500);
  });

  it("close() and reopen() change status", () => {
    const e = seedEmployee();
    const s = Sessions.create({ employee_id: e.id, business_date: "2026-05-12", shift: "morning" });
    Sessions.close(s.id);
    expect(Sessions.findById(s.id)?.status).toBe("closed");
    Sessions.reopen(s.id);
    expect(Sessions.findById(s.id)?.status).toBe("open");
  });

  it("listForEmployee() and listAll() filter and order by business_date desc", () => {
    const e1 = seedEmployee();
    const e2 = Employees.create({ full_name: "Other", username: "o", password_hash: "h", role: "employee" });
    Sessions.create({ employee_id: e1.id, business_date: "2026-05-10", shift: "m" });
    Sessions.create({ employee_id: e1.id, business_date: "2026-05-12", shift: "m" });
    Sessions.create({ employee_id: e2.id, business_date: "2026-05-11", shift: "m" });
    expect(Sessions.listForEmployee(e1.id).map(s => s.business_date)).toEqual(["2026-05-12", "2026-05-10"]);
    expect(Sessions.listAll().map(s => s.business_date)).toEqual(["2026-05-12", "2026-05-11", "2026-05-10"]);
  });
});
```

- [ ] **Step 2: Run, expect fail (saleLineItems also missing)**

```bash
npm test -- sales
```

- [ ] **Step 3: Implement `src/models/salesSessions.ts`**

```ts
import { getDb } from "../lib/db";

export type SalesSession = {
  id: number;
  employee_id: number;
  business_date: string;
  shift: string | null;
  cash_amount: number;
  bank_transfer_amount: number;
  notes: string | null;
  status: "open" | "closed";
  created_at: string;
  updated_at: string;
};

export type SessionTotals = SalesSession & {
  subtotal: number;
  total_amount: number;
  difference: number;
};

export type CreateInput = { employee_id: number; business_date: string; shift: string | null };
export type HeaderInput = { cash_amount: number; bank_transfer_amount: number; notes: string | null };

export function create(input: CreateInput): SalesSession {
  const r = getDb().prepare(`
    INSERT INTO sales_sessions (employee_id, business_date, shift)
    VALUES (@employee_id, @business_date, @shift)
  `).run(input);
  return findById(Number(r.lastInsertRowid))!;
}

export function findById(id: number): SalesSession | null {
  const r = getDb().prepare("SELECT * FROM sales_sessions WHERE id = ?").get(id) as SalesSession | undefined;
  return r ?? null;
}

export function withTotals(id: number): SessionTotals | null {
  const s = findById(id);
  if (!s) return null;
  const row = getDb().prepare("SELECT COALESCE(SUM(total), 0) AS subtotal FROM sale_line_items WHERE sales_session_id = ?").get(id) as { subtotal: number };
  const subtotal = row.subtotal;
  const total_amount = s.cash_amount + s.bank_transfer_amount;
  return { ...s, subtotal, total_amount, difference: total_amount - subtotal };
}

export function updateHeader(id: number, input: HeaderInput): void {
  getDb().prepare(`
    UPDATE sales_sessions
    SET cash_amount = @cash_amount, bank_transfer_amount = @bank_transfer_amount, notes = @notes, updated_at = datetime('now')
    WHERE id = @id
  `).run({ ...input, id });
}

export function close(id: number): void {
  getDb().prepare("UPDATE sales_sessions SET status = 'closed', updated_at = datetime('now') WHERE id = ?").run(id);
}

export function reopen(id: number): void {
  getDb().prepare("UPDATE sales_sessions SET status = 'open', updated_at = datetime('now') WHERE id = ?").run(id);
}

export function listAll(filters: { from?: string; to?: string; employeeId?: number; status?: "open" | "closed" } = {}): SalesSession[] {
  const where: string[] = [];
  const params: any = {};
  if (filters.from)       { where.push("business_date >= @from"); params.from = filters.from; }
  if (filters.to)         { where.push("business_date <= @to");   params.to = filters.to; }
  if (filters.employeeId) { where.push("employee_id = @employee_id"); params.employee_id = filters.employeeId; }
  if (filters.status)     { where.push("status = @status"); params.status = filters.status; }
  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
  return getDb().prepare(`SELECT * FROM sales_sessions ${whereSql} ORDER BY business_date DESC, id DESC`).all(params) as SalesSession[];
}

export function listForEmployee(employeeId: number): SalesSession[] {
  return listAll({ employeeId });
}
```

- [ ] **Step 4: (defer `npm test`; saleLineItems needed first — Task 3 follows immediately)**

Skip the commit for now if tests still fail. Actually, the test file imports `saleLineItems` which doesn't exist yet. To stay TDD-disciplined: write the saleLineItems model in Task 3 first, then come back. **OR**: implement both in this task's commit since the test file imports both. We'll implement both in this commit.

Continue to Task 3 immediately — they're a unit.

---

## Task 3: Sale line items model (TDD, paired with Task 2)

**Files:** `src/models/saleLineItems.ts` (created), `tests/models/salesSessions.test.ts` is already written and tests both modules together.

- [ ] **Step 1: Implement `src/models/saleLineItems.ts`**

```ts
import { getDb } from "../lib/db";
import * as Menu from "./menuItems";

export type SaleLineItem = {
  id: number;
  sales_session_id: number;
  menu_item_id: number;
  qty: number;
  unit_price_snapshot: number;
  total: number;
  remark: string | null;
  created_at: string;
  updated_at: string;
};

export function listForSession(sessionId: number): SaleLineItem[] {
  return getDb().prepare("SELECT * FROM sale_line_items WHERE sales_session_id = ? ORDER BY id").all(sessionId) as SaleLineItem[];
}

export function findForMenuItem(sessionId: number, menuItemId: number): SaleLineItem | null {
  const r = getDb().prepare("SELECT * FROM sale_line_items WHERE sales_session_id = ? AND menu_item_id = ?").get(sessionId, menuItemId) as SaleLineItem | undefined;
  return r ?? null;
}

// Insert or update the line for a given menu item. If qty is 0, delete.
export function upsert(sessionId: number, menuItemId: number, qty: number): SaleLineItem | null {
  const existing = findForMenuItem(sessionId, menuItemId);
  if (qty <= 0) {
    if (existing) {
      getDb().prepare("DELETE FROM sale_line_items WHERE id = ?").run(existing.id);
    }
    return null;
  }
  const menu = Menu.findById(menuItemId);
  if (!menu) throw new Error("Menu item not found");
  const total = menu.price * qty;

  if (existing) {
    getDb().prepare("UPDATE sale_line_items SET qty = ?, total = ?, updated_at = datetime('now') WHERE id = ?").run(qty, total, existing.id);
    return findForMenuItem(sessionId, menuItemId)!;
  } else {
    const r = getDb().prepare(`
      INSERT INTO sale_line_items (sales_session_id, menu_item_id, qty, unit_price_snapshot, total)
      VALUES (?, ?, ?, ?, ?)
    `).run(sessionId, menuItemId, qty, menu.price, total);
    return getDb().prepare("SELECT * FROM sale_line_items WHERE id = ?").get(Number(r.lastInsertRowid)) as SaleLineItem;
  }
}

export function updateRemark(id: number, remark: string | null): void {
  getDb().prepare("UPDATE sale_line_items SET remark = ?, updated_at = datetime('now') WHERE id = ?").run(remark, id);
}

export function removeForSession(sessionId: number): void {
  getDb().prepare("DELETE FROM sale_line_items WHERE sales_session_id = ?").run(sessionId);
}
```

- [ ] **Step 2: Run all tests, expect pass**

```bash
npm test
```

Expected: cumulative count grows by 11 (5 menu + 6 sales sessions).

- [ ] **Step 3: Commit Tasks 2+3 together**

```bash
git add src/models/salesSessions.ts src/models/saleLineItems.ts tests/models/salesSessions.test.ts
git commit -m "feat(models): sales sessions + line items with computed totals + qty upsert"
```

---

## Task 4: Menu CRUD pages

**Files:** `src/controllers/menuController.ts`, `src/routes/menu.ts`, `src/routes/index.ts` (mount), `src/views/menu/list.ejs`, `src/views/menu/new.ejs`, `src/views/menu/edit.ejs`

- [ ] **Step 1: Create `src/routes/menu.ts`**

```ts
import { Router } from "express";
import * as Ctrl from "../controllers/menuController";
import { requireAuth } from "../middleware/requireAuth";
import { requireOwner } from "../middleware/requireOwner";

export const menuRouter = Router();
menuRouter.use(requireAuth, requireOwner);

menuRouter.get("/",            Ctrl.list);
menuRouter.get("/new",         Ctrl.showNew);
menuRouter.post("/",           Ctrl.create);
menuRouter.get("/:id/edit",    Ctrl.showEdit);
menuRouter.post("/:id",        Ctrl.update);
menuRouter.post("/:id/active", Ctrl.toggleActive);
```

- [ ] **Step 2: Modify `src/routes/index.ts`** — add import + mount:

```ts
import { menuRouter } from "./menu";
// ...later:
router.use("/menu", menuRouter);
```

- [ ] **Step 3: Create `src/controllers/menuController.ts`**

```ts
import type { Request, Response } from "express";
import * as Menu from "../models/menuItems";
import { writeAudit } from "../lib/audit";
import { pushFlash } from "../lib/flash";

function actor(req: Request): number | null { return req.session.employeeId ?? null; }

function parsePriceMajor(input: unknown): number {
  const n = Number(String(input ?? "0"));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function list(_req: Request, res: Response) {
  const items = Menu.listAll();
  res.render("menu/list", { items });
}

export function showNew(_req: Request, res: Response) {
  res.render("menu/new");
}

export function create(req: Request, res: Response) {
  const name = (req.body.name ?? "").toString().trim();
  if (!name) {
    pushFlash(req, "error", "Name is required");
    return res.redirect("/menu/new");
  }
  const price = parsePriceMajor(req.body.price);
  const sort_order = Number(req.body.sort_order) || 0;
  const m = Menu.create({ name, price, sort_order });
  writeAudit({ actor_id: actor(req), action: "create_menu_item", entity: "menu_items", entity_id: m.id });
  pushFlash(req, "success", `${m.name} added to menu`);
  res.redirect("/menu");
}

export function showEdit(req: Request, res: Response) {
  const item = Menu.findById(Number(req.params.id));
  if (!item) return res.status(404).render("errors/404");
  res.render("menu/edit", { item });
}

export function update(req: Request, res: Response) {
  const id = Number(req.params.id);
  const item = Menu.findById(id);
  if (!item) return res.status(404).render("errors/404");
  const name = (req.body.name ?? item.name).toString().trim() || item.name;
  Menu.update(id, {
    name,
    price: parsePriceMajor(req.body.price),
    sort_order: Number(req.body.sort_order) || 0,
  });
  writeAudit({ actor_id: actor(req), action: "update_menu_item", entity: "menu_items", entity_id: id });
  pushFlash(req, "success", `${name} updated`);
  res.redirect("/menu");
}

export function toggleActive(req: Request, res: Response) {
  const id = Number(req.params.id);
  const item = Menu.findById(id);
  if (!item) return res.status(404).render("errors/404");
  const next = !item.is_active;
  Menu.setActive(id, next);
  writeAudit({ actor_id: actor(req), action: next ? "activate_menu_item" : "deactivate_menu_item", entity: "menu_items", entity_id: id });
  pushFlash(req, "success", `${item.name} ${next ? "activated" : "deactivated"}`);
  res.redirect("/menu");
}
```

- [ ] **Step 4: Create `src/views/menu/list.ejs`**

```ejs
<%- include('../partials/head', { title: 'Menu', shopName }) %>
<body class="text-ink font-sans antialiased min-h-screen flex">
  <%- include('../partials/sidebar', { shopName, currentRole, currentUser, csrfToken, currentPath }) %>

  <main class="flex-1 px-air-lg pt-chapter pb-air-lg max-w-4xl">
    <header class="reveal reveal-1 flex items-end justify-between">
      <div>
        <p class="font-mono text-[12px] tracking-smallcaps uppercase text-smoke">Catalog</p>
        <h1 class="font-display text-[36px] leading-[42px] text-ink mt-gutter-tight" style="font-variation-settings:'opsz' 72,'SOFT' 50">Menu</h1>
      </div>
      <a href="/menu/new" class="btn-primary">Add item</a>
    </header>

    <div class="reveal reveal-2"><%- include('../partials/ornament') %></div>

    <%- include('../partials/flash', { flash }) %>

    <% if (items.length === 0) { %>
      <div class="reveal reveal-3 card">
        <div class="card-body text-center py-air-lg">
          <p class="font-display italic text-[22px] text-coal" style="font-variation-settings:'opsz' 36,'SOFT' 50">No items on the menu yet.</p>
          <p class="font-sans text-[14px] text-smoke mt-gutter">Add your first drink or food item to start logging sales.</p>
          <a href="/menu/new" class="btn-primary mt-gutter-lg">Add item</a>
        </div>
      </div>
    <% } else { %>
      <div class="reveal reveal-3 card">
        <table class="w-full">
          <thead>
            <tr class="border-b border-rule">
              <th class="text-left font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke px-gutter-lg py-gutter">Order</th>
              <th class="text-left font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke py-gutter">Item</th>
              <th class="text-right font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke py-gutter">Price</th>
              <th class="text-left font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke py-gutter pl-air">Status</th>
              <th class="px-gutter-lg"></th>
            </tr>
          </thead>
          <tbody>
            <% items.forEach(item => { %>
              <tr class="border-b border-rule last:border-0 hover:bg-paper transition-colors">
                <td class="px-gutter-lg py-gutter-lg font-mono text-[14px] text-smoke"><%= item.sort_order %></td>
                <td class="py-gutter-lg font-sans text-[15px] text-ink"><%= item.name %></td>
                <td class="py-gutter-lg text-right font-mono text-[14px] text-coal"><%= (item.price / 100).toFixed(2) %></td>
                <td class="py-gutter-lg pl-air">
                  <% if (item.is_active) { %>
                    <span class="pip pip-open">Active</span>
                  <% } else { %>
                    <span class="pip pip-draft">Inactive</span>
                  <% } %>
                </td>
                <td class="px-gutter-lg py-gutter-lg text-right">
                  <a href="/menu/<%= item.id %>/edit" class="font-sans text-[12px] tracking-smallcaps uppercase text-ember hover:text-ember-deep transition-colors mr-gutter">Edit</a>
                  <form method="POST" action="/menu/<%= item.id %>/active" class="inline">
                    <input type="hidden" name="_csrf" value="<%= csrfToken %>" />
                    <button class="font-sans text-[12px] tracking-smallcaps uppercase text-smoke hover:text-ink transition-colors">
                      <%= item.is_active ? 'Deactivate' : 'Activate' %>
                    </button>
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

- [ ] **Step 5: Create `src/views/menu/new.ejs`**

```ejs
<%- include('../partials/head', { title: 'New menu item', shopName }) %>
<body class="text-ink font-sans antialiased min-h-screen flex">
  <%- include('../partials/sidebar', { shopName, currentRole, currentUser, csrfToken, currentPath }) %>
  <main class="flex-1 px-air-lg pt-chapter pb-air-lg max-w-xl">
    <header class="reveal reveal-1">
      <p class="font-mono text-[12px] tracking-smallcaps uppercase text-smoke"><a href="/menu" class="hover:text-ink transition-colors">Menu</a> · New</p>
      <h1 class="font-display text-[36px] leading-[42px] text-ink mt-gutter-tight" style="font-variation-settings:'opsz' 72,'SOFT' 50">New menu item</h1>
    </header>

    <div class="reveal reveal-2"><%- include('../partials/ornament') %></div>

    <%- include('../partials/flash', { flash }) %>

    <form method="POST" action="/menu" class="reveal reveal-3 card">
      <input type="hidden" name="_csrf" value="<%= csrfToken %>" />
      <div class="card-body space-y-gutter-lg">
        <label class="block">
          <span class="field-label">Name</span>
          <input name="name" required autofocus class="field-input" placeholder="Macchiato" />
        </label>
        <label class="block">
          <span class="field-label">Price</span>
          <input name="price" required class="field-input field-mono" placeholder="45.00" />
          <span class="field-hint">In the shop currency (e.g. ETB)</span>
        </label>
        <label class="block">
          <span class="field-label">Sort order</span>
          <input name="sort_order" type="number" value="0" class="field-input field-mono" />
          <span class="field-hint">Lower numbers appear first on the sales form</span>
        </label>
      </div>
      <div class="px-gutter-lg pb-gutter-lg flex items-center justify-end gap-gutter">
        <a href="/menu" class="btn-secondary">Cancel</a>
        <button class="btn-primary">Add item →</button>
      </div>
    </form>
  </main>
</body>
</html>
```

- [ ] **Step 6: Create `src/views/menu/edit.ejs`**

```ejs
<%- include('../partials/head', { title: 'Edit ' + item.name, shopName }) %>
<body class="text-ink font-sans antialiased min-h-screen flex">
  <%- include('../partials/sidebar', { shopName, currentRole, currentUser, csrfToken, currentPath }) %>
  <main class="flex-1 px-air-lg pt-chapter pb-air-lg max-w-xl">
    <header class="reveal reveal-1">
      <p class="font-mono text-[12px] tracking-smallcaps uppercase text-smoke"><a href="/menu" class="hover:text-ink transition-colors">Menu</a> · Edit</p>
      <h1 class="font-display text-[36px] leading-[42px] text-ink mt-gutter-tight" style="font-variation-settings:'opsz' 72,'SOFT' 50"><%= item.name %></h1>
    </header>

    <div class="reveal reveal-2"><%- include('../partials/ornament') %></div>

    <%- include('../partials/flash', { flash }) %>

    <form method="POST" action="/menu/<%= item.id %>" class="reveal reveal-3 card">
      <input type="hidden" name="_csrf" value="<%= csrfToken %>" />
      <div class="card-body space-y-gutter-lg">
        <label class="block">
          <span class="field-label">Name</span>
          <input name="name" required value="<%= item.name %>" class="field-input" />
        </label>
        <label class="block">
          <span class="field-label">Price</span>
          <input name="price" required value="<%= (item.price / 100).toFixed(2) %>" class="field-input field-mono" />
        </label>
        <label class="block">
          <span class="field-label">Sort order</span>
          <input name="sort_order" type="number" value="<%= item.sort_order %>" class="field-input field-mono" />
        </label>
      </div>
      <div class="px-gutter-lg pb-gutter-lg flex items-center justify-end gap-gutter">
        <a href="/menu" class="btn-secondary">Cancel</a>
        <button class="btn-primary">Save changes</button>
      </div>
    </form>
  </main>
</body>
</html>
```

- [ ] **Step 7: Build + commit**

```bash
npm run build && npm run css:build && npm test
git add src/routes/menu.ts src/routes/index.ts src/controllers/menuController.ts src/views/menu/
git commit -m "feat(menu): CRUD with activate/deactivate"
```

---

## Task 5: Sales router + controller scaffold

**Files:** `src/routes/sales.ts`, `src/routes/index.ts` (mount), `src/controllers/salesController.ts`

- [ ] **Step 1: Create `src/routes/sales.ts`**

```ts
import { Router } from "express";
import * as Ctrl from "../controllers/salesController";
import { requireAuth } from "../middleware/requireAuth";

export const salesRouter = Router();
salesRouter.use(requireAuth);

salesRouter.get("/",            Ctrl.list);
salesRouter.get("/new",         Ctrl.showNew);
salesRouter.post("/",           Ctrl.create);
salesRouter.get("/:id",         Ctrl.entry);

// HTMX endpoints
salesRouter.post("/:id/lines/:menuItemId", Ctrl.upsertLine);
salesRouter.post("/:id/header",            Ctrl.updateHeader);

salesRouter.post("/:id/close",  Ctrl.close);
salesRouter.post("/:id/reopen", Ctrl.reopen);
```

- [ ] **Step 2: Mount in `src/routes/index.ts`**:

```ts
import { salesRouter } from "./sales";
router.use("/sales", salesRouter);
```

- [ ] **Step 3: Create `src/controllers/salesController.ts`**

```ts
import type { Request, Response } from "express";
import * as Sessions from "../models/salesSessions";
import * as Lines from "../models/saleLineItems";
import * as Menu from "../models/menuItems";
import * as Employees from "../models/employees";
import * as Settings from "../models/settings";
import { todayBusinessDate } from "../lib/dates";
import { writeAudit } from "../lib/audit";
import { pushFlash } from "../lib/flash";

function actor(req: Request): number { return req.session.employeeId!; }
function role(req: Request): "owner" | "employee" { return req.session.role!; }

function canView(req: Request, session: Sessions.SalesSession): boolean {
  return role(req) === "owner" || session.employee_id === actor(req);
}
function canEdit(req: Request, session: Sessions.SalesSession): boolean {
  if (role(req) === "owner") return true;
  return session.employee_id === actor(req) && session.status === "open";
}

export function list(req: Request, res: Response) {
  const filters: any = {};
  if (req.query.from)   filters.from = String(req.query.from);
  if (req.query.to)     filters.to   = String(req.query.to);
  if (req.query.status) filters.status = String(req.query.status);
  if (role(req) === "employee") filters.employeeId = actor(req);
  else if (req.query.employee) filters.employeeId = Number(req.query.employee);

  const sessions = Sessions.listAll(filters).map(s => Sessions.withTotals(s.id)!);
  const employees = role(req) === "owner" ? Employees.listAll({ activeOnly: false }) : [];
  res.render("sales/list", { sessions, employees, filters });
}

export function showNew(_req: Request, res: Response) {
  const today = todayBusinessDate(
    Settings.get("business_day_cutoff") ?? "00:00",
    Settings.get("timezone") ?? "Africa/Addis_Ababa",
  );
  res.render("sales/new", { today });
}

export function create(req: Request, res: Response) {
  const business_date = (req.body.business_date ?? "").toString();
  const shift = (req.body.shift ?? "").toString().trim() || null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(business_date)) {
    pushFlash(req, "error", "Pick a valid date");
    return res.redirect("/sales/new");
  }
  const s = Sessions.create({ employee_id: actor(req), business_date, shift });
  writeAudit({ actor_id: actor(req), action: "create_sales_session", entity: "sales_sessions", entity_id: s.id });
  res.redirect(`/sales/${s.id}`);
}

export function entry(req: Request, res: Response) {
  const id = Number(req.params.id);
  const session = Sessions.findById(id);
  if (!session) return res.status(404).render("errors/404");
  if (!canView(req, session)) return res.status(403).render("errors/403", { message: "Not your shift" });

  const items = Menu.listActive();
  const linesArr = Lines.listForSession(id);
  const lines: Record<number, typeof linesArr[0]> = {};
  for (const l of linesArr) lines[l.menu_item_id] = l;
  const totals = Sessions.withTotals(id)!;
  const editable = canEdit(req, session);
  const employee = Employees.findById(session.employee_id);
  res.render("sales/entry", { session, totals, items, lines, employee, editable });
}

export function upsertLine(req: Request, res: Response) {
  const id = Number(req.params.id);
  const menuItemId = Number(req.params.menuItemId);
  const session = Sessions.findById(id);
  if (!session || !canEdit(req, session)) return res.status(403).send("Forbidden");

  const qty = Math.max(0, Math.floor(Number(req.body.qty || 0)));
  const line = Lines.upsert(id, menuItemId, qty);
  const totals = Sessions.withTotals(id)!;
  const item = Menu.findById(menuItemId);

  // Return two HTML fragments: the row total and the footer totals (out-of-band swap).
  res.render("sales/_row", { item, line, totals, layout: false }, (err, rowHtml) => {
    if (err) return res.status(500).send("render error");
    res.render("sales/_totals", { totals, layout: false, oob: true }, (err2, totalsHtml) => {
      if (err2) return res.status(500).send("render error");
      res.send(rowHtml + totalsHtml);
    });
  });
}

function parseMajor(input: unknown): number {
  const n = Number(String(input ?? "0"));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function updateHeader(req: Request, res: Response) {
  const id = Number(req.params.id);
  const session = Sessions.findById(id);
  if (!session || !canEdit(req, session)) return res.status(403).send("Forbidden");
  Sessions.updateHeader(id, {
    cash_amount: parseMajor(req.body.cash_amount),
    bank_transfer_amount: parseMajor(req.body.bank_transfer_amount),
    notes: (req.body.notes ?? "").toString() || null,
  });
  const totals = Sessions.withTotals(id)!;
  res.render("sales/_totals", { totals, layout: false }, (err, html) => {
    if (err) return res.status(500).send("render error");
    res.send(html);
  });
}

export function close(req: Request, res: Response) {
  const id = Number(req.params.id);
  const session = Sessions.findById(id);
  if (!session || !canEdit(req, session)) return res.status(403).render("errors/403", { message: "Cannot close this shift" });
  Sessions.close(id);
  writeAudit({ actor_id: actor(req), action: "close_sales_session", entity: "sales_sessions", entity_id: id });
  pushFlash(req, "success", "Shift closed");
  res.redirect(`/sales/${id}`);
}

export function reopen(req: Request, res: Response) {
  const id = Number(req.params.id);
  const session = Sessions.findById(id);
  if (!session) return res.status(404).render("errors/404");
  if (role(req) !== "owner") return res.status(403).render("errors/403", { message: "Only the owner can reopen a shift" });
  Sessions.reopen(id);
  writeAudit({ actor_id: actor(req), action: "reopen_sales_session", entity: "sales_sessions", entity_id: id });
  pushFlash(req, "success", "Shift reopened");
  res.redirect(`/sales/${id}`);
}
```

- [ ] **Step 4: Build + commit**

```bash
npm run build
git add src/routes/sales.ts src/routes/index.ts src/controllers/salesController.ts
git commit -m "feat(sales): router + controller scaffold (HTMX-friendly)"
```

(Build will pass because views are referenced by `res.render` — those references resolve at request time, not at compile time. Tests still pass because no tests reference the new controllers yet.)

---

## Task 6: Sales — list page + new page

**Files:** `src/views/sales/list.ejs`, `src/views/sales/new.ejs`

- [ ] **Step 1: Create `src/views/sales/list.ejs`**

```ejs
<%- include('../partials/head', { title: 'Sales', shopName }) %>
<body class="text-ink font-sans antialiased min-h-screen flex">
  <%- include('../partials/sidebar', { shopName, currentRole, currentUser, csrfToken, currentPath }) %>

  <main class="flex-1 px-air-lg pt-chapter pb-air-lg max-w-5xl">
    <header class="reveal reveal-1 flex items-end justify-between gap-gutter">
      <div>
        <p class="font-mono text-[12px] tracking-smallcaps uppercase text-smoke">Shifts</p>
        <h1 class="font-display text-[36px] leading-[42px] text-ink mt-gutter-tight" style="font-variation-settings:'opsz' 72,'SOFT' 50">Sales</h1>
      </div>
      <a href="/sales/new" class="btn-primary">Start new shift</a>
    </header>

    <div class="reveal reveal-2"><%- include('../partials/ornament') %></div>

    <form method="GET" class="reveal reveal-3 flex items-end gap-gutter mb-air">
      <label class="block">
        <span class="field-label">From</span>
        <input type="date" name="from" value="<%= filters.from || '' %>" class="field-input field-mono" />
      </label>
      <label class="block">
        <span class="field-label">To</span>
        <input type="date" name="to" value="<%= filters.to || '' %>" class="field-input field-mono" />
      </label>
      <% if (currentRole === 'owner') { %>
        <label class="block">
          <span class="field-label">Employee</span>
          <select name="employee" class="field-input">
            <option value="">All</option>
            <% employees.forEach(e => { %>
              <option value="<%= e.id %>" <%= String(filters.employeeId) === String(e.id) ? 'selected' : '' %>><%= e.full_name %></option>
            <% }) %>
          </select>
        </label>
      <% } %>
      <label class="block">
        <span class="field-label">Status</span>
        <select name="status" class="field-input">
          <option value="">All</option>
          <option value="open"   <%= filters.status === 'open'   ? 'selected' : '' %>>Open</option>
          <option value="closed" <%= filters.status === 'closed' ? 'selected' : '' %>>Closed</option>
        </select>
      </label>
      <button class="btn-secondary">Filter</button>
    </form>

    <%- include('../partials/flash', { flash }) %>

    <% if (sessions.length === 0) { %>
      <div class="card">
        <div class="card-body text-center py-air">
          <p class="font-display italic text-[20px] text-coal" style="font-variation-settings:'opsz' 24,'SOFT' 50">No shifts match.</p>
        </div>
      </div>
    <% } else { %>
      <div class="card">
        <table class="w-full">
          <thead>
            <tr class="border-b border-rule">
              <th class="text-left font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke px-gutter-lg py-gutter">Date</th>
              <th class="text-left font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke py-gutter">Shift</th>
              <% if (currentRole === 'owner') { %>
                <th class="text-left font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke py-gutter">Cashier</th>
              <% } %>
              <th class="text-right font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke py-gutter">Subtotal</th>
              <th class="text-right font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke py-gutter">Counted</th>
              <th class="text-right font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke py-gutter">Diff</th>
              <th class="text-left font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke py-gutter pl-air">Status</th>
              <th class="px-gutter-lg"></th>
            </tr>
          </thead>
          <tbody>
            <% sessions.forEach(s => { %>
              <tr class="border-b border-rule last:border-0 hover:bg-paper transition-colors">
                <td class="px-gutter-lg py-gutter-lg font-mono text-[14px] text-coal"><%= s.business_date %></td>
                <td class="py-gutter-lg font-sans text-[14px] text-coal"><%= s.shift || '—' %></td>
                <% if (currentRole === 'owner') { %>
                  <td class="py-gutter-lg font-sans text-[14px] text-coal">#<%= s.employee_id %></td>
                <% } %>
                <td class="py-gutter-lg text-right font-mono text-[14px] text-ink"><%= (s.subtotal / 100).toFixed(2) %></td>
                <td class="py-gutter-lg text-right font-mono text-[14px] text-ink"><%= (s.total_amount / 100).toFixed(2) %></td>
                <td class="py-gutter-lg text-right font-mono text-[14px] <%= s.difference === 0 ? 'text-smoke' : (s.difference > 0 ? 'text-leaf' : 'text-crimson') %>">
                  <%= s.difference >= 0 ? '+' : '' %><%= (s.difference / 100).toFixed(2) %>
                </td>
                <td class="py-gutter-lg pl-air">
                  <span class="pip pip-<%= s.status === 'open' ? 'open' : 'closed' %>"><%= s.status %></span>
                </td>
                <td class="px-gutter-lg py-gutter-lg text-right">
                  <a href="/sales/<%= s.id %>" class="font-sans text-[12px] tracking-smallcaps uppercase text-ember hover:text-ember-deep transition-colors">Open →</a>
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

- [ ] **Step 2: Create `src/views/sales/new.ejs`**

```ejs
<%- include('../partials/head', { title: 'Start new shift', shopName }) %>
<body class="text-ink font-sans antialiased min-h-screen flex">
  <%- include('../partials/sidebar', { shopName, currentRole, currentUser, csrfToken, currentPath }) %>
  <main class="flex-1 px-air-lg pt-chapter pb-air-lg max-w-xl">
    <header class="reveal reveal-1">
      <p class="font-mono text-[12px] tracking-smallcaps uppercase text-smoke">
        <a href="/sales" class="hover:text-ink transition-colors">Sales</a> · New
      </p>
      <h1 class="font-display text-[36px] leading-[42px] text-ink mt-gutter-tight" style="font-variation-settings:'opsz' 72,'SOFT' 50">Start a new shift</h1>
      <p class="font-sans text-coal mt-gutter">A blank Daily Sales Income sheet, ready for the counter.</p>
    </header>

    <div class="reveal reveal-2"><%- include('../partials/ornament') %></div>

    <%- include('../partials/flash', { flash }) %>

    <form method="POST" action="/sales" class="reveal reveal-3 card">
      <input type="hidden" name="_csrf" value="<%= csrfToken %>" />
      <div class="card-body space-y-gutter-lg">
        <label class="block">
          <span class="field-label">Business date</span>
          <input type="date" name="business_date" value="<%= today %>" required class="field-input field-mono" />
        </label>
        <label class="block">
          <span class="field-label">Shift</span>
          <input name="shift" required class="field-input" placeholder="morning · afternoon · evening · any label" />
        </label>
      </div>
      <div class="px-gutter-lg pb-gutter-lg flex items-center justify-end gap-gutter">
        <a href="/sales" class="btn-secondary">Cancel</a>
        <button class="btn-primary">Begin shift →</button>
      </div>
    </form>
  </main>
</body>
</html>
```

- [ ] **Step 3: Build + commit**

```bash
npm run build && npm run css:build
git add src/views/sales/list.ejs src/views/sales/new.ejs
git commit -m "feat(sales): list + new shift pages"
```

---

## Task 7: Sales entry page with HTMX live totals

**Files:** `src/views/sales/entry.ejs`, `src/views/sales/_row.ejs`, `src/views/sales/_totals.ejs`

This is the signature page. Each menu row is its own form-like control; the qty input has `hx-post` and `hx-trigger="change delay:300ms"` so updates fire as the cashier moves between rows. The response replaces the row total + footer totals via HTMX out-of-band swap.

- [ ] **Step 1: Create `src/views/sales/_row.ejs`** (returned by HTMX)

```ejs
<tr id="row-<%= item.id %>" class="border-b border-rule">
  <td class="px-gutter-lg py-gutter font-sans text-[15px] text-ink"><%= item.name %></td>
  <td class="text-right font-mono text-[14px] text-smoke py-gutter"><%= (item.price / 100).toFixed(2) %></td>
  <td class="py-gutter">
    <input
      type="number" min="0" step="1"
      name="qty" value="<%= line ? line.qty : '' %>"
      class="w-20 font-mono text-right border-0 border-b border-rule-strong bg-transparent px-1 py-1 focus:outline-none focus:border-b-2 focus:border-ember"
      hx-post="/sales/<%= typeof session !== 'undefined' ? session.id : (totals ? totals.id : '') %>/lines/<%= item.id %>"
      hx-headers='{"x-csrf-token": "<%= csrfToken %>"}'
      hx-trigger="change delay:200ms, blur"
      hx-target="#row-<%= item.id %>"
      hx-swap="outerHTML"
    />
  </td>
  <td id="row-total-<%= item.id %>" class="text-right font-mono text-[14px] text-ink py-gutter px-gutter-lg num-flash">
    <%= line ? (line.total / 100).toFixed(2) : '0.00' %>
  </td>
</tr>
```

- [ ] **Step 2: Create `src/views/sales/_totals.ejs`** (returned with `hx-swap-oob`)

```ejs
<div id="totals" class="bg-paper border-t-2 border-rule-strong px-gutter-lg py-gutter-lg num-flash" <%= typeof oob !== 'undefined' && oob ? 'hx-swap-oob="true"' : '' %>>
  <div class="grid grid-cols-4 gap-air">
    <div>
      <p class="font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke">Subtotal</p>
      <p class="font-mono text-[20px] text-ink mt-1"><%= (totals.subtotal / 100).toFixed(2) %></p>
    </div>
    <div>
      <p class="font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke">Counted</p>
      <p class="font-mono text-[20px] text-ink mt-1"><%= (totals.total_amount / 100).toFixed(2) %></p>
    </div>
    <div>
      <p class="font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke">Difference</p>
      <p class="font-mono text-[20px] mt-1 <%= totals.difference === 0 ? 'text-smoke' : (totals.difference > 0 ? 'text-leaf' : 'text-crimson') %>">
        <%= totals.difference >= 0 ? '+' : '' %><%= (totals.difference / 100).toFixed(2) %>
      </p>
    </div>
    <div>
      <p class="font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke">Items sold</p>
      <p class="font-mono text-[20px] text-ink mt-1"><%= totals.subtotal === 0 ? '0' : ((totals.subtotal / 100).toFixed(0)) %></p>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Create `src/views/sales/entry.ejs`**

```ejs
<%- include('../partials/head', { title: 'Shift · ' + session.business_date, shopName }) %>
<body class="text-ink font-sans antialiased min-h-screen flex">
  <%- include('../partials/sidebar', { shopName, currentRole, currentUser, csrfToken, currentPath }) %>

  <main class="flex-1 px-air-lg pt-chapter pb-air-lg max-w-5xl">
    <header class="reveal reveal-1 flex items-end justify-between">
      <div>
        <p class="font-mono text-[12px] tracking-smallcaps uppercase text-smoke">
          <a href="/sales" class="hover:text-ink transition-colors">Sales</a> · Shift
        </p>
        <h1 class="font-display text-[36px] leading-[42px] text-ink mt-gutter-tight" style="font-variation-settings:'opsz' 72,'SOFT' 50">
          <%= session.business_date %> · <span class="italic"><%= session.shift || '—' %></span>
        </h1>
        <p class="font-sans text-[13px] text-smoke mt-gutter-tight">
          <% if (employee) { %>Cashier: <%= employee.full_name %> · <% } %>
          <span class="pip pip-<%= session.status === 'open' ? 'open' : 'closed' %>"><%= session.status %></span>
        </p>
      </div>
      <% if (editable) { %>
        <form method="POST" action="/sales/<%= session.id %>/close" onsubmit="return confirm('Close this shift? You will not be able to edit it after.')">
          <input type="hidden" name="_csrf" value="<%= csrfToken %>" />
          <button class="btn-primary">Close shift →</button>
        </form>
      <% } else if (currentRole === 'owner') { %>
        <form method="POST" action="/sales/<%= session.id %>/reopen">
          <input type="hidden" name="_csrf" value="<%= csrfToken %>" />
          <button class="btn-secondary">Reopen shift</button>
        </form>
      <% } %>
    </header>

    <div class="reveal reveal-2"><%- include('../partials/ornament') %></div>

    <%- include('../partials/flash', { flash }) %>

    <div class="reveal reveal-3 card overflow-hidden">
      <table class="w-full">
        <thead>
          <tr class="border-b border-rule-strong">
            <th class="text-left font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke px-gutter-lg py-gutter">Item</th>
            <th class="text-right font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke py-gutter">Unit</th>
            <th class="text-left font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke py-gutter pl-gutter-lg">Qty</th>
            <th class="text-right font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke px-gutter-lg py-gutter">Total</th>
          </tr>
        </thead>
        <tbody>
          <% items.forEach(item => {
               const line = lines[item.id] || null;
          %>
            <%- include('_row', { item, line, session, csrfToken, totals }) %>
          <% }) %>
        </tbody>
      </table>

      <%- include('_totals', { totals }) %>

      <% if (editable) { %>
        <form
          class="px-gutter-lg py-gutter-lg border-t border-rule grid grid-cols-3 gap-air items-end"
          hx-post="/sales/<%= session.id %>/header"
          hx-headers='{"x-csrf-token": "<%= csrfToken %>"}'
          hx-target="#totals"
          hx-swap="outerHTML"
          hx-trigger="change from:input, change from:textarea, change delay:200ms"
        >
          <label class="block">
            <span class="field-label">Cash collected</span>
            <input name="cash_amount" value="<%= (session.cash_amount / 100).toFixed(2) %>" class="field-input field-mono" />
          </label>
          <label class="block">
            <span class="field-label">Bank transfer</span>
            <input name="bank_transfer_amount" value="<%= (session.bank_transfer_amount / 100).toFixed(2) %>" class="field-input field-mono" />
          </label>
          <label class="block">
            <span class="field-label">Notes</span>
            <input name="notes" value="<%= session.notes || '' %>" class="field-input" />
          </label>
        </form>
      <% } else { %>
        <div class="px-gutter-lg py-gutter-lg border-t border-rule grid grid-cols-3 gap-air">
          <div>
            <p class="field-label">Cash collected</p>
            <p class="font-mono text-[16px] text-ink"><%= (session.cash_amount / 100).toFixed(2) %></p>
          </div>
          <div>
            <p class="field-label">Bank transfer</p>
            <p class="font-mono text-[16px] text-ink"><%= (session.bank_transfer_amount / 100).toFixed(2) %></p>
          </div>
          <div>
            <p class="field-label">Notes</p>
            <p class="font-sans text-[14px] text-coal"><%= session.notes || '—' %></p>
          </div>
        </div>
      <% } %>
    </div>
  </main>
</body>
</html>
```

- [ ] **Step 4: Build + commit**

```bash
npm run build && npm run css:build
git add src/views/sales/entry.ejs src/views/sales/_row.ejs src/views/sales/_totals.ejs
git commit -m "feat(sales): entry page with HTMX live totals"
```

---

## Task 8: Integration test

**Files:** `tests/integration/sales.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { unlinkSync, existsSync } from "fs";
import { closeDb, runMigrations } from "../../src/lib/db";
import * as Employees from "../../src/models/employees";
import * as Menu from "../../src/models/menuItems";

const TEST_DB = "./data/test-sales-int.db";
process.env.DB_PATH = TEST_DB;
process.env.SESSION_SECRET = "test-secret";

async function loginAs(app: any, username: string, password: string): Promise<request.SuperAgentTest> {
  const agent = request.agent(app);
  const r1 = await agent.get("/login");
  const csrf = /name="_csrf" value="([^"]+)"/.exec(r1.text)![1];
  await agent.post("/login").type("form").send({ _csrf: csrf, username, password });
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
  const hash = await bcrypt.hash("pw123", 12);
  Employees.create({ full_name: "Owner",   username: "owner", password_hash: hash, role: "owner" });
  Employees.create({ full_name: "Cashier", username: "cash",  password_hash: hash, role: "employee" });
  Menu.create({ name: "Latte",    price: 5000, sort_order: 1 });
  Menu.create({ name: "Espresso", price: 3000, sort_order: 2 });
});

afterAll(() => {
  closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

describe("Sales flow", () => {
  it("cashier can create a shift and enter line items", async () => {
    const { app } = await import("../../src/app");
    const agent = await loginAs(app, "cash", "pw123");

    let csrf = await csrfFrom(agent, "/sales/new");
    const create = await agent.post("/sales").type("form").send({ _csrf: csrf, business_date: "2026-05-12", shift: "morning" });
    expect(create.status).toBe(302);
    const sessionUrl = create.headers.location!;
    const id = Number(sessionUrl.split("/").pop());

    // entry page renders
    const entry = await agent.get(sessionUrl);
    expect(entry.text).toContain("Latte");
    expect(entry.text).toContain("Espresso");

    // upsert a line (HTMX-style POST returns HTML fragments — we just check status)
    csrf = await csrfFrom(agent, sessionUrl); // get a fresh csrf token if needed
    const latte = Menu.listActive().find(m => m.name === "Latte")!;
    const post = await agent.post(`/sales/${id}/lines/${latte.id}`)
      .set("x-csrf-token", csrf)
      .type("form").send({ qty: 3 });
    expect(post.status).toBe(200);
    expect(post.text).toContain("15.00"); // 3 * 50.00

    // close the shift
    csrf = await csrfFrom(agent, sessionUrl);
    const close = await agent.post(`/sales/${id}/close`).type("form").send({ _csrf: csrf });
    expect(close.status).toBe(302);

    // back on the entry page, "Reopen shift" is not visible to cashier
    const after = await agent.get(sessionUrl);
    expect(after.text).not.toContain("Reopen shift");
  });

  it("owner can see all shifts; cashier only their own", async () => {
    const { app } = await import("../../src/app");

    // cashier creates a shift
    const cashierAgent = await loginAs(app, "cash", "pw123");
    let csrf = await csrfFrom(cashierAgent, "/sales/new");
    await cashierAgent.post("/sales").type("form").send({ _csrf: csrf, business_date: "2026-05-12", shift: "morning" });

    // owner sees it
    const ownerAgent = await loginAs(app, "owner", "pw123");
    const ownerList = await ownerAgent.get("/sales");
    expect(ownerList.text).toContain("2026-05-12");

    // cashier sees their own
    const cashierList = await cashierAgent.get("/sales");
    expect(cashierList.text).toContain("2026-05-12");
  });

  it("non-owner can't edit a closed shift", async () => {
    const { app } = await import("../../src/app");
    const cashierAgent = await loginAs(app, "cash", "pw123");
    let csrf = await csrfFrom(cashierAgent, "/sales/new");
    const create = await cashierAgent.post("/sales").type("form").send({ _csrf: csrf, business_date: "2026-05-12", shift: "morning" });
    const id = Number(create.headers.location!.split("/").pop());

    csrf = await csrfFrom(cashierAgent, `/sales/${id}`);
    await cashierAgent.post(`/sales/${id}/close`).type("form").send({ _csrf: csrf });

    // try to update a line — should be 403
    const latte = Menu.listActive().find(m => m.name === "Latte")!;
    csrf = await csrfFrom(cashierAgent, `/sales/${id}`);
    const post = await cashierAgent.post(`/sales/${id}/lines/${latte.id}`)
      .set("x-csrf-token", csrf)
      .type("form").send({ qty: 1 });
    expect(post.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run, expect pass**

```bash
npm test
```

Expected: 3 new tests pass. Cumulative ~67.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/sales.test.ts
git commit -m "test(sales): end-to-end shift creation + entry + close"
```

---

## Plan 3 — done

After all 8 tasks land:
- Owner CRUDs the menu (add, edit, activate/deactivate, sort order).
- Cashier (or owner) starts a shift, types qty per menu item, sees totals update live via HTMX with the ember number-flash.
- Cashier fills cash + bank transfer + notes; difference is auto-computed (red if shortage, green if overage, smoke if zero).
- "Close shift" locks the session for the cashier; owner can reopen.
- Sales list is filterable by date range, status, employee (owner only).
- All writes audit-logged.

**Next:** Plan 4 (Purchases & Petty Cash) — two flat-log resources.
