import { getDb, nowIso } from "../lib/kysely";
import { invalidate } from "../lib/cache";
import { currentShopId } from "../lib/shopContext";
import type { PettyCashEntriesTable } from "../lib/db-types";
import type { Selectable } from "kysely";

export type PettyType = "expense" | "refund" | "replenishment";
export type PettyEntry = Selectable<PettyCashEntriesTable>;
export type PettyEntryWithBalance = PettyEntry & { running_balance: number };

export type CreateInput = Omit<PettyEntry, "id" | "shop_id" | "created_at" | "updated_at">;
export type UpdateInput = Omit<CreateInput, "entered_by">;

function bustReportsCache(): void {
  invalidate(`reports:shop:${currentShopId()}:`);
}

export function signedAmount(e: Pick<PettyEntry, "amount" | "type">): number {
  return e.type === "expense" ? -e.amount : e.amount;
}

export async function create(input: CreateInput): Promise<PettyEntry> {
  const now = nowIso();
  const r = await getDb()
    .insertInto("petty_cash_entries")
    .values({ ...input, shop_id: currentShopId(), created_at: now, updated_at: now })
    .returning("id")
    .executeTakeFirstOrThrow();
  bustReportsCache();
  return (await findById(r.id))!;
}

export async function findById(id: number): Promise<PettyEntry | null> {
  const r = await getDb()
    .selectFrom("petty_cash_entries")
    .selectAll()
    .where("shop_id", "=", currentShopId())
    .where("id", "=", id)
    .executeTakeFirst();
  return r ?? null;
}

export async function update(id: number, input: UpdateInput): Promise<void> {
  await getDb()
    .updateTable("petty_cash_entries")
    .set({ ...input, updated_at: nowIso() })
    .where("shop_id", "=", currentShopId())
    .where("id", "=", id)
    .execute();
  bustReportsCache();
}

export async function remove(id: number): Promise<void> {
  await getDb()
    .deleteFrom("petty_cash_entries")
    .where("shop_id", "=", currentShopId())
    .where("id", "=", id)
    .execute();
  bustReportsCache();
}

export async function listWithBalance(filters: { from?: string; to?: string } = {}): Promise<PettyEntryWithBalance[]> {
  let q = getDb()
    .selectFrom("petty_cash_entries")
    .selectAll()
    .where("shop_id", "=", currentShopId());
  if (filters.from) q = q.where("entry_date", ">=", filters.from);
  if (filters.to)   q = q.where("entry_date", "<=", filters.to);
  const asc = await q.orderBy("entry_date", "asc").orderBy("id", "asc").execute();
  let bal = 0;
  const annotated: PettyEntryWithBalance[] = asc.map((row) => {
    bal += signedAmount(row);
    return { ...row, running_balance: bal };
  });
  return annotated.reverse();
}

export async function currentBalance(): Promise<number> {
  const r = await getDb()
    .selectFrom("petty_cash_entries")
    .select((eb) =>
      eb.fn
        .coalesce(
          eb.fn.sum<number>(eb.case().when("type", "=", "expense").then(eb.neg(eb.ref("amount"))).else(eb.ref("amount")).end()),
          eb.lit(0),
        )
        .as("bal"),
    )
    .where("shop_id", "=", currentShopId())
    .executeTakeFirstOrThrow();
  return Number(r.bal);
}
