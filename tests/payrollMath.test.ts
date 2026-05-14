import { describe, it, expect } from "vitest";
import { computeEntry, sumColumn, EntryInput, ComputedEntry } from "../src/lib/payrollMath";

const sample: EntryInput = {
  basic_salary: 500000,   // 5,000.00 in cents
  days_worked: 30,
  standard_days_in_month: 30,
  pension_employer_pct: 11,
  pension_employee_pct: 7,
  income_tax: 50000,
  advance_salary: 0,
};

describe("computeEntry", () => {
  it("full month with no deductions other than pension + tax", () => {
    const e = computeEntry(sample);
    expect(e.gross_salary).toBe(500000);
    expect(e.pension_employer_amount).toBe(55000); // 11%
    expect(e.pension_employee_amount).toBe(35000); // 7%
    expect(e.total_deduction).toBe(35000 + 50000 + 0);
    expect(e.net_payment).toBe(500000 - 85000);
  });

  it("partial month prorates gross", () => {
    const e = computeEntry({ ...sample, days_worked: 15 });
    expect(e.gross_salary).toBe(250000);
    expect(e.pension_employer_amount).toBe(27500);
    expect(e.pension_employee_amount).toBe(17500);
  });

  it("zero days zeroes everything but tax + advance", () => {
    const e = computeEntry({ ...sample, days_worked: 0, income_tax: 0, advance_salary: 0 });
    expect(e.gross_salary).toBe(0);
    expect(e.pension_employer_amount).toBe(0);
    expect(e.pension_employee_amount).toBe(0);
    expect(e.total_deduction).toBe(0);
    expect(e.net_payment).toBe(0);
  });

  it("advance salary feeds into total_deduction and net", () => {
    const e = computeEntry({ ...sample, advance_salary: 100000 });
    expect(e.total_deduction).toBe(35000 + 50000 + 100000);
    expect(e.net_payment).toBe(500000 - e.total_deduction);
  });

  it("uses half-up rounding on pension percentages", () => {
    // basic 100, days 1/30, pe 7%. gross = 100 * 1/30 = 3.333... → 3 (rounded)
    const e = computeEntry({
      basic_salary: 100,
      days_worked: 1,
      standard_days_in_month: 30,
      pension_employer_pct: 7,
      pension_employee_pct: 7,
      income_tax: 0,
      advance_salary: 0,
    });
    expect(e.gross_salary).toBe(3); // 100 * (1/30) ≈ 3.33 → 3
    expect(e.pension_employer_amount).toBe(0); // 3 * 7 / 100 = 0.21 → 0
  });

  it("net can be negative if tax + advance > gross", () => {
    const e = computeEntry({ ...sample, days_worked: 5, income_tax: 100000, advance_salary: 50000 });
    // gross = 500000 * 5/30 = 83333
    expect(e.gross_salary).toBe(83333);
    // pension_emp = 83333 * 0.07 ≈ 5833
    expect(e.pension_employee_amount).toBe(5833);
    // total_deduction = 5833 + 100000 + 50000 = 155833
    expect(e.total_deduction).toBe(155833);
    // net = 83333 - 155833 = -72500
    expect(e.net_payment).toBe(-72500);
  });

  it("bonus is added to net but NOT to the pension base", () => {
    const e = computeEntry({ ...sample, bonus: 75000 });
    expect(e.gross_salary).toBe(500000);
    expect(e.pension_employee_amount).toBe(35000); // 7% of 500000 — unchanged
    expect(e.pension_employer_amount).toBe(55000); // 11% — unchanged
    expect(e.total_deduction).toBe(35000 + 50000); // tax + pension_emp, no penalty
    // net = gross + bonus - deductions = 500000 + 75000 - 85000 = 490000
    expect(e.net_payment).toBe(490000);
  });

  it("penalty is added to total_deduction (subtracts from net)", () => {
    const e = computeEntry({ ...sample, penalty: 20000 });
    expect(e.total_deduction).toBe(35000 + 50000 + 20000);
    expect(e.net_payment).toBe(500000 - e.total_deduction);
  });

  it("bonus and penalty combine cleanly", () => {
    const e = computeEntry({ ...sample, bonus: 30000, penalty: 10000 });
    expect(e.gross_salary).toBe(500000);
    expect(e.total_deduction).toBe(35000 + 50000 + 10000);
    expect(e.net_payment).toBe(500000 + 30000 - 95000);
  });

  it("missing bonus/penalty default to zero (legacy callers)", () => {
    const e1 = computeEntry(sample);
    const e2 = computeEntry({ ...sample, bonus: 0, penalty: 0 });
    expect(e1).toEqual(e2);
  });
});

describe("sumColumn", () => {
  it("sums an integer-valued column", () => {
    const rows = [{ x: 10 }, { x: 20 }, { x: 30 }];
    expect(sumColumn(rows, "x")).toBe(60);
  });

  it("returns 0 on empty array", () => {
    expect(sumColumn([], "x")).toBe(0);
  });
});
