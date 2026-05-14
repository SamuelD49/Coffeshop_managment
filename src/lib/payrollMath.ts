export type EntryInput = {
  basic_salary: number;          // cents
  days_worked: number;           // can be fractional
  standard_days_in_month: number;
  pension_employer_pct: number;  // e.g. 11
  pension_employee_pct: number;  // e.g. 7
  income_tax: number;            // cents
  advance_salary: number;        // cents
  bonus?: number;                // cents — added to net, NOT to pension base
  penalty?: number;              // cents — added to deductions
};

export type ComputedEntry = {
  gross_salary: number;
  pension_employer_amount: number;
  pension_employee_amount: number;
  total_deduction: number;
  net_payment: number;
};

function halfUp(n: number): number {
  return Math.sign(n) * Math.round(Math.abs(n));
}

export function computeEntry(input: EntryInput): ComputedEntry {
  const days = Math.max(0, input.days_worked);
  const stdDays = Math.max(1, input.standard_days_in_month);
  const bonus   = Math.max(0, input.bonus   ?? 0);
  const penalty = Math.max(0, input.penalty ?? 0);

  // Gross stays the prorated basic salary. Bonuses are intentionally NOT
  // included in the pension base (typical Ethiopian practice — pensions
  // apply to basic salary only, not to one-off rewards). If you need
  // pension-eligible bonuses, fold them into basic_salary for that run.
  const gross_salary            = halfUp(input.basic_salary * (days / stdDays));
  const pension_employer_amount = halfUp((gross_salary * input.pension_employer_pct) / 100);
  const pension_employee_amount = halfUp((gross_salary * input.pension_employee_pct) / 100);

  const total_deduction = pension_employee_amount + input.income_tax + input.advance_salary + penalty;
  const net_payment     = gross_salary + bonus - total_deduction;

  return { gross_salary, pension_employer_amount, pension_employee_amount, total_deduction, net_payment };
}

export function sumColumn<T extends Record<string, any>>(rows: T[], key: keyof T): number {
  return rows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);
}
