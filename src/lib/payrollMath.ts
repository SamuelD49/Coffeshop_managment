export type EntryInput = {
  basic_salary: number;          // cents
  days_worked: number;           // can be fractional
  standard_days_in_month: number;
  pension_employer_pct: number;  // e.g. 11
  pension_employee_pct: number;  // e.g. 7
  income_tax: number;            // cents
  advance_salary: number;        // cents
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
  const gross_salary = halfUp(input.basic_salary * (days / stdDays));
  const pension_employer_amount = halfUp((gross_salary * input.pension_employer_pct) / 100);
  const pension_employee_amount = halfUp((gross_salary * input.pension_employee_pct) / 100);
  const total_deduction = pension_employee_amount + input.income_tax + input.advance_salary;
  const net_payment = gross_salary - total_deduction;
  return { gross_salary, pension_employer_amount, pension_employee_amount, total_deduction, net_payment };
}

export function sumColumn<T extends Record<string, any>>(rows: T[], key: keyof T): number {
  return rows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);
}
