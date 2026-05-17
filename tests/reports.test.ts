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

beforeEach(async () => {
  await closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  await runMigrations();
});

afterAll(async () => {
  await closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

describe("Sales reports", () => {
  it("salesByDay() sums totals per business_date", async () => {
    const e = await Employees.create({ full_name: "C", username: "c", password_hash: "h", role: "employee" });
    const m = await Menu.create({ name: "Latte", price: 5000, sort_order: 1 });

    const s1 = await Sessions.create({ employee_id: e.id, business_date: "2026-05-10", shift: "m" });
    await Lines.upsert(s1.id, m.id, 2); // 10000
    await Sessions.updateHeader(s1.id, { cash_amount: 10000, bank_transfer_amount: 0, notes: null });

    const s2 = await Sessions.create({ employee_id: e.id, business_date: "2026-05-10", shift: "e" });
    await Lines.upsert(s2.id, m.id, 1); // 5000
    await Sessions.updateHeader(s2.id, { cash_amount: 5000, bank_transfer_amount: 0, notes: null });

    const s3 = await Sessions.create({ employee_id: e.id, business_date: "2026-05-12", shift: "m" });
    await Lines.upsert(s3.id, m.id, 4); // 20000
    await Sessions.updateHeader(s3.id, { cash_amount: 20000, bank_transfer_amount: 0, notes: null });

    const result = await Reports.salesByDay({ from: "2026-05-01", to: "2026-05-31" });
    expect(result.find(r => r.business_date === "2026-05-10")?.subtotal).toBe(15000);
    expect(result.find(r => r.business_date === "2026-05-12")?.subtotal).toBe(20000);
  });

  it("salesByItem() sums qty + revenue per menu item", async () => {
    const e = await Employees.create({ full_name: "C", username: "c", password_hash: "h", role: "employee" });
    const latte = await Menu.create({ name: "Latte", price: 5000, sort_order: 1 });
    const espresso = await Menu.create({ name: "Espresso", price: 3000, sort_order: 2 });

    const s = await Sessions.create({ employee_id: e.id, business_date: "2026-05-12", shift: "m" });
    await Lines.upsert(s.id, latte.id, 3);     // qty 3, total 15000
    await Lines.upsert(s.id, espresso.id, 5);  // qty 5, total 15000

    const result = await Reports.salesByItem({ from: "2026-05-01", to: "2026-05-31" });
    const r1 = result.find(r => r.name === "Latte")!;
    const r2 = result.find(r => r.name === "Espresso")!;
    expect(r1.qty).toBe(3);
    expect(r1.revenue).toBe(15000);
    expect(r2.qty).toBe(5);
    expect(r2.revenue).toBe(15000);
  });

  it("salesByEmployee() sums per cashier", async () => {
    const e1 = await Employees.create({ full_name: "Almaz", username: "a", password_hash: "h", role: "employee" });
    const e2 = await Employees.create({ full_name: "Bekele", username: "b", password_hash: "h", role: "employee" });
    const m = await Menu.create({ name: "Latte", price: 5000, sort_order: 1 });

    const s1 = await Sessions.create({ employee_id: e1.id, business_date: "2026-05-12", shift: "m" });
    await Lines.upsert(s1.id, m.id, 4); // 20000
    const s2 = await Sessions.create({ employee_id: e2.id, business_date: "2026-05-12", shift: "e" });
    await Lines.upsert(s2.id, m.id, 2); // 10000

    const result = await Reports.salesByEmployee({ from: "2026-05-01", to: "2026-05-31" });
    expect(result.find(r => r.full_name === "Almaz")?.subtotal).toBe(20000);
    expect(result.find(r => r.full_name === "Bekele")?.subtotal).toBe(10000);
  });
});

describe("Purchases reports", () => {
  it("purchasesByDay() sums totals per date", async () => {
    await Purchases.create({ purchase_date: "2026-05-10", description: "Beans", unit: "kg", qty: 2, unit_price: 50000, remark: null, entered_by: null });
    await Purchases.create({ purchase_date: "2026-05-10", description: "Milk",  unit: "L",  qty: 5, unit_price: 4000,  remark: null, entered_by: null });
    await Purchases.create({ purchase_date: "2026-05-12", description: "Sugar", unit: "kg", qty: 1, unit_price: 6000,  remark: null, entered_by: null });
    const r = await Reports.purchasesByDay({ from: "2026-05-01", to: "2026-05-31" });
    expect(r.find(d => d.purchase_date === "2026-05-10")?.total).toBe(120000);
    expect(r.find(d => d.purchase_date === "2026-05-12")?.total).toBe(6000);
  });
});

describe("Petty cash reports", () => {
  it("pettyCashSummary() returns totals per type and net delta", async () => {
    await Petty.create({ entry_date: "2026-05-12", description: "Initial",   payer_name: null, amount: 100000, type: "replenishment", remark: null, entered_by: null });
    await Petty.create({ entry_date: "2026-05-12", description: "Taxi",      payer_name: null, amount: 5000,   type: "expense",       remark: null, entered_by: null });
    await Petty.create({ entry_date: "2026-05-13", description: "Refunded",  payer_name: null, amount: 2000,   type: "refund",        remark: null, entered_by: null });
    await Petty.create({ entry_date: "2026-05-13", description: "Snacks",    payer_name: null, amount: 1500,   type: "expense",       remark: null, entered_by: null });
    const r = await Reports.pettyCashSummary({ from: "2026-05-01", to: "2026-05-31" });
    expect(r.totalIn).toBe(102000); // 100000 + 2000
    expect(r.totalOut).toBe(6500);  // 5000 + 1500
    expect(r.net).toBe(95500);
    expect(r.byType.expense).toBe(6500);
    expect(r.byType.refund).toBe(2000);
    expect(r.byType.replenishment).toBe(100000);
  });
});

describe("Dashboard totals", () => {
  it("todaySalesTotal() sums only the given business date", async () => {
    const e = await Employees.create({ full_name: "C", username: "c", password_hash: "h", role: "employee" });
    const m = await Menu.create({ name: "L", price: 1000, sort_order: 1 });
    const s = await Sessions.create({ employee_id: e.id, business_date: "2026-05-12", shift: "m" });
    await Lines.upsert(s.id, m.id, 3); // 3000
    const sOther = await Sessions.create({ employee_id: e.id, business_date: "2026-05-11", shift: "m" });
    await Lines.upsert(sOther.id, m.id, 99); // shouldn't count
    expect(await Reports.todaySalesTotal("2026-05-12")).toBe(3000);
  });

  it("todayCashVsBank() splits payment by tender", async () => {
    const e = await Employees.create({ full_name: "C", username: "c", password_hash: "h", role: "employee" });
    const s = await Sessions.create({ employee_id: e.id, business_date: "2026-05-12", shift: "m" });
    await Sessions.updateHeader(s.id, { cash_amount: 15000, bank_transfer_amount: 5000, notes: null });
    const r = await Reports.todayCashVsBank("2026-05-12");
    expect(r.cash).toBe(15000);
    expect(r.bank).toBe(5000);
  });
});
