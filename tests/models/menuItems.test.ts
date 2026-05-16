import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { unlinkSync, existsSync } from "fs";
import { closeDb, runMigrations } from "../../src/lib/db";
import * as Menu from "../../src/models/menuItems";
import * as Employees from "../../src/models/employees";
import * as Sessions from "../../src/models/salesSessions";
import * as Lines from "../../src/models/saleLineItems";

const TEST_DB = "./data/test-menu.db";
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

describe("MenuItems", () => {
  it("create() and findById()", () => {
    const m = Menu.create({ name: "Macchiato", price: 4500 });
    expect(m.id).toBeGreaterThan(0);
    expect(m.name).toBe("Macchiato");
    expect(m.price).toBe(4500);
    expect(Menu.findById(m.id)?.name).toBe("Macchiato");
  });

  it("listActive() returns only active rows ordered alphabetically", () => {
    Menu.create({ name: "B", price: 100 });
    Menu.create({ name: "A", price: 100 });
    Menu.create({ name: "C", price: 100 });
    expect(Menu.listActive().map(m => m.name)).toEqual(["A", "B", "C"]);
  });

  it("listAll() includes inactive", () => {
    const a = Menu.create({ name: "A", price: 1 });
    Menu.setActive(a.id, false);
    Menu.create({ name: "B", price: 1 });
    expect(Menu.listAll()).toHaveLength(2);
    expect(Menu.listActive()).toHaveLength(1);
  });

  it("update() persists changes", () => {
    const m = Menu.create({ name: "Macchiato", price: 4500 });
    Menu.update(m.id, { name: "Espresso", price: 3500 });
    const got = Menu.findById(m.id);
    expect(got?.name).toBe("Espresso");
    expect(got?.price).toBe(3500);
  });

  it("setActive() toggles is_active", () => {
    const m = Menu.create({ name: "X", price: 1 });
    expect(Menu.findById(m.id)?.is_active).toBe(1);
    Menu.setActive(m.id, false);
    expect(Menu.findById(m.id)?.is_active).toBe(0);
  });

  it("listActiveByPopularity() orders by lifetime qty sold desc, then name asc", async () => {
    const cashier = await Employees.create({ full_name: "C", username: "c", password_hash: "h", role: "employee" });
    const latte    = Menu.create({ name: "Latte",    price: 5000 });
    const espresso = Menu.create({ name: "Espresso", price: 3000 });
    const water    = Menu.create({ name: "Water",    price: 1000 }); // never sold
    const tea      = Menu.create({ name: "Tea",      price: 2000 });

    const session = Sessions.create({ employee_id: cashier.id, business_date: "2026-05-12", shift: null });
    Lines.upsert(session.id, espresso.id, 10); // top
    Lines.upsert(session.id, latte.id, 5);     // second
    Lines.upsert(session.id, tea.id, 2);       // third
    // water has no sales

    const ordered = Menu.listActiveByPopularity().map(m => m.name);
    expect(ordered).toEqual(["Espresso", "Latte", "Tea", "Water"]);
  });
});
