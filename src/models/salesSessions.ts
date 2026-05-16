import { getDb, nowIso } from "../lib/kysely";
import type { SalesSessionsTable } from "../lib/db-types";
import type { Selectable } from "kysely";

export type SalesSession = Selectable<SalesSessionsTable>;

export type SessionTotals = SalesSession & {
  subtotal: number;
  total_amount: number;
  difference: number;
};

export type CreateInput = { employee_id: number; business_date: string; shift: string | null };
export type HeaderInput = { cash_amount: number; bank_transfer_amount: number; notes: string | null };

export async function create(input: CreateInput): Promise<SalesSession> {
  const now = nowIso();
  const r = await getDb()
    .insertInto("sales_sessions")
    .values({
      employee_id: input.employee_id,
      business_date: input.business_date,
      shift: input.shift,
      created_at: now,
      updated_at: now,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return (await findById(r.id))!;
}

export async function findById(id: number): Promise<SalesSession | null> {
  const r = await getDb().selectFrom("sales_sessions").selectAll().where("id", "=", id).executeTakeFirst();
  return r ?? null;
}

export async function withTotals(id: number): Promise<SessionTotals | null> {
  const s = await findById(id);
  if (!s) return null;
  const row = await getDb()
    .selectFrom("sale_line_items")
    .select((eb) => eb.fn.coalesce(eb.fn.sum<number>("total"), eb.lit(0)).as("subtotal"))
    .where("sales_session_id", "=", id)
    .executeTakeFirstOrThrow();
  const subtotal = Number(row.subtotal);
  const total_amount = s.cash_amount + s.bank_transfer_amount;
  return { ...s, subtotal, total_amount, difference: total_amount - subtotal };
}

export async function updateHeader(id: number, input: HeaderInput): Promise<void> {
  await getDb()
    .updateTable("sales_sessions")
    .set({ ...input, updated_at: nowIso() })
    .where("id", "=", id)
    .execute();
}

export async function close(id: number): Promise<void> {
  await getDb()
    .updateTable("sales_sessions")
    .set({ status: "closed", updated_at: nowIso() })
    .where("id", "=", id)
    .execute();
}

export async function reopen(id: number): Promise<void> {
  await getDb()
    .updateTable("sales_sessions")
    .set({ status: "open", updated_at: nowIso() })
    .where("id", "=", id)
    .execute();
}

// Deletes a session and (via ON DELETE CASCADE in the schema) all its sale_line_items.
export async function remove(id: number): Promise<void> {
  await getDb().deleteFrom("sales_sessions").where("id", "=", id).execute();
}

export async function listAll(filters: { from?: string; to?: string; employeeId?: number; status?: "open" | "closed" } = {}): Promise<SalesSession[]> {
  let q = getDb().selectFrom("sales_sessions").selectAll();
  if (filters.from)       q = q.where("business_date", ">=", filters.from);
  if (filters.to)         q = q.where("business_date", "<=", filters.to);
  if (filters.employeeId) q = q.where("employee_id", "=", filters.employeeId);
  if (filters.status)     q = q.where("status", "=", filters.status);
  return await q.orderBy("business_date", "desc").orderBy("id", "desc").execute();
}

export async function listForEmployee(employeeId: number): Promise<SalesSession[]> {
  return listAll({ employeeId });
}
