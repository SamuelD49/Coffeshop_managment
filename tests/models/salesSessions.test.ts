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
