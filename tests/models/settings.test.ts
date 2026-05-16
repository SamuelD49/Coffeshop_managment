import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { unlinkSync, existsSync } from "fs";
import { closeDb, runMigrations } from "../../src/lib/db";
import * as Settings from "../../src/models/settings";

const TEST_DB = "./data/test-settings.db";
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

describe("Settings model", () => {
  it("reads seeded defaults", async () => {
    expect(await Settings.get("shop_name")).toBe("My Coffee Shop");
    expect(await Settings.get("currency_symbol")).toBe("Br");
  });

  it("returns null for unknown keys", async () => {
    expect(await Settings.get("nonexistent")).toBeNull();
  });

  it("set() upserts a value", async () => {
    await Settings.set("shop_name", "Bunna Café");
    expect(await Settings.get("shop_name")).toBe("Bunna Café");
    await Settings.set("shop_name", "Bunna Café v2");
    expect(await Settings.get("shop_name")).toBe("Bunna Café v2");
  });

  it("getAll() returns every key as a flat object", async () => {
    const all = await Settings.getAll();
    expect(all.shop_name).toBe("My Coffee Shop");
    expect(all.currency_code).toBe("ETB");
    expect(all.business_day_cutoff).toBe("00:00");
  });

  it("getNumber / getBool coerce types", async () => {
    expect(await Settings.getNumber("decimal_places")).toBe(2);
    expect(await Settings.getNumber("pension_employer_default_pct")).toBe(11);
    expect(await Settings.getBool("require_complete_hr_before_payroll")).toBe(true);
    await Settings.set("require_complete_hr_before_payroll", "false");
    expect(await Settings.getBool("require_complete_hr_before_payroll")).toBe(false);
  });
});
