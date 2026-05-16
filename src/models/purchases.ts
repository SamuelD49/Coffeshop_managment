import { getDb, nowIso } from "../lib/kysely";
import type { PurchaseRequisitionsTable } from "../lib/db-types";
import type { Selectable } from "kysely";

export type Purchase = Selectable<PurchaseRequisitionsTable>;

export type CreateInput = Omit<Purchase, "id" | "total" | "created_at" | "updated_at">;
export type UpdateInput = Omit<CreateInput, "entered_by">;

export async function create(input: CreateInput): Promise<Purchase> {
  const total = Math.round(input.qty * input.unit_price);
  const now = nowIso();
  const r = await getDb()
    .insertInto("purchase_requisitions")
    .values({ ...input, total, created_at: now, updated_at: now })
    .returning("id")
    .executeTakeFirstOrThrow();
  return (await findById(r.id))!;
}

export async function findById(id: number): Promise<Purchase | null> {
  const r = await getDb().selectFrom("purchase_requisitions").selectAll().where("id", "=", id).executeTakeFirst();
  return r ?? null;
}

export async function update(id: number, input: UpdateInput): Promise<void> {
  const total = Math.round(input.qty * input.unit_price);
  await getDb()
    .updateTable("purchase_requisitions")
    .set({ ...input, total, updated_at: nowIso() })
    .where("id", "=", id)
    .execute();
}

export async function remove(id: number): Promise<void> {
  await getDb().deleteFrom("purchase_requisitions").where("id", "=", id).execute();
}

export async function listAll(filters: { from?: string; to?: string } = {}): Promise<Purchase[]> {
  let q = getDb().selectFrom("purchase_requisitions").selectAll();
  if (filters.from) q = q.where("purchase_date", ">=", filters.from);
  if (filters.to)   q = q.where("purchase_date", "<=", filters.to);
  return await q.orderBy("purchase_date", "desc").orderBy("id", "desc").execute();
}

export async function sumTotalInRange(from: string, to: string): Promise<number> {
  const r = await getDb()
    .selectFrom("purchase_requisitions")
    .select((eb) => eb.fn.coalesce(eb.fn.sum<number>("total"), eb.lit(0)).as("s"))
    .where("purchase_date", ">=", from)
    .where("purchase_date", "<=", to)
    .executeTakeFirstOrThrow();
  return Number(r.s);
}
