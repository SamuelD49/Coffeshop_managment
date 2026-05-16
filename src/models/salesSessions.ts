import { _legacySqliteDb } from "../lib/db";

export type SalesSession = {
  id: number;
  employee_id: number;
  business_date: string;
  shift: string | null;
  cash_amount: number;
  bank_transfer_amount: number;
  notes: string | null;
  status: "open" | "closed";
  created_at: string;
  updated_at: string;
};

export type SessionTotals = SalesSession & {
  subtotal: number;
  total_amount: number;
  difference: number;
};

export type CreateInput = { employee_id: number; business_date: string; shift: string | null };
export type HeaderInput = { cash_amount: number; bank_transfer_amount: number; notes: string | null };

export function create(input: CreateInput): SalesSession {
  const r = _legacySqliteDb().prepare(`
    INSERT INTO sales_sessions (employee_id, business_date, shift)
    VALUES (@employee_id, @business_date, @shift)
  `).run(input);
  return findById(Number(r.lastInsertRowid))!;
}

export function findById(id: number): SalesSession | null {
  const r = _legacySqliteDb().prepare("SELECT * FROM sales_sessions WHERE id = ?").get(id) as SalesSession | undefined;
  return r ?? null;
}

export function withTotals(id: number): SessionTotals | null {
  const s = findById(id);
  if (!s) return null;
  const row = _legacySqliteDb().prepare("SELECT COALESCE(SUM(total), 0) AS subtotal FROM sale_line_items WHERE sales_session_id = ?").get(id) as { subtotal: number };
  const subtotal = row.subtotal;
  const total_amount = s.cash_amount + s.bank_transfer_amount;
  return { ...s, subtotal, total_amount, difference: total_amount - subtotal };
}

export function updateHeader(id: number, input: HeaderInput): void {
  _legacySqliteDb().prepare(`
    UPDATE sales_sessions
    SET cash_amount = @cash_amount, bank_transfer_amount = @bank_transfer_amount, notes = @notes, updated_at = datetime('now')
    WHERE id = @id
  `).run({ ...input, id });
}

export function close(id: number): void {
  _legacySqliteDb().prepare("UPDATE sales_sessions SET status = 'closed', updated_at = datetime('now') WHERE id = ?").run(id);
}

export function reopen(id: number): void {
  _legacySqliteDb().prepare("UPDATE sales_sessions SET status = 'open', updated_at = datetime('now') WHERE id = ?").run(id);
}

// Deletes a session and (via ON DELETE CASCADE in the schema) all its sale_line_items.
export function remove(id: number): void {
  _legacySqliteDb().prepare("DELETE FROM sales_sessions WHERE id = ?").run(id);
}

export function listAll(filters: { from?: string; to?: string; employeeId?: number; status?: "open" | "closed" } = {}): SalesSession[] {
  const where: string[] = [];
  const params: any[] = [];
  if (filters.from)       { where.push("DATE(business_date) >= DATE(?)"); params.push(filters.from); }
  if (filters.to)         { where.push("DATE(business_date) <= DATE(?)"); params.push(filters.to); }
  if (filters.employeeId) { where.push("employee_id = ?"); params.push(filters.employeeId); }
  if (filters.status)     { where.push("status = ?");      params.push(filters.status); }
  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
  return _legacySqliteDb().prepare(`SELECT * FROM sales_sessions ${whereSql} ORDER BY business_date DESC, id DESC`).all(...params) as SalesSession[];
}

export function listForEmployee(employeeId: number): SalesSession[] {
  return listAll({ employeeId });
}
