import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { unlinkSync, existsSync } from "fs";
import { closeDb, runMigrations } from "../../src/lib/db";
import * as Employees from "../../src/models/employees";
import * as Guarantors from "../../src/models/guarantors";

const TEST_DB = "./data/test-guarantors.db";
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

describe("Guarantors", () => {
  it("create() inserts and returns the row", () => {
    const e = Employees.create({ full_name: "Almaz", username: "alm", password_hash: "h", role: "employee" });
    const g = Guarantors.create({
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

  it("listForEmployee() returns rows ordered by created_at", () => {
    const e = Employees.create({ full_name: "Almaz", username: "alm", password_hash: "h", role: "employee" });
    Guarantors.create({ employee_id: e.id, full_name: "Mulu", phone: null, address: null, relation_to_employee: null, national_id_number: null, national_id_type: null, occupation: null, workplace: null, notes: null });
    Guarantors.create({ employee_id: e.id, full_name: "Hanna", phone: null, address: null, relation_to_employee: null, national_id_number: null, national_id_type: null, occupation: null, workplace: null, notes: null });
    expect(Guarantors.listForEmployee(e.id).map(g => g.full_name)).toEqual(["Mulu", "Hanna"]);
  });

  it("findById() returns row or null", () => {
    const e = Employees.create({ full_name: "Almaz", username: "alm", password_hash: "h", role: "employee" });
    const g = Guarantors.create({ employee_id: e.id, full_name: "Mulu", phone: null, address: null, relation_to_employee: null, national_id_number: null, national_id_type: null, occupation: null, workplace: null, notes: null });
    expect(Guarantors.findById(g.id)?.full_name).toBe("Mulu");
    expect(Guarantors.findById(999)).toBeNull();
  });

  it("update() persists changes", () => {
    const e = Employees.create({ full_name: "Almaz", username: "alm", password_hash: "h", role: "employee" });
    const g = Guarantors.create({ employee_id: e.id, full_name: "Mulu", phone: null, address: null, relation_to_employee: null, national_id_number: null, national_id_type: null, occupation: null, workplace: null, notes: null });
    Guarantors.update(g.id, { full_name: "Mulu Bekele", phone: "+251911", address: "Bole", relation_to_employee: "Aunt", national_id_number: "G1", national_id_type: "Kebele", occupation: "Teacher", workplace: "Bole School", notes: null });
    expect(Guarantors.findById(g.id)?.full_name).toBe("Mulu Bekele");
    expect(Guarantors.findById(g.id)?.phone).toBe("+251911");
  });

  it("remove() deletes the row", () => {
    const e = Employees.create({ full_name: "Almaz", username: "alm", password_hash: "h", role: "employee" });
    const g = Guarantors.create({ employee_id: e.id, full_name: "Mulu", phone: null, address: null, relation_to_employee: null, national_id_number: null, national_id_type: null, occupation: null, workplace: null, notes: null });
    Guarantors.remove(g.id);
    expect(Guarantors.findById(g.id)).toBeNull();
  });
});
