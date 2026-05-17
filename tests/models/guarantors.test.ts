import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { unlinkSync, existsSync } from "fs";
import { closeDb, runMigrations } from "../../src/lib/db";
import * as Employees from "../../src/models/employees";
import * as Guarantors from "../../src/models/guarantors";

import { seedTestShop, runInShop } from "../lib/testShop";

const TEST_DB = "./data/test-guarantors.db";
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

describe("Guarantors", () => {
  it("create() inserts and returns the row", async () => {

    await runInShop(shopId, async () => {
    const e = await Employees.create({ full_name: "Almaz", username: "alm", password_hash: "h", role: "employee" });
    const g = await Guarantors.create({
      employee_id: e.id,
      full_name: "Mulu",
      phone: "+251911000111",
      address: "Addis",
      relation_to_employee: "Aunt",
      national_id_number: "G1",
      national_id_type: "Kebele",
      occupation: "Teacher",
      workplace: "Bole School",
      notes: "Stable employment 8 years",
    });
    expect(g.id).toBeGreaterThan(0);
    expect(g.full_name).toBe("Mulu");
    expect(g.employee_id).toBe(e.id);
  

    });

  });

  it("listForEmployee() returns rows ordered by created_at", async () => {


    await runInShop(shopId, async () => {
    const e = await Employees.create({ full_name: "Almaz", username: "alm", password_hash: "h", role: "employee" });
    await Guarantors.create({ employee_id: e.id, full_name: "Mulu", phone: null, address: null, relation_to_employee: null, national_id_number: null, national_id_type: null, occupation: null, workplace: null, notes: null });
    await Guarantors.create({ employee_id: e.id, full_name: "Hanna", phone: null, address: null, relation_to_employee: null, national_id_number: null, national_id_type: null, occupation: null, workplace: null, notes: null });
    expect((await Guarantors.listForEmployee(e.id)).map(g => g.full_name)).toEqual(["Mulu", "Hanna"]);
  


    });


  });

  it("findById() returns row or null", async () => {


    await runInShop(shopId, async () => {
    const e = await Employees.create({ full_name: "Almaz", username: "alm", password_hash: "h", role: "employee" });
    const g = await Guarantors.create({ employee_id: e.id, full_name: "Mulu", phone: null, address: null, relation_to_employee: null, national_id_number: null, national_id_type: null, occupation: null, workplace: null, notes: null });
    expect((await Guarantors.findById(g.id))?.full_name).toBe("Mulu");
    expect(await Guarantors.findById(999)).toBeNull();
  


    });


  });

  it("update() persists changes", async () => {


    await runInShop(shopId, async () => {
    const e = await Employees.create({ full_name: "Almaz", username: "alm", password_hash: "h", role: "employee" });
    const g = await Guarantors.create({ employee_id: e.id, full_name: "Mulu", phone: null, address: null, relation_to_employee: null, national_id_number: null, national_id_type: null, occupation: null, workplace: null, notes: null });
    await Guarantors.update(g.id, { full_name: "Mulu Bekele", phone: "+251911", address: "Bole", relation_to_employee: "Aunt", national_id_number: "G1", national_id_type: "Kebele", occupation: "Teacher", workplace: "Bole School", notes: null });
    expect((await Guarantors.findById(g.id))?.full_name).toBe("Mulu Bekele");
    expect((await Guarantors.findById(g.id))?.phone).toBe("+251911");
  


    });


  });

  it("remove() deletes the row", async () => {


    await runInShop(shopId, async () => {
    const e = await Employees.create({ full_name: "Almaz", username: "alm", password_hash: "h", role: "employee" });
    const g = await Guarantors.create({ employee_id: e.id, full_name: "Mulu", phone: null, address: null, relation_to_employee: null, national_id_number: null, national_id_type: null, occupation: null, workplace: null, notes: null });
    await Guarantors.remove(g.id);
    expect(await Guarantors.findById(g.id)).toBeNull();
  


    });


  });
});
