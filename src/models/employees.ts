import { getDb } from "../lib/db";

export type Employee = {
  id: number;
  full_name: string;
  phone: string | null;
  username: string | null;
  password_hash: string | null;
  role: "owner" | "employee";
  is_active: number;
  onboarding_status: "incomplete" | "complete";
  basic_salary: number;
  created_at: string;
  updated_at: string;
  // remaining HR columns left as `any` until Plan 2 surfaces them
};

export type CreateInput = {
  full_name: string;
  username?: string | null;
  password_hash?: string | null;
  role: "owner" | "employee";
  phone?: string | null;
};

export function count(): number {
  const row = getDb().prepare("SELECT COUNT(*) AS c FROM employees").get() as { c: number };
  return row.c;
}

export function create(input: CreateInput): Employee {
  const result = getDb()
    .prepare(`
      INSERT INTO employees (full_name, phone, username, password_hash, role)
      VALUES (@full_name, @phone, @username, @password_hash, @role)
    `)
    .run({
      full_name: input.full_name,
      phone: input.phone ?? null,
      username: input.username ?? null,
      password_hash: input.password_hash ?? null,
      role: input.role,
    });
  return findById(Number(result.lastInsertRowid))!;
}

export function findByUsername(username: string): Employee | null {
  const row = getDb()
    .prepare("SELECT * FROM employees WHERE username = ? AND is_active = 1")
    .get(username) as Employee | undefined;
  return row ?? null;
}

export function findById(id: number): Employee | null {
  const row = getDb().prepare("SELECT * FROM employees WHERE id = ?").get(id) as Employee | undefined;
  return row ?? null;
}

export function updatePassword(id: number, password_hash: string): void {
  getDb()
    .prepare("UPDATE employees SET password_hash = ?, updated_at = datetime('now') WHERE id = ?")
    .run(password_hash, id);
}

export function setActive(id: number, active: boolean): void {
  getDb()
    .prepare("UPDATE employees SET is_active = ?, updated_at = datetime('now') WHERE id = ?")
    .run(active ? 1 : 0, id);
}
