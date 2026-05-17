import { getDb, nowIso } from "../lib/kysely";
import { currentShopId } from "../lib/shopContext";
import { computeEntry } from "../lib/payrollMath";
import type { PayrollEntriesTable } from "../lib/db-types";
import type { Selectable } from "kysely";

export type PayrollEntry = Selectable<PayrollEntriesTable>;

export type PayrollEntryWithEmployee = PayrollEntry & {
  full_name: string;
  position: string | null;
};

export type PayrollEntryWithRun = PayrollEntry & {
  year: number;
  month: number;
  status: "draft" | "approved";
};

export type CreateInput = {
  run_id: number;
  employee_id: number;
  basic_salary: number;
  days_worked: number;
  standard_days_in_month: number;
  pension_employer_pct: number;
  pension_employee_pct: number;
  income_tax?: number;
  advance_salary?: number;
  bonus?: number;
  penalty?: number;
};

export async function createFromEmployee(input: CreateInput): Promise<PayrollEntry> {
  const bonus = input.bonus ?? 0;
  const penalty = input.penalty ?? 0;
  const income_tax = input.income_tax ?? 0;
  const advance_salary = input.advance_salary ?? 0;
  const c = computeEntry({
    basic_salary: input.basic_salary,
    days_worked: input.days_worked,
    standard_days_in_month: input.standard_days_in_month,
    pension_employer_pct: input.pension_employer_pct,
    pension_employee_pct: input.pension_employee_pct,
    income_tax,
    advance_salary,
    bonus,
    penalty,
  });
  const now = nowIso();
  const r = await getDb()
    .insertInto("payroll_entries")
    .values({
      shop_id: currentShopId(),
      payroll_run_id: input.run_id,
      employee_id: input.employee_id,
      days_worked: input.days_worked,
      basic_salary: input.basic_salary,
      pension_employer_pct: input.pension_employer_pct,
      pension_employee_pct: input.pension_employee_pct,
      pension_employer_amount: c.pension_employer_amount,
      pension_employee_amount: c.pension_employee_amount,
      gross_salary: c.gross_salary,
      income_tax,
      advance_salary,
      bonus,
      penalty,
      total_deduction: c.total_deduction,
      net_payment: c.net_payment,
      created_at: now,
      updated_at: now,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return (await findById(r.id))!;
}

export type UpdateInput = {
  days_worked: number;
  income_tax: number;
  advance_salary: number;
  bonus?: number;
  penalty?: number;
  standard_days_in_month?: number;
};

export async function update(id: number, input: UpdateInput): Promise<void> {
  const entry = await findById(id);
  if (!entry) throw new Error(`Entry ${id} not found`);
  const stdDays = input.standard_days_in_month ?? 30;
  const bonus = input.bonus ?? entry.bonus ?? 0;
  const penalty = input.penalty ?? entry.penalty ?? 0;
  const c = computeEntry({
    basic_salary: entry.basic_salary,
    days_worked: input.days_worked,
    standard_days_in_month: stdDays,
    pension_employer_pct: entry.pension_employer_pct,
    pension_employee_pct: entry.pension_employee_pct,
    income_tax: input.income_tax,
    advance_salary: input.advance_salary,
    bonus,
    penalty,
  });
  await getDb()
    .updateTable("payroll_entries")
    .set({
      days_worked: input.days_worked,
      income_tax: input.income_tax,
      advance_salary: input.advance_salary,
      bonus,
      penalty,
      pension_employer_amount: c.pension_employer_amount,
      pension_employee_amount: c.pension_employee_amount,
      gross_salary: c.gross_salary,
      total_deduction: c.total_deduction,
      net_payment: c.net_payment,
      updated_at: nowIso(),
    })
    .where("shop_id", "=", currentShopId())
    .where("id", "=", id)
    .execute();
}

export async function findById(id: number): Promise<PayrollEntry | null> {
  const r = await getDb()
    .selectFrom("payroll_entries")
    .selectAll()
    .where("shop_id", "=", currentShopId())
    .where("id", "=", id)
    .executeTakeFirst();
  return r ?? null;
}

export async function listForRun(runId: number): Promise<PayrollEntryWithEmployee[]> {
  return await getDb()
    .selectFrom("payroll_entries as e")
    .innerJoin("employees as emp", "emp.id", "e.employee_id")
    .selectAll("e")
    .select(["emp.full_name", "emp.position"])
    .where("e.shop_id", "=", currentShopId())
    .where("e.payroll_run_id", "=", runId)
    .orderBy("emp.full_name")
    .execute();
}

export async function listForEmployee(employeeId: number): Promise<PayrollEntryWithRun[]> {
  return await getDb()
    .selectFrom("payroll_entries as e")
    .innerJoin("payroll_runs as r", "r.id", "e.payroll_run_id")
    .selectAll("e")
    .select(["r.year", "r.month", "r.status"])
    .where("e.shop_id", "=", currentShopId())
    .where("e.employee_id", "=", employeeId)
    .orderBy("r.year", "desc")
    .orderBy("r.month", "desc")
    .execute();
}

export async function removeForRun(runId: number): Promise<void> {
  await getDb()
    .deleteFrom("payroll_entries")
    .where("shop_id", "=", currentShopId())
    .where("payroll_run_id", "=", runId)
    .execute();
}
