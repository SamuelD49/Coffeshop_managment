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
