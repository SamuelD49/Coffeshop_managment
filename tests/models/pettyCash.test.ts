import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { unlinkSync, existsSync } from "fs";
import { closeDb, runMigrations } from "../../src/lib/db";
import * as Petty from "../../src/models/pettyCash";

const TEST_DB = "./data/test-petty.db";
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

describe("PettyCash", () => {
  it("create() and findById()", async () => {
    const e = await Petty.create({ entry_date: "2026-05-12", description: "Taxi", payer_name: "Sam", amount: 5000, type: "expense", remark: null, entered_by: null });
    expect(e.id).toBeGreaterThan(0);
    expect((await Petty.findById(e.id))?.description).toBe("Taxi");
  });

  it("signedAmount() returns + for replenishment/refund, - for expense", async () => {
    expect(Petty.signedAmount({ type: "replenishment", amount: 1000 } as any)).toBe(1000);
    expect(Petty.signedAmount({ type: "refund", amount: 500 } as any)).toBe(500);
    expect(Petty.signedAmount({ type: "expense", amount: 200 } as any)).toBe(-200);
  });

  it("listWithBalance() computes a running balance ordered chronologically", async () => {
    await Petty.create({ entry_date: "2026-05-12", description: "Initial cash",   payer_name: null, amount: 100000, type: "replenishment", remark: null, entered_by: null });
    await Petty.create({ entry_date: "2026-05-12", description: "Taxi",           payer_name: null, amount: 5000,   type: "expense",       remark: null, entered_by: null });
    await Petty.create({ entry_date: "2026-05-13", description: "Returned coins", payer_name: null, amount: 2000,   type: "refund",        remark: null, entered_by: null });
    await Petty.create({ entry_date: "2026-05-13", description: "Snacks",         payer_name: null, amount: 1500,   type: "expense",       remark: null, entered_by: null });

    const rows = await Petty.listWithBalance();
    // newest first in display order, but balance computed chronologically:
    expect(rows.map(r => r.running_balance)).toEqual([95500, 97000, 95000, 100000]);
    // rows are returned newest-first
    expect(rows[0].description).toBe("Snacks");
    expect(rows[3].description).toBe("Initial cash");
  });

  it("listWithBalance() filters by date range", async () => {
    await Petty.create({ entry_date: "2026-05-10", description: "Old", payer_name: null, amount: 1, type: "replenishment", remark: null, entered_by: null });
    await Petty.create({ entry_date: "2026-05-12", description: "Mid", payer_name: null, amount: 1, type: "expense", remark: null, entered_by: null });
    await Petty.create({ entry_date: "2026-05-15", description: "New", payer_name: null, amount: 1, type: "expense", remark: null, entered_by: null });
    const rows = await Petty.listWithBalance({ from: "2026-05-11", to: "2026-05-13" });
    expect(rows.map(r => r.description)).toEqual(["Mid"]);
  });

  it("update() and remove() work", async () => {
    const e = await Petty.create({ entry_date: "2026-05-12", description: "X", payer_name: null, amount: 500, type: "expense", remark: null, entered_by: null });
    await Petty.update(e.id, { entry_date: "2026-05-13", description: "Y", payer_name: "Sam", amount: 700, type: "expense", remark: "updated" });
    const got = await Petty.findById(e.id);
    expect(got?.description).toBe("Y");
    expect(got?.amount).toBe(700);
    await Petty.remove(e.id);
    expect(await Petty.findById(e.id)).toBeNull();
  });

  it("currentBalance() returns the total signed sum", async () => {
    await Petty.create({ entry_date: "2026-05-12", description: "in",  payer_name: null, amount: 10000, type: "replenishment", remark: null, entered_by: null });
    await Petty.create({ entry_date: "2026-05-12", description: "out", payer_name: null, amount: 3000,  type: "expense",       remark: null, entered_by: null });
    expect(await Petty.currentBalance()).toBe(7000);
  });
});
