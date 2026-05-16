import { _legacySqliteDb } from "../lib/db";

export type PettyType = "expense" | "refund" | "replenishment";

export type PettyEntry = {
  id: number;
  entry_date: string;
  description: string;
  payer_name: string | null;
  amount: number;
  type: PettyType;
  remark: string | null;
  entered_by: number | null;
  created_at: string;
  updated_at: string;
};

export type PettyEntryWithBalance = PettyEntry & { running_balance: number };

export type CreateInput = Omit<PettyEntry, "id" | "created_at" | "updated_at">;
export type UpdateInput = Omit<CreateInput, "entered_by">;

export function signedAmount(e: Pick<PettyEntry, "amount" | "type">): number {
  return e.type === "expense" ? -e.amount : e.amount;
}

export function create(input: CreateInput): PettyEntry {
  const r = _legacySqliteDb().prepare(`
    INSERT INTO petty_cash_entries (entry_date, description, payer_name, amount, type, remark, entered_by)
    VALUES (@entry_date, @description, @payer_name, @amount, @type, @remark, @entered_by)
  `).run(input);
  return findById(Number(r.lastInsertRowid))!;
}

export function findById(id: number): PettyEntry | null {
  const r = _legacySqliteDb().prepare("SELECT * FROM petty_cash_entries WHERE id = ?").get(id) as PettyEntry | undefined;
  return r ?? null;
}

export function update(id: number, input: UpdateInput): void {
  _legacySqliteDb().prepare(`
    UPDATE petty_cash_entries
    SET entry_date = @entry_date, description = @description, payer_name = @payer_name,
        amount = @amount, type = @type, remark = @remark, updated_at = datetime('now')
    WHERE id = @id
  `).run({ ...input, id });
}

export function remove(id: number): void {
  _legacySqliteDb().prepare("DELETE FROM petty_cash_entries WHERE id = ?").run(id);
}

// Returns rows newest-first, but with running_balance computed chronologically
// (each row's running_balance is the cumulative signed sum at and including that row's date/id).
export function listWithBalance(filters: { from?: string; to?: string } = {}): PettyEntryWithBalance[] {
  const where: string[] = [];
  const params: any = {};
  if (filters.from) { where.push("entry_date >= @from"); params.from = filters.from; }
  if (filters.to)   { where.push("entry_date <= @to");   params.to = filters.to; }
  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";

  // Fetch chronologically to build the balance, then reverse for display.
  const asc = _legacySqliteDb().prepare(`SELECT * FROM petty_cash_entries ${whereSql} ORDER BY entry_date ASC, id ASC`).all(params) as PettyEntry[];
  let bal = 0;
  const annotated: PettyEntryWithBalance[] = asc.map(row => {
    bal += signedAmount(row);
    return { ...row, running_balance: bal };
  });
  return annotated.reverse();
}

export function currentBalance(): number {
  const r = _legacySqliteDb().prepare(`
    SELECT COALESCE(SUM(CASE WHEN type = 'expense' THEN -amount ELSE amount END), 0) AS bal
    FROM petty_cash_entries
  `).get() as { bal: number };
  return r.bal;
}
