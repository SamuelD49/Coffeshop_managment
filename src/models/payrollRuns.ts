import { getDb } from "../lib/db";

export type PayrollRun = {
  id: number;
  year: number;
  month: number;
  status: "draft" | "approved";
  prepared_by: number | null;
  approved_by: number | null;
  created_at: string;
  updated_at: string;
};

export type CreateInput = { year: number; month: number; prepared_by: number | null };

export function create(input: CreateInput): PayrollRun {
  const r = getDb().prepare(`
    INSERT INTO payroll_runs (year, month, prepared_by) VALUES (@year, @month, @prepared_by)
  `).run(input);
  return findById(Number(r.lastInsertRowid))!;
}

export function findById(id: number): PayrollRun | null {
  const r = getDb().prepare("SELECT * FROM payroll_runs WHERE id = ?").get(id) as PayrollRun | undefined;
  return r ?? null;
}

export function findByYearMonth(year: number, month: number): PayrollRun | null {
  const r = getDb().prepare("SELECT * FROM payroll_runs WHERE year = ? AND month = ?").get(year, month) as PayrollRun | undefined;
  return r ?? null;
}

export function listAll(): PayrollRun[] {
  return getDb().prepare("SELECT * FROM payroll_runs ORDER BY year DESC, month DESC").all() as PayrollRun[];
}

export function approve(id: number, approverId: number): void {
  getDb().prepare("UPDATE payroll_runs SET status = 'approved', approved_by = ?, updated_at = datetime('now') WHERE id = ?").run(approverId, id);
}

export function revert(id: number): void {
  getDb().prepare("UPDATE payroll_runs SET status = 'draft', approved_by = NULL, updated_at = datetime('now') WHERE id = ?").run(id);
}

// Deletes a run and (via ON DELETE CASCADE in the schema) all its entries.
export function remove(id: number): void {
  getDb().prepare("DELETE FROM payroll_runs WHERE id = ?").run(id);
}
