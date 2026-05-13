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
