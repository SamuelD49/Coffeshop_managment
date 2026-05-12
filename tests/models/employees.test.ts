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
