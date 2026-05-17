import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { unlinkSync, existsSync } from "fs";
import { closeDb, runMigrations } from "../../src/lib/db";
import * as Employees from "../../src/models/employees";
import * as Menu from "../../src/models/menuItems";
import * as Sessions from "../../src/models/salesSessions";
import * as Lines from "../../src/models/saleLineItems";

import { seedTestShop, runInShop } from "../lib/testShop";

const TEST_DB = "./data/test-sales.db";
process.env.DB_PATH = TEST_DB;

let shopId: number;

beforeEach(async () => {
  await closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  await runMigrations();
  shopId = await seedTestShop();
});

afterAll(async () => {
  await closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

async function seedEmployee() {
  return await Employees.create({ full_name: "Cashier", username: "c", password_hash: "h", role: "employee" });
}


describe("SalesSessions", () => {
  it("create() inserts an open session", async () => {

    await runInShop(shopId, async () => {
    const e = await seedEmployee();
    const s = await Sessions.create({ employee_id: e.id, business_date: "2026-05-12", shift: "morning" });
    expect(s.id).toBeGreaterThan(0);
    expect(s.status).toBe("open");
    expect(s.cash_amount).toBe(0);
    expect(s.bank_transfer_amount).toBe(0);
  

    });

  });

  it("updateHeader() persists cash, bank, notes", async () => {


    await runInShop(shopId, async () => {
    const e = await seedEmployee();
    const s = await Sessions.create({ employee_id: e.id, business_date: "2026-05-12", shift: "morning" });
    await Sessions.updateHeader(s.id, { cash_amount: 50000, bank_transfer_amount: 25000, notes: "smooth shift" });
    const got = await Sessions.findById(s.id);
    expect(got?.cash_amount).toBe(50000);
    expect(got?.bank_transfer_amount).toBe(25000);
    expect(got?.notes).toBe("smooth shift");
  


    });


  });

  it("withTotals() computes subtotal, total_amount, difference", async () => {


    await runInShop(shopId, async () => {
    const e = await seedEmployee();
    const m1 = await Menu.create({ name: "Latte", price: 5000, sort_order: 1 });
    const m2 = await Menu.create({ name: "Espresso", price: 3000, sort_order: 2 });
    const s = await Sessions.create({ employee_id: e.id, business_date: "2026-05-12", shift: "morning" });
    await Lines.upsert(s.id, m1.id, 3); // 3 * 5000 = 15000
    await Lines.upsert(s.id, m2.id, 2); // 2 * 3000 = 6000
    await Sessions.updateHeader(s.id, { cash_amount: 21000, bank_transfer_amount: 0, notes: null });
    const t = await Sessions.withTotals(s.id);
    expect(t?.subtotal).toBe(21000);
    expect(t?.total_amount).toBe(21000);
    expect(t?.difference).toBe(0);
  


    });


  });

  it("withTotals() computes negative difference when cash short", async () => {


    await runInShop(shopId, async () => {
    const e = await seedEmployee();
    const m1 = await Menu.create({ name: "Latte", price: 5000, sort_order: 1 });
    const s = await Sessions.create({ employee_id: e.id, business_date: "2026-05-12", shift: "morning" });
    await Lines.upsert(s.id, m1.id, 2); // 10000 expected
    await Sessions.updateHeader(s.id, { cash_amount: 9500, bank_transfer_amount: 0, notes: null });
    const t = await Sessions.withTotals(s.id);
    expect(t?.subtotal).toBe(10000);
    expect(t?.total_amount).toBe(9500);
    expect(t?.difference).toBe(-500);
  


    });


  });

  it("close() and reopen() change status", async () => {


    await runInShop(shopId, async () => {
    const e = await seedEmployee();
    const s = await Sessions.create({ employee_id: e.id, business_date: "2026-05-12", shift: "morning" });
    await Sessions.close(s.id);
    expect((await Sessions.findById(s.id))?.status).toBe("closed");
    await Sessions.reopen(s.id);
    expect((await Sessions.findById(s.id))?.status).toBe("open");
  


    });


  });

  it("listForEmployee() and listAll() filter and order by business_date desc", async () => {


    await runInShop(shopId, async () => {
    const e1 = await seedEmployee();
    const e2 = await Employees.create({ full_name: "Other", username: "o", password_hash: "h", role: "employee" });
    await Sessions.create({ employee_id: e1.id, business_date: "2026-05-10", shift: "m" });
    await Sessions.create({ employee_id: e1.id, business_date: "2026-05-12", shift: "m" });
    await Sessions.create({ employee_id: e2.id, business_date: "2026-05-11", shift: "m" });
    expect((await Sessions.listForEmployee(e1.id)).map(s => s.business_date)).toEqual(["2026-05-12", "2026-05-10"]);
    expect((await Sessions.listAll()).map(s => s.business_date)).toEqual(["2026-05-12", "2026-05-11", "2026-05-10"]);
  


    });


  });
});
