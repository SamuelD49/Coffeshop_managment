import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { unlinkSync, existsSync } from "fs";
import { closeDb, runMigrations } from "../../src/lib/db";
import * as Employees from "../../src/models/employees";

const TEST_DB = "./data/test-employees.db";
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

describe("Employees model (auth surface)", () => {
  it("count() returns 0 on empty DB", () => {
    expect(Employees.count()).toBe(0);
  });

  it("create() inserts and returns the row", () => {
    const e = Employees.create({
      full_name: "Sam",
      username: "sam",
      password_hash: "hash",
      role: "owner",
    });
    expect(e.id).toBeGreaterThan(0);
    expect(e.full_name).toBe("Sam");
    expect(e.role).toBe("owner");
    expect(Employees.count()).toBe(1);
  });

  it("findByUsername() returns the row or null", () => {
    Employees.create({ full_name: "Sam", username: "sam", password_hash: "h", role: "owner" });
    const found = Employees.findByUsername("sam");
    expect(found?.full_name).toBe("Sam");
    expect(Employees.findByUsername("nobody")).toBeNull();
  });

  it("findById() returns the row or null", () => {
    const e = Employees.create({ full_name: "Sam", username: "sam", password_hash: "h", role: "owner" });
    expect(Employees.findById(e.id)?.full_name).toBe("Sam");
    expect(Employees.findById(99999)).toBeNull();
  });

  it("findByUsername ignores inactive rows", () => {
    const e = Employees.create({ full_name: "Sam", username: "sam", password_hash: "h", role: "owner" });
    Employees.setActive(e.id, false);
    expect(Employees.findByUsername("sam")).toBeNull();
  });

  it("updatePassword() updates the hash", () => {
    const e = Employees.create({ full_name: "Sam", username: "sam", password_hash: "old", role: "owner" });
    Employees.updatePassword(e.id, "new");
    expect(Employees.findById(e.id)?.password_hash).toBe("new");
  });
});

describe("Employees full HR surface", () => {
  it("listAll() returns rows ordered by full_name", () => {
    Employees.create({ full_name: "Bekele", username: "bek", password_hash: "h", role: "employee" });
    Employees.create({ full_name: "Almaz",  username: "alm", password_hash: "h", role: "employee" });
    const all = Employees.listAll();
    expect(all.map(e => e.full_name)).toEqual(["Almaz", "Bekele"]);
  });

  it("listAll() excludes inactive when activeOnly=true", () => {
    const a = Employees.create({ full_name: "Almaz",  username: "alm", password_hash: "h", role: "employee" });
    Employees.setActive(a.id, false);
    Employees.create({ full_name: "Bekele", username: "bek", password_hash: "h", role: "employee" });
    expect(Employees.listAll({ activeOnly: true }).map(e => e.full_name)).toEqual(["Bekele"]);
    expect(Employees.listAll({ activeOnly: false })).toHaveLength(2);
  });

  it("findFull() returns every column including HR fields", () => {
    const e = Employees.create({ full_name: "Almaz", username: "alm", password_hash: "h", role: "employee" });
    const full = Employees.findFull(e.id);
    expect(full?.full_name).toBe("Almaz");
    expect("national_id_number" in (full ?? {})).toBe(true);
    expect("hire_date" in (full ?? {})).toBe(true);
  });

  it("updatePersonal() persists personal fields", () => {
    const e = Employees.create({ full_name: "Almaz", username: "alm", password_hash: "h", role: "employee" });
    Employees.updatePersonal(e.id, {
      full_name: "Almaz Tesfaye",
      phone: "+251911234567",
      national_id_number: "ID12345",
      national_id_type: "Kebele",
      date_of_birth: "1995-04-10",
      gender: "F",
      marital_status: "single",
      address: "Bole, Addis Ababa",
      emergency_contact_name: "Hanna",
      emergency_contact_phone: "+251911234568",
      emergency_contact_relation: "Sister",
    });
    const full = Employees.findFull(e.id);
    expect(full?.phone).toBe("+251911234567");
    expect(full?.national_id_number).toBe("ID12345");
    expect(full?.emergency_contact_name).toBe("Hanna");
  });

  it("updateEmployment() persists employment fields", () => {
    const e = Employees.create({ full_name: "Almaz", username: "alm", password_hash: "h", role: "employee" });
    Employees.updateEmployment(e.id, {
      position: "Barista",
      hire_date: "2025-06-01",
      basic_salary: 350000, // cents
      role: "employee",
      is_active: true,
    });
    const full = Employees.findFull(e.id);
    expect(full?.position).toBe("Barista");
    expect(full?.hire_date).toBe("2025-06-01");
    expect(full?.basic_salary).toBe(350000);
  });

  it("setOnboardingStatus() updates the status column", () => {
    const e = Employees.create({ full_name: "Almaz", username: "alm", password_hash: "h", role: "employee" });
    Employees.setOnboardingStatus(e.id, "complete");
    expect(Employees.findFull(e.id)?.onboarding_status).toBe("complete");
  });
});
