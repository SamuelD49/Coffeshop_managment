import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { unlinkSync, existsSync } from "fs";
import { closeDb, runMigrations } from "../src/lib/db";
import * as Employees from "../src/models/employees";
import * as Guarantors from "../src/models/guarantors";
import * as Attachments from "../src/models/attachments";
import { calculateCompleteness } from "../src/lib/onboarding";

const TEST_DB = "./data/test-onboarding.db";
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

function seedEmployee() {
  return Employees.create({ full_name: "Almaz", username: "alm", password_hash: "h", role: "employee" });
}

function fillPersonal(id: number) {
  Employees.updatePersonal(id, {
    full_name: "Almaz",
    phone: "+251911",
    national_id_number: "ID1",
    national_id_type: "Kebele",
    date_of_birth: "1990-01-01",
    gender: "F",
    marital_status: "single",
    address: "Addis",
    emergency_contact_name: "Hanna",
    emergency_contact_phone: "+251912",
    emergency_contact_relation: "Sister",
  });
}

describe("calculateCompleteness", () => {
  it("flags personal-incomplete when fields are missing", () => {
    const e = seedEmployee();
    const r = calculateCompleteness(e.id);
    expect(r.complete).toBe(false);
    expect(r.missing).toContain("phone");
    expect(r.missing).toContain("national_id_number");
    expect(r.missing).toContain("address");
  });

  it("flags missing documents", () => {
    const e = seedEmployee();
    fillPersonal(e.id);
    const r = calculateCompleteness(e.id);
    expect(r.missing).toContain("profile_photo");
    expect(r.missing).toContain("id_front");
    expect(r.missing).toContain("id_back");
    expect(r.missing).toContain("contract");
  });

  it("flags missing guarantor and guarantor id", () => {
    const e = seedEmployee();
    fillPersonal(e.id);
    for (const k of ["profile_photo", "id_front", "id_back", "contract"] as const) {
      Attachments.create({ owner_type: "employee", owner_id: e.id, kind: k, filename: "x", original_name: "x", mime_type: "image/png", size_bytes: 1, uploaded_by: null });
    }
    const r = calculateCompleteness(e.id);
    expect(r.missing).toContain("guarantor");
  });

  it("complete=true when everything present", () => {
    const e = seedEmployee();
    fillPersonal(e.id);
    for (const k of ["profile_photo", "id_front", "id_back", "contract"] as const) {
      Attachments.create({ owner_type: "employee", owner_id: e.id, kind: k, filename: "x", original_name: "x", mime_type: "image/png", size_bytes: 1, uploaded_by: null });
    }
    const g = Guarantors.create({
      employee_id: e.id, full_name: "Mulu", phone: "+251", address: "Addis",
      relation_to_employee: "Aunt", national_id_number: "G1", national_id_type: "Kebele",
      occupation: "T", workplace: "S", notes: null,
    });
    Attachments.create({ owner_type: "guarantor", owner_id: g.id, kind: "id_front", filename: "g", original_name: "g", mime_type: "image/png", size_bytes: 1, uploaded_by: null });
    const r = calculateCompleteness(e.id);
    expect(r.complete).toBe(true);
    expect(r.missing).toEqual([]);
  });
});
