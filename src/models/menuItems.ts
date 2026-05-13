import { getDb } from "../lib/db";

export type MenuItem = {
  id: number;
  name: string;
  price: number;
  sort_order: number;
  is_active: number;
  created_at: string;
  updated_at: string;
};

export type CreateInput = { name: string; price: number; sort_order: number };
export type UpdateInput = { name: string; price: number; sort_order: number };

export function create(input: CreateInput): MenuItem {
  const r = getDb().prepare(`
    INSERT INTO menu_items (name, price, sort_order)
    VALUES (@name, @price, @sort_order)
  `).run(input);
  return findById(Number(r.lastInsertRowid))!;
}

export function findById(id: number): MenuItem | null {
  const r = getDb().prepare("SELECT * FROM menu_items WHERE id = ?").get(id) as MenuItem | undefined;
  return r ?? null;
}

export function listAll(): MenuItem[] {
  return getDb().prepare("SELECT * FROM menu_items ORDER BY sort_order, name").all() as MenuItem[];
}

export function listActive(): MenuItem[] {
  return getDb().prepare("SELECT * FROM menu_items WHERE is_active = 1 ORDER BY sort_order, name").all() as MenuItem[];
}

export function update(id: number, input: UpdateInput): void {
  getDb().prepare(`
    UPDATE menu_items
    SET name = @name, price = @price, sort_order = @sort_order, updated_at = datetime('now')
    WHERE id = @id
  `).run({ ...input, id });
}

export function setActive(id: number, active: boolean): void {
  getDb().prepare("UPDATE menu_items SET is_active = ?, updated_at = datetime('now') WHERE id = ?").run(active ? 1 : 0, id);
}

export function remove(id: number): void {
  // Soft delete: just deactivate. Hard delete would break historical sale_line_items FK.
  setActive(id, false);
}
