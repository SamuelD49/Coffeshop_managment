import { getDb } from "../lib/db";

export type Purchase = {
  id: number;
  purchase_date: string;
  description: string;
  unit: string | null;
  qty: number;
  unit_price: number;
  total: number;
  remark: string | null;
  entered_by: number | null;
  created_at: string;
  updated_at: string;
};

export type CreateInput = Omit<Purchase, "id" | "total" | "created_at" | "updated_at">;
export type UpdateInput = Omit<CreateInput, "entered_by">;

export function create(input: CreateInput): Purchase {
  const total = Math.round(input.qty * input.unit_price);
  const r = getDb().prepare(`
    INSERT INTO purchase_requisitions (purchase_date, description, unit, qty, unit_price, total, remark, entered_by)
    VALUES (@purchase_date, @description, @unit, @qty, @unit_price, @total, @remark, @entered_by)
  `).run({ ...input, total });
  return findById(Number(r.lastInsertRowid))!;
}

export function findById(id: number): Purchase | null {
  const r = getDb().prepare("SELECT * FROM purchase_requisitions WHERE id = ?").get(id) as Purchase | undefined;
  return r ?? null;
}

export function update(id: number, input: UpdateInput): void {
  const total = Math.round(input.qty * input.unit_price);
  getDb().prepare(`
    UPDATE purchase_requisitions
    SET purchase_date = @purchase_date, description = @description, unit = @unit,
        qty = @qty, unit_price = @unit_price, total = @total, remark = @remark,
        updated_at = datetime('now')
    WHERE id = @id
  `).run({ ...input, total, id });
}

export function remove(id: number): void {
  getDb().prepare("DELETE FROM purchase_requisitions WHERE id = ?").run(id);
}

export function listAll(filters: { from?: string; to?: string } = {}): Purchase[] {
  const where: string[] = [];
  const params: any = {};
  if (filters.from) { where.push("purchase_date >= @from"); params.from = filters.from; }
  if (filters.to)   { where.push("purchase_date <= @to");   params.to = filters.to; }
  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
  return getDb().prepare(`SELECT * FROM purchase_requisitions ${whereSql} ORDER BY purchase_date DESC, id DESC`).all(params) as Purchase[];
}

export function sumTotalInRange(from: string, to: string): number {
  const r = getDb().prepare("SELECT COALESCE(SUM(total), 0) AS s FROM purchase_requisitions WHERE purchase_date BETWEEN ? AND ?").get(from, to) as { s: number };
  return r.s;
}
