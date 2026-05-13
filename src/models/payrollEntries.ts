import { getDb } from "../lib/db";
import { computeEntry } from "../lib/payrollMath";

export type PayrollEntry = {
  id: number;
  payroll_run_id: number;
  employee_id: number;
  days_worked: number;
  basic_salary: number;
  pension_employer_pct: number;
  pension_employee_pct: number;
  pension_employer_amount: number;
  pension_employee_amount: number;
  gross_salary: number;
  income_tax: number;
  advance_salary: number;
  total_deduction: number;
  net_payment: number;
  signed_at: string | null;
  created_at: string;
  updated_at: string;
};

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
};

export function createFromEmployee(input: CreateInput): PayrollEntry {
  const c = computeEntry({
    basic_salary: input.basic_salary,
    days_worked: input.days_worked,
    standard_days_in_month: input.standard_days_in_month,
    pension_employer_pct: input.pension_employer_pct,
    pension_employee_pct: input.pension_employee_pct,
    income_tax: input.income_tax ?? 0,
    advance_salary: input.advance_salary ?? 0,
  });
  const r = getDb().prepare(`
    INSERT INTO payroll_entries (
      payroll_run_id, employee_id, days_worked, basic_salary,
      pension_employer_pct, pension_employee_pct,
      pension_employer_amount, pension_employee_amount,
      gross_salary, income_tax, advance_salary, total_deduction, net_payment
    ) VALUES (
      @run_id, @employee_id, @days_worked, @basic_salary,
      @pension_employer_pct, @pension_employee_pct,
      @pension_employer_amount, @pension_employee_amount,
      @gross_salary, @income_tax, @advance_salary, @total_deduction, @net_payment
    )
  `).run({
    run_id: input.run_id,
    employee_id: input.employee_id,
    basic_salary: input.basic_salary,
    days_worked: input.days_worked,
    pension_employer_pct: input.pension_employer_pct,
    pension_employee_pct: input.pension_employee_pct,
    pension_employer_amount: c.pension_employer_amount,
    pension_employee_amount: c.pension_employee_amount,
    gross_salary: c.gross_salary,
    income_tax: input.income_tax ?? 0,
    advance_salary: input.advance_salary ?? 0,
    total_deduction: c.total_deduction,
    net_payment: c.net_payment,
  });
  return findById(Number(r.lastInsertRowid))!;
}

export type UpdateInput = {
  days_worked: number;
  income_tax: number;
  advance_salary: number;
  standard_days_in_month?: number; // optional — usually unchanged
};

export function update(id: number, input: UpdateInput): void {
  const entry = findById(id);
  if (!entry) throw new Error(`Entry ${id} not found`);
  const stdDays = input.standard_days_in_month ?? 30;
  const c = computeEntry({
    basic_salary: entry.basic_salary,
    days_worked: input.days_worked,
    standard_days_in_month: stdDays,
    pension_employer_pct: entry.pension_employer_pct,
    pension_employee_pct: entry.pension_employee_pct,
    income_tax: input.income_tax,
    advance_salary: input.advance_salary,
  });
  getDb().prepare(`
    UPDATE payroll_entries SET
      days_worked = @days_worked,
      income_tax = @income_tax,
      advance_salary = @advance_salary,
      pension_employer_amount = @pension_employer_amount,
      pension_employee_amount = @pension_employee_amount,
      gross_salary = @gross_salary,
      total_deduction = @total_deduction,
      net_payment = @net_payment,
      updated_at = datetime('now')
    WHERE id = @id
  `).run({
    id,
    days_worked: input.days_worked,
    income_tax: input.income_tax,
    advance_salary: input.advance_salary,
    pension_employer_amount: c.pension_employer_amount,
    pension_employee_amount: c.pension_employee_amount,
    gross_salary: c.gross_salary,
    total_deduction: c.total_deduction,
    net_payment: c.net_payment,
  });
}

export function findById(id: number): PayrollEntry | null {
  const r = getDb().prepare("SELECT * FROM payroll_entries WHERE id = ?").get(id) as PayrollEntry | undefined;
  return r ?? null;
}

export function listForRun(runId: number): PayrollEntryWithEmployee[] {
  return getDb().prepare(`
    SELECT e.*, emp.full_name, emp.position
    FROM payroll_entries e
    JOIN employees emp ON emp.id = e.employee_id
    WHERE e.payroll_run_id = ?
    ORDER BY emp.full_name
  `).all(runId) as PayrollEntryWithEmployee[];
}

export function listForEmployee(employeeId: number): PayrollEntryWithRun[] {
  return getDb().prepare(`
    SELECT e.*, r.year, r.month, r.status
    FROM payroll_entries e
    JOIN payroll_runs r ON r.id = e.payroll_run_id
    WHERE e.employee_id = ?
    ORDER BY r.year DESC, r.month DESC
  `).all(employeeId) as PayrollEntryWithRun[];
}

export function removeForRun(runId: number): void {
  getDb().prepare("DELETE FROM payroll_entries WHERE payroll_run_id = ?").run(runId);
}
