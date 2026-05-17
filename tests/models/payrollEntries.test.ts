import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { unlinkSync, existsSync } from "fs";
import { closeDb, runMigrations } from "../../src/lib/db";
import * as Employees from "../../src/models/employees";
import * as Runs from "../../src/models/payrollRuns";
import * as Entries from "../../src/models/payrollEntries";

const TEST_DB = "./data/test-payroll-entries.db";
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

async function seed() {
  const o = await Employees.create({ full_name: "Owner", username: "o", password_hash: "h", role: "owner" });
  const e = await Employees.create({ full_name: "Almaz", username: "a", password_hash: "h", role: "employee" });
  await Employees.updateEmployment(e.id, { position: "Barista", hire_date: "2025-06-01", basic_salary: 500000, role: "employee", is_active: true, username: "a" });
  const run = await Runs.create({ year: 2026, month: 5, prepared_by: o.id });
  return { o, e, run };
}

describe("PayrollEntries", () => {
  it("createFromEmployee() snapshots rates and computes totals", async () => {
    const { e, run } = await seed();
    const entry = await Entries.createFromEmployee({
      run_id: run.id,
      employee_id: e.id,
      basic_salary: 500000,
      days_worked: 30,
      standard_days_in_month: 30,
      pension_employer_pct: 11,
      pension_employee_pct: 7,
    });
    expect(entry.pension_employer_pct).toBe(11);
    expect(entry.pension_employee_pct).toBe(7);
    expect(entry.gross_salary).toBe(500000);
    expect(entry.pension_employer_amount).toBe(55000);
    expect(entry.pension_employee_amount).toBe(35000);
    expect(entry.total_deduction).toBe(35000);
    expect(entry.net_payment).toBe(465000);
    expect(entry.income_tax).toBe(0);
    expect(entry.advance_salary).toBe(0);
  });

  it("unique (run, employee) constraint", async () => {
    const { e, run } = await seed();
    await Entries.createFromEmployee({ run_id: run.id, employee_id: e.id, basic_salary: 1, days_worked: 1, standard_days_in_month: 30, pension_employer_pct: 11, pension_employee_pct: 7 });
    await expect(Entries.createFromEmployee({ run_id: run.id, employee_id: e.id, basic_salary: 1, days_worked: 1, standard_days_in_month: 30, pension_employer_pct: 11, pension_employee_pct: 7 })).rejects.toThrow();
  });

  it("update() re-runs the calculation with new inputs", async () => {
    const { e, run } = await seed();
    const entry = await Entries.createFromEmployee({ run_id: run.id, employee_id: e.id, basic_salary: 500000, days_worked: 30, standard_days_in_month: 30, pension_employer_pct: 11, pension_employee_pct: 7 });
    await Entries.update(entry.id, { days_worked: 20, income_tax: 30000, advance_salary: 50000 });
    const got = await Entries.findById(entry.id);
    expect(got?.days_worked).toBe(20);
    // gross = 500000 * 20/30 = 333333
    expect(got?.gross_salary).toBe(333333);
    // pension_emp = 333333 * 7 / 100 = 23333
    expect(got?.pension_employee_amount).toBe(23333);
    // total_deduction = 23333 + 30000 + 50000 = 103333
    expect(got?.total_deduction).toBe(103333);
    // net = 333333 - 103333 = 230000
    expect(got?.net_payment).toBe(230000);
  });

  it("listForRun() returns entries with employee full_name", async () => {
    const { e, run } = await seed();
    await Entries.createFromEmployee({ run_id: run.id, employee_id: e.id, basic_salary: 500000, days_worked: 30, standard_days_in_month: 30, pension_employer_pct: 11, pension_employee_pct: 7 });
    const list = await Entries.listForRun(run.id);
    expect(list).toHaveLength(1);
    expect(list[0].full_name).toBe("Almaz");
  });

  it("listForEmployee() returns past entries with run year/month", async () => {
    const { e, run } = await seed();
    await Entries.createFromEmployee({ run_id: run.id, employee_id: e.id, basic_salary: 500000, days_worked: 30, standard_days_in_month: 30, pension_employer_pct: 11, pension_employee_pct: 7 });
    const list = await Entries.listForEmployee(e.id);
    expect(list).toHaveLength(1);
    expect(list[0].year).toBe(2026);
    expect(list[0].month).toBe(5);
  });
});
