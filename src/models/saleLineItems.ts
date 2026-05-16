import { _legacySqliteDb } from "../lib/db";

export type SaleLineItem = {
  id: number;
  sales_session_id: number;
  menu_item_id: number;
  qty: number;
  unit_price_snapshot: number;
  total: number;
  remark: string | null;
  created_at: string;
  updated_at: string;
};

export function listForSession(sessionId: number): SaleLineItem[] {
  return _legacySqliteDb().prepare("SELECT * FROM sale_line_items WHERE sales_session_id = ? ORDER BY id").all(sessionId) as SaleLineItem[];
}

export function findForMenuItem(sessionId: number, menuItemId: number): SaleLineItem | null {
  const r = _legacySqliteDb().prepare("SELECT * FROM sale_line_items WHERE sales_session_id = ? AND menu_item_id = ?").get(sessionId, menuItemId) as SaleLineItem | undefined;
  return r ?? null;
}

// Insert or update the line for a given menu item. If qty is 0, delete.
export function upsert(sessionId: number, menuItemId: number, qty: number): SaleLineItem | null {
  const existing = findForMenuItem(sessionId, menuItemId);
  if (qty <= 0) {
    if (existing) {
      _legacySqliteDb().prepare("DELETE FROM sale_line_items WHERE id = ?").run(existing.id);
    }
    return null;
  }
  const menu = _legacySqliteDb().prepare("SELECT price FROM menu_items WHERE id = ?").get(menuItemId) as { price: number } | undefined;
  if (!menu) throw new Error("Menu item not found");
  const total = menu.price * qty;

  if (existing) {
    _legacySqliteDb().prepare("UPDATE sale_line_items SET qty = ?, total = ?, updated_at = datetime('now') WHERE id = ?").run(qty, total, existing.id);
    return findForMenuItem(sessionId, menuItemId)!;
  } else {
    const r = _legacySqliteDb().prepare(`
      INSERT INTO sale_line_items (sales_session_id, menu_item_id, qty, unit_price_snapshot, total)
      VALUES (?, ?, ?, ?, ?)
    `).run(sessionId, menuItemId, qty, menu.price, total);
    return _legacySqliteDb().prepare("SELECT * FROM sale_line_items WHERE id = ?").get(Number(r.lastInsertRowid)) as SaleLineItem;
  }
}

export function updateRemark(id: number, remark: string | null): void {
  _legacySqliteDb().prepare("UPDATE sale_line_items SET remark = ?, updated_at = datetime('now') WHERE id = ?").run(remark, id);
}

export function removeForSession(sessionId: number): void {
  _legacySqliteDb().prepare("DELETE FROM sale_line_items WHERE sales_session_id = ?").run(sessionId);
}
