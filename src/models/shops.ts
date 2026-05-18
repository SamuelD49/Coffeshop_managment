import { getDb, nowIso } from "../lib/kysely";
import { memoize, invalidate } from "../lib/cache";
import type { ShopsTable } from "../lib/db-types";
import type { Selectable } from "kysely";

export type Shop = Selectable<ShopsTable>;

// CRUD for shops. These functions intentionally do NOT consult
// currentShopId() — they operate on the shops table itself, which is the
// tenant container, not tenant-scoped data. The /signup flow creates a
// shop; an admin tool (not yet built) might list or rename shops.

export async function create(name: string): Promise<Shop> {
  const row = await getDb()
    .insertInto("shops")
    .values({ name, created_at: nowIso() })
    .returning(["id", "name", "created_at"])
    .executeTakeFirstOrThrow();
  return row as Shop;
}

export async function findById(id: number): Promise<Shop | null> {
  // localsMiddleware reads this on every authenticated request to check
  // is_active for the suspended-shop kick. 60s TTL means a superadmin
  // deactivation takes at most 60s to log a user out — fine in practice.
  return memoize(`shop:${id}`, 60_000, async () => {
    const r = await getDb()
      .selectFrom("shops")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    return r ?? null;
  });
}

export async function findByEmployeeId(employeeId: number): Promise<Shop | null> {
  const r = await getDb()
    .selectFrom("shops as s")
    .innerJoin("employees as e", "e.shop_id", "s.id")
    .selectAll("s")
    .where("e.id", "=", employeeId)
    .executeTakeFirst();
  return r ?? null;
}

export async function setActive(id: number, active: boolean): Promise<void> {
  await getDb()
    .updateTable("shops")
    .set({ is_active: active ? 1 : 0 })
    .where("id", "=", id)
    .execute();
  invalidate(`shop:${id}`);
}

export async function listAll(): Promise<Shop[]> {
  const rows = await getDb()
    .selectFrom("shops")
    .selectAll()
    .orderBy("id", "desc")
    .execute();
  return rows as Shop[];
}
