import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { unlinkSync, existsSync } from "fs";
import { closeDb, runMigrations } from "../../src/lib/db";
import * as Employees from "../../src/models/employees";
import * as Settings from "../../src/models/settings";
import * as Runs from "../../src/models/payrollRuns";
import * as Entries from "../../src/models/payrollEntries";

const TEST_DB = "./data/test-payroll-int.db";
process.env.DB_PATH = TEST_DB;
process.env.SESSION_SECRET = "test-secret";

async function loginAsOwner(app: any): Promise<request.SuperAgentTest> {
  const agent = request.agent(app);
  const r1 = await agent.get("/login");
  const csrf = /name="_csrf" value="([^"]+)"/.exec(r1.text)![1];
  await agent.post("/login").type("form").send({ _csrf: csrf, username: "owner", password: "pw" });
  return agent;
}

async function csrfFrom(agent: any, path: string): Promise<string> {
  const r = await agent.get(path);
  return /name="_csrf" value="([^"]+)"/.exec(r.text)![1];
}

beforeEach(async () => {
  closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  runMigrations();
  // Relax HR completeness for tests so auto-populate includes our seeded employees.
  Settings.set("require_complete_hr_before_payroll", "false");
  const hash = await bcrypt.hash("pw", 12);
  Employees.create({ full_name: "Owner",   username: "owner", password_hash: hash, role: "owner" });
  const e1 = Employees.create({ full_name: "Almaz", username: "alm", password_hash: hash, role: "employee" });
  Employees.updateEmployment(e1.id, { position: "Barista", hire_date: "2025-06-01", basic_salary: 500000, role: "employee", is_active: true, username: "alm" });
});

afterAll(() => {
  closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

describe("Payroll flow", () => {
  it("renders the list with empty state", async () => {
    const { app } = await import("../../src/app");
    const agent = await loginAsOwner(app);
    const res = await agent.get("/payroll");
    expect(res.status).toBe(200);
    expect(res.text).toContain("No payroll runs yet");
  });

  it("creates a run and auto-populates entries for active employees", async () => {
    const { app } = await import("../../src/app");
    const agent = await loginAsOwner(app);
    const csrf = await csrfFrom(agent, "/payroll/new");
    const res = await agent.post("/payroll").type("form").send({ _csrf: csrf, year: 2026, month: 5 });
    expect(res.status).toBe(302);
    const run = Runs.findByYearMonth(2026, 5);
    expect(run).not.toBeNull();
    const entries = Entries.listForRun(run!.id);
    expect(entries.length).toBe(2); // Owner + Almaz (Employees.listAll filters by active, not role)
    const almazEntry = entries.find(e => e.full_name === "Almaz")!;
    expect(almazEntry).toBeDefined();
    expect(almazEntry.pension_employer_pct).toBe(11);
    expect(almazEntry.pension_employee_pct).toBe(7);
    expect(almazEntry.gross_salary).toBe(500000);
  });

  it("updates an entry recomputes totals", async () => {
    const { app } = await import("../../src/app");
    const agent = await loginAsOwner(app);
    let csrf = await csrfFrom(agent, "/payroll/new");
    await agent.post("/payroll").type("form").send({ _csrf: csrf, year: 2026, month: 5 });
    const run = Runs.findByYearMonth(2026, 5)!;
    const almazEntry = Entries.listForRun(run.id).find(e => e.full_name === "Almaz")!;

    csrf = await csrfFrom(agent, `/payroll/${run.id}`);
    await agent.post(`/payroll/${run.id}/entries/${almazEntry.id}`).type("form").send({
      _csrf: csrf, days_worked: 20, income_tax: "30.00", advance_salary: "50.00",
    });
    const got = Entries.findById(almazEntry.id)!;
    expect(got.days_worked).toBe(20);
    expect(got.gross_salary).toBe(333333); // 500000 * 20/30
    expect(got.income_tax).toBe(3000);
    expect(got.advance_salary).toBe(5000);
  });

  it("approve locks editing; revert unlocks", async () => {
    const { app } = await import("../../src/app");
    const agent = await loginAsOwner(app);
    let csrf = await csrfFrom(agent, "/payroll/new");
    await agent.post("/payroll").type("form").send({ _csrf: csrf, year: 2026, month: 5 });
    const run = Runs.findByYearMonth(2026, 5)!;
    const almazEntry = Entries.listForRun(run.id).find(e => e.full_name === "Almaz")!;

    csrf = await csrfFrom(agent, `/payroll/${run.id}`);
    await agent.post(`/payroll/${run.id}/approve`).type("form").send({ _csrf: csrf });
    expect(Runs.findById(run.id)?.status).toBe("approved");

    // Attempt to update — should redirect (no error) but DB should be unchanged
    const before = Entries.findById(almazEntry.id)!;
    csrf = await csrfFrom(agent, `/payroll/${run.id}`);
    await agent.post(`/payroll/${run.id}/entries/${almazEntry.id}`).type("form").send({
      _csrf: csrf, days_worked: 5, income_tax: "0", advance_salary: "0",
    });
    const after = Entries.findById(almazEntry.id)!;
    expect(after.days_worked).toBe(before.days_worked);

    // Revert
    csrf = await csrfFrom(agent, `/payroll/${run.id}`);
    await agent.post(`/payroll/${run.id}/revert`).type("form").send({ _csrf: csrf });
    expect(Runs.findById(run.id)?.status).toBe("draft");
  });

  it("print view renders without sidebar", async () => {
    const { app } = await import("../../src/app");
    const agent = await loginAsOwner(app);
    let csrf = await csrfFrom(agent, "/payroll/new");
    await agent.post("/payroll").type("form").send({ _csrf: csrf, year: 2026, month: 5 });
    const run = Runs.findByYearMonth(2026, 5)!;
    const res = await agent.get(`/payroll/${run.id}/print`);
    expect(res.status).toBe(200);
    expect(res.text).toContain("Payroll sheet");
    expect(res.text).toContain("For the month of May 2026");
    // Sidebar nav links should not be present
    expect(res.text).not.toContain("Dashboard");
  });
});
