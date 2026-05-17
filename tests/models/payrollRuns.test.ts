import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { unlinkSync, existsSync } from "fs";
import { closeDb, runMigrations } from "../../src/lib/db";
import * as Employees from "../../src/models/employees";
import * as Runs from "../../src/models/payrollRuns";

import { seedTestShop, runInShop } from "../lib/testShop";

const TEST_DB = "./data/test-payroll-runs.db";
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

describe("PayrollRuns", () => {
  it("create() inserts a draft run", async () => {

    await runInShop(shopId, async () => {
    const owner = await Employees.create({ full_name: "O", username: "o", password_hash: "h", role: "owner" });
    const r = await Runs.create({ year: 2026, month: 5, prepared_by: owner.id });
    expect(r.id).toBeGreaterThan(0);
    expect(r.status).toBe("draft");
    expect(r.prepared_by).toBe(owner.id);
    expect(r.approved_by).toBeNull();
  

    });

  });

  it("unique (year, month) constraint", async () => {


    await runInShop(shopId, async () => {
    const o = await Employees.create({ full_name: "O", username: "o", password_hash: "h", role: "owner" });
    await Runs.create({ year: 2026, month: 5, prepared_by: o.id });
    await expect(Runs.create({ year: 2026, month: 5, prepared_by: o.id })).rejects.toThrow();
  


    });


  });

  it("findById(), findByYearMonth(), listAll() ordering", async () => {


    await runInShop(shopId, async () => {
    const o = await Employees.create({ full_name: "O", username: "o", password_hash: "h", role: "owner" });
    const a = await Runs.create({ year: 2026, month: 3, prepared_by: o.id });
    const b = await Runs.create({ year: 2026, month: 5, prepared_by: o.id });
    await Runs.create({ year: 2025, month: 12, prepared_by: o.id });
    expect((await Runs.findById(a.id))?.month).toBe(3);
    expect((await Runs.findByYearMonth(2026, 5))?.id).toBe(b.id);
    expect(await Runs.findByYearMonth(2027, 1)).toBeNull();
    const list = await Runs.listAll();
    expect(list[0].year).toBe(2026);
    expect(list[0].month).toBe(5); // newest first
    expect(list[list.length - 1].year).toBe(2025);
  


    });


  });

  it("approve() sets status + approved_by", async () => {


    await runInShop(shopId, async () => {
    const o = await Employees.create({ full_name: "O", username: "o", password_hash: "h", role: "owner" });
    const r = await Runs.create({ year: 2026, month: 5, prepared_by: o.id });
    await Runs.approve(r.id, o.id);
    const got = await Runs.findById(r.id);
    expect(got?.status).toBe("approved");
    expect(got?.approved_by).toBe(o.id);
  


    });


  });

  it("revert() flips an approved run back to draft", async () => {


    await runInShop(shopId, async () => {
    const o = await Employees.create({ full_name: "O", username: "o", password_hash: "h", role: "owner" });
    const r = await Runs.create({ year: 2026, month: 5, prepared_by: o.id });
    await Runs.approve(r.id, o.id);
    await Runs.revert(r.id);
    expect((await Runs.findById(r.id))?.status).toBe("draft");
    expect((await Runs.findById(r.id))?.approved_by).toBeNull();
  


    });


  });
});
