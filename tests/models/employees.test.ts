import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { unlinkSync, existsSync } from "fs";
import { closeDb, runMigrations } from "../../src/lib/db";
import * as Employees from "../../src/models/employees";

const TEST_DB = "./data/test-employees.db";
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

describe("Employees model (auth surface)", () => {
  it("count() returns 0 on empty DB", async () => {
    expect(await Employees.count()).toBe(0);
  });

  it("create() inserts and returns the row", async () => {
    const e = await Employees.create({
      full_name: "Sam",
      username: "sam",
      password_hash: "hash",
      role: "owner",
    });
    expect(e.id).toBeGreaterThan(0);
    expect(e.full_name).toBe("Sam");
    expect(e.role).toBe("owner");
    expect(await Employees.count()).toBe(1);
  });

  it("findByUsername() returns the row or null", async () => {
    await Employees.create({ full_name: "Sam", username: "sam", password_hash: "h", role: "owner" });
    const found = await Employees.findByUsername("sam");
    expect(found?.full_name).toBe("Sam");
    expect(await Employees.findByUsername("nobody")).toBeNull();
  });

  it("findById() returns the row or null", async () => {
    const e = await Employees.create({ full_name: "Sam", username: "sam", password_hash: "h", role: "owner" });
    expect((await Employees.findById(e.id))?.full_name).toBe("Sam");
    expect(await Employees.findById(99999)).toBeNull();
  });

  it("findByUsername ignores inactive rows", async () => {
    const e = await Employees.create({ full_name: "Sam", username: "sam", password_hash: "h", role: "owner" });
    await Employees.setActive(e.id, false);
    expect(await Employees.findByUsername("sam")).toBeNull();
  });

  it("updatePassword() updates the hash", async () => {
    const e = await Employees.create({ full_name: "Sam", username: "sam", password_hash: "old", role: "owner" });
    await Employees.updatePassword(e.id, "new");
    expect((await Employees.findById(e.id))?.password_hash).toBe("new");
  });
});

describe("Employees full HR surface", () => {
  it("listAll() returns rows ordered by full_name", async () => {
    await Employees.create({ full_name: "Bekele", username: "bek", password_hash: "h", role: "employee" });
    await Employees.create({ full_name: "Almaz",  username: "alm", password_hash: "h", role: "employee" });
    const all = await Employees.listAll();
    expect(all.map(e => e.full_name)).toEqual(["Almaz", "Bekele"]);
  });

  it("listAll() excludes inactive when activeOnly=true", async () => {
    const a = await Employees.create({ full_name: "Almaz",  username: "alm", password_hash: "h", role: "employee" });
    await Employees.setActive(a.id, false);
    await Employees.create({ full_name: "Bekele", username: "bek", password_hash: "h", role: "employee" });
    expect((await Employees.listAll({ activeOnly: true })).map(e => e.full_name)).toEqual(["Bekele"]);
    expect(await Employees.listAll({ activeOnly: false })).toHaveLength(2);
  });

  it("findFull() returns every column including HR fields", async () => {
    const e = await Employees.create({ full_name: "Almaz", username: "alm", password_hash: "h", role: "employee" });
    const full = await Employees.findFull(e.id);
    expect(full?.full_name).toBe("Almaz");
    expect("national_id_number" in (full ?? {})).toBe(true);
    expect("hire_date" in (full ?? {})).toBe(true);
  });

  it("updatePersonal() persists personal fields", async () => {
    const e = await Employees.create({ full_name: "Almaz", username: "alm", password_hash: "h", role: "employee" });
    await Employees.updatePersonal(e.id, {
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
    const full = await Employees.findFull(e.id);
    expect(full?.phone).toBe("+251911234567");
    expect(full?.national_id_number).toBe("ID12345");
    expect(full?.emergency_contact_name).toBe("Hanna");
  });

  it("updateEmployment() persists employment fields", async () => {
    const e = await Employees.create({ full_name: "Almaz", username: "alm", password_hash: "h", role: "employee" });
    await Employees.updateEmployment(e.id, {
      position: "Barista",
      hire_date: "2025-06-01",
      basic_salary: 350000, // cents
      role: "employee",
      is_active: true,
    });
    const full = await Employees.findFull(e.id);
    expect(full?.position).toBe("Barista");
    expect(full?.hire_date).toBe("2025-06-01");
    expect(full?.basic_salary).toBe(350000);
  });

  it("setOnboardingStatus() updates the status column", async () => {
    const e = await Employees.create({ full_name: "Almaz", username: "alm", password_hash: "h", role: "employee" });
    await Employees.setOnboardingStatus(e.id, "complete");
    expect((await Employees.findFull(e.id))?.onboarding_status).toBe("complete");
  });
});
