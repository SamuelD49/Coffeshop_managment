import { getDb, nowIso } from "../lib/kysely";
import { invalidate } from "../lib/cache";
import { currentShopId } from "../lib/shopContext";
import type { SaleLineItemsTable } from "../lib/db-types";
import type { Selectable } from "kysely";

export type SaleLineItem = Selectable<SaleLineItemsTable>;

function bustReportsCache(): void {
  invalidate(`reports:shop:${currentShopId()}:`);
}

export async function listForSession(sessionId: number): Promise<SaleLineItem[]> {
  return await getDb()
    .selectFrom("sale_line_items")
    .selectAll()
    .where("shop_id", "=", currentShopId())
    .where("sales_session_id", "=", sessionId)
    .orderBy("id")
    .execute();
}

export async function findForMenuItem(sessionId: number, menuItemId: number): Promise<SaleLineItem | null> {
  const r = await getDb()
    .selectFrom("sale_line_items")
    .selectAll()
    .where("shop_id", "=", currentShopId())
    .where("sales_session_id", "=", sessionId)
    .where("menu_item_id", "=", menuItemId)
    .executeTakeFirst();
  return r ?? null;
}

// Insert or update the line for a given menu item. If qty is 0, delete.
export async function upsert(sessionId: number, menuItemId: number, qty: number): Promise<SaleLineItem | null> {
  const db = getDb();
  const shopId = currentShopId();
  const existing = await findForMenuItem(sessionId, menuItemId);
  if (qty <= 0) {
    if (existing) {
      await db.deleteFrom("sale_line_items")
        .where("shop_id", "=", shopId)
        .where("id", "=", existing.id)
        .execute();
      bustReportsCache();
    }
    return null;
  }
  // Direct menu_items read: still filter by shop_id even though we're not
  // going through the model, so a forged menu_item_id from another shop
  // can't be priced and sold here.
  const menu = await db
    .selectFrom("menu_items")
    .select("price")
    .where("shop_id", "=", shopId)
    .where("id", "=", menuItemId)
    .executeTakeFirst();
  if (!menu) throw new Error("Menu item not found");
  const total = menu.price * qty;
  const now = nowIso();

  if (existing) {
    await db
      .updateTable("sale_line_items")
      .set({ qty, total, updated_at: now })
      .where("shop_id", "=", shopId)
      .where("id", "=", existing.id)
      .execute();
    bustReportsCache();
    return (await findForMenuItem(sessionId, menuItemId))!;
  } else {
    const r = await db
      .insertInto("sale_line_items")
      .values({
        shop_id: shopId,
        sales_session_id: sessionId,
        menu_item_id: menuItemId,
        qty,
        unit_price_snapshot: menu.price,
        total,
        created_at: now,
        updated_at: now,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    bustReportsCache();
    return await db
      .selectFrom("sale_line_items")
      .selectAll()
      .where("shop_id", "=", shopId)
      .where("id", "=", r.id)
      .executeTakeFirstOrThrow();
  }
}

export async function updateRemark(id: number, remark: string | null): Promise<void> {
  await getDb()
    .updateTable("sale_line_items")
    .set({ remark, updated_at: nowIso() })
    .where("shop_id", "=", currentShopId())
    .where("id", "=", id)
    .execute();
}

export async function removeForSession(sessionId: number): Promise<void> {
  await getDb()
    .deleteFrom("sale_line_items")
    .where("shop_id", "=", currentShopId())
    .where("sales_session_id", "=", sessionId)
    .execute();
  bustReportsCache();
}
