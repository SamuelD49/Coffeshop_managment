import { getDb, nowIso } from "../lib/kysely";
import { currentShopId } from "../lib/shopContext";
import { memoize, invalidate } from "../lib/cache";
import type { MenuItemsTable } from "../lib/db-types";
import type { Selectable } from "kysely";
import { sql } from "kysely";

function bustMenuCaches(): void {
  const shopId = currentShopId();
  invalidate(`menu:shop:${shopId}:`);
  // Setup status checks "shop has menu items" — bust it too so the
  // checklist updates when the first menu item lands.
  invalidate(`setupStatus:shop:${shopId}`);
}

export type MenuItem = Selectable<MenuItemsTable>;

export type CreateInput = { name: string; price: number; sort_order?: number; token_color?: string | null };
export type UpdateInput = { name: string; price: number; sort_order?: number; token_color?: string | null };

export async function create(input: CreateInput): Promise<MenuItem> {
  const now = nowIso();
  const r = await getDb()
    .insertInto("menu_items")
    .values({
      shop_id: currentShopId(),
      name: input.name,
      price: input.price,
      sort_order: input.sort_order ?? 0,
      token_color: input.token_color ?? null,
      created_at: now,
      updated_at: now,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  bustMenuCaches();
  return (await findById(Number(r.id)))!;
}

export async function findById(id: number): Promise<MenuItem | null> {
  const row = await getDb()
    .selectFrom("menu_items")
    .selectAll()
    .where("shop_id", "=", currentShopId())
    .where("id", "=", id)
    .executeTakeFirst();
  return row ?? null;
}

export async function listAll(): Promise<MenuItem[]> {
  const shopId = currentShopId();
  return memoize(`menu:shop:${shopId}:listAll`, 30_000, async () => {
    return await getDb()
      .selectFrom("menu_items")
      .selectAll()
      .where("shop_id", "=", shopId)
      .orderBy("name")
      .execute();
  });
}

export async function listActive(): Promise<MenuItem[]> {
  const shopId = currentShopId();
  return memoize(`menu:shop:${shopId}:listActive`, 30_000, async () => {
    return await getDb()
      .selectFrom("menu_items")
      .selectAll()
      .where("shop_id", "=", shopId)
      .where("is_active", "=", 1)
      .orderBy("name")
      .execute();
  });
}

// Active menu items ordered by lifetime qty sold (descending). The join
// to sale_line_items doesn't need its own shop filter because line items
// always live in the same shop as their menu_item (FK).
export async function listActiveByPopularity(): Promise<MenuItem[]> {
  const rows = await getDb()
    .selectFrom("menu_items as m")
    .leftJoin("sale_line_items as l", "l.menu_item_id", "m.id")
    .selectAll("m")
    .select(({ fn }) => fn.coalesce(fn.sum<number>("l.qty"), sql<number>`0`).as("sold_qty"))
    .where("m.shop_id", "=", currentShopId())
    .where("m.is_active", "=", 1)
    .groupBy("m.id")
    .orderBy("sold_qty", "desc")
    .orderBy("m.name", "asc")
    .execute();
  return rows.map(({ sold_qty: _omit, ...rest }) => rest as MenuItem);
}

export async function update(id: number, input: UpdateInput): Promise<void> {
  await getDb()
    .updateTable("menu_items")
    .set({
      name: input.name,
      price: input.price,
      sort_order: input.sort_order ?? 0,
      token_color: input.token_color ?? null,
      updated_at: nowIso(),
    })
    .where("shop_id", "=", currentShopId())
    .where("id", "=", id)
    .execute();
  bustMenuCaches();
}

export async function setActive(id: number, active: boolean): Promise<void> {
  await getDb()
    .updateTable("menu_items")
    .set({ is_active: active ? 1 : 0, updated_at: nowIso() })
    .where("shop_id", "=", currentShopId())
    .where("id", "=", id)
    .execute();
  bustMenuCaches();
}

export async function remove(id: number): Promise<void> {
  await setActive(id, false);
}
