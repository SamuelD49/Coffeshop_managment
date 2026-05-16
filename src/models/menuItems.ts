import { _legacySqliteDb } from "../lib/db";

export type MenuItem = {
  id: number;
  name: string;
  price: number;
  sort_order: number;
  is_active: number;
  token_color: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateInput = { name: string; price: number; sort_order?: number; token_color?: string | null };
export type UpdateInput = { name: string; price: number; sort_order?: number; token_color?: string | null };

export function create(input: CreateInput): MenuItem {
  const r = _legacySqliteDb().prepare(`
    INSERT INTO menu_items (name, price, sort_order, token_color)
    VALUES (@name, @price, @sort_order, @token_color)
  `).run({
    ...input,
    sort_order: input.sort_order ?? 0,
    token_color: input.token_color ?? null,
  });
  return findById(Number(r.lastInsertRowid))!;
}

export function findById(id: number): MenuItem | null {
  const r = _legacySqliteDb().prepare("SELECT * FROM menu_items WHERE id = ?").get(id) as MenuItem | undefined;
  return r ?? null;
}

export function listAll(): MenuItem[] {
  return _legacySqliteDb().prepare("SELECT * FROM menu_items ORDER BY name").all() as MenuItem[];
}

export function listActive(): MenuItem[] {
  return _legacySqliteDb().prepare("SELECT * FROM menu_items WHERE is_active = 1 ORDER BY name").all() as MenuItem[];
}

// Active menu items ordered by lifetime qty sold (descending), then by name.
// Items never sold appear after sold items, alphabetically. Used by the sales
// entry page so the cashier finds the common items near the top.
export function listActiveByPopularity(): MenuItem[] {
  return _legacySqliteDb().prepare(`
    SELECT m.*, COALESCE(SUM(l.qty), 0) AS sold_qty
    FROM menu_items m
    LEFT JOIN sale_line_items l ON l.menu_item_id = m.id
    WHERE m.is_active = 1
    GROUP BY m.id
    ORDER BY sold_qty DESC, m.name ASC
  `).all() as MenuItem[];
}

export function update(id: number, input: UpdateInput): void {
  _legacySqliteDb().prepare(`
    UPDATE menu_items
    SET name = @name, price = @price, sort_order = @sort_order, token_color = @token_color, updated_at = datetime('now')
    WHERE id = @id
  `).run({
    ...input,
    sort_order: input.sort_order ?? 0,
    token_color: input.token_color ?? null,
    id,
  });
}

export function setActive(id: number, active: boolean): void {
  _legacySqliteDb().prepare("UPDATE menu_items SET is_active = ?, updated_at = datetime('now') WHERE id = ?").run(active ? 1 : 0, id);
}

export function remove(id: number): void {
  // Soft delete: just deactivate. Hard delete would break historical sale_line_items FK.
  setActive(id, false);
}
