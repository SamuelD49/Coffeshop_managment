import { getDb, nowIso } from "../lib/kysely";
import type { MenuItemsTable } from "../lib/db-types";
import type { Selectable } from "kysely";
import { sql } from "kysely";

export type MenuItem = Selectable<MenuItemsTable>;

export type CreateInput = { name: string; price: number; sort_order?: number; token_color?: string | null };
export type UpdateInput = { name: string; price: number; sort_order?: number; token_color?: string | null };

export async function create(input: CreateInput): Promise<MenuItem> {
  const now = nowIso();
  const r = await getDb()
    .insertInto("menu_items")
    .values({
      name: input.name,
      price: input.price,
      sort_order: input.sort_order ?? 0,
      token_color: input.token_color ?? null,
      created_at: now,
      updated_at: now,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return (await findById(Number(r.id)))!;
}

export async function findById(id: number): Promise<MenuItem | null> {
  const row = await getDb()
    .selectFrom("menu_items")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
  return row ?? null;
}

export async function listAll(): Promise<MenuItem[]> {
  return await getDb()
    .selectFrom("menu_items")
    .selectAll()
    .orderBy("name")
    .execute();
}

export async function listActive(): Promise<MenuItem[]> {
  return await getDb()
    .selectFrom("menu_items")
    .selectAll()
    .where("is_active", "=", 1)
    .orderBy("name")
    .execute();
}

// Active menu items ordered by lifetime qty sold (descending), then by name.
// Items never sold appear after sold items, alphabetically. Used by the sales
// entry page so the cashier finds the common items near the top.
export async function listActiveByPopularity(): Promise<MenuItem[]> {
  const rows = await getDb()
    .selectFrom("menu_items as m")
    .leftJoin("sale_line_items as l", "l.menu_item_id", "m.id")
    .selectAll("m")
    .select(({ fn }) => fn.coalesce(fn.sum<number>("l.qty"), sql<number>`0`).as("sold_qty"))
    .where("m.is_active", "=", 1)
    .groupBy("m.id")
    .orderBy("sold_qty", "desc")
    .orderBy("m.name", "asc")
    .execute();
  // Strip the synthetic sold_qty before returning so callers get a clean MenuItem.
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
    .where("id", "=", id)
    .execute();
}

export async function setActive(id: number, active: boolean): Promise<void> {
  await getDb()
    .updateTable("menu_items")
    .set({ is_active: active ? 1 : 0, updated_at: nowIso() })
    .where("id", "=", id)
    .execute();
}

export async function remove(id: number): Promise<void> {
  // Soft delete: just deactivate. Hard delete would break historical sale_line_items FK.
  await setActive(id, false);
}
