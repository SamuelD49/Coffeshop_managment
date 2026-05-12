import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { unlinkSync, existsSync } from "fs";
import { closeDb, runMigrations } from "../../src/lib/db";
import * as Settings from "../../src/models/settings";

const TEST_DB = "./data/test-settings.db";
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

describe("Settings model", () => {
  it("reads seeded defaults", () => {
    expect(Settings.get("shop_name")).toBe("My Coffee Shop");
    expect(Settings.get("currency_symbol")).toBe("Br");
  });

  it("returns null for unknown keys", () => {
    expect(Settings.get("nonexistent")).toBeNull();
  });

  it("set() upserts a value", () => {
    Settings.set("shop_name", "Bunna Café");
    expect(Settings.get("shop_name")).toBe("Bunna Café");
    Settings.set("shop_name", "Bunna Café v2");
    expect(Settings.get("shop_name")).toBe("Bunna Café v2");
  });

  it("getAll() returns every key as a flat object", () => {
    const all = Settings.getAll();
    expect(all.shop_name).toBe("My Coffee Shop");
    expect(all.currency_code).toBe("ETB");
    expect(all.business_day_cutoff).toBe("00:00");
  });

  it("getNumber / getBool coerce types", () => {
    expect(Settings.getNumber("decimal_places")).toBe(2);
    expect(Settings.getNumber("pension_employer_default_pct")).toBe(11);
    expect(Settings.getBool("require_complete_hr_before_payroll")).toBe(true);
    Settings.set("require_complete_hr_before_payroll", "false");
    expect(Settings.getBool("require_complete_hr_before_payroll")).toBe(false);
  });
});
