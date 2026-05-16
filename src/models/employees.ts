import { _legacySqliteDb } from "../lib/db";

export type Employee = {
  id: number;
  full_name: string;
  phone: string | null;
  national_id_number: string | null;
  national_id_type: string | null;
  date_of_birth: string | null;
  gender: string | null;
  marital_status: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relation: string | null;
  position: string | null;
  hire_date: string | null;
  termination_date: string | null;
  basic_salary: number;
  username: string | null;
  password_hash: string | null;
  role: "owner" | "employee";
  is_active: number;
  onboarding_status: "incomplete" | "complete";
  created_at: string;
  updated_at: string;
};

export type CreateInput = {
  full_name: string;
  username?: string | null;
  password_hash?: string | null;
  role: "owner" | "employee";
  phone?: string | null;
};

export function count(): number {
  const row = _legacySqliteDb().prepare("SELECT COUNT(*) AS c FROM employees").get() as { c: number };
  return row.c;
}

// True when at least one active employee has role='employee'. Drives the sales
// UI: when false (solo-owner shop), the Close-entry button and the per-employee
// filter are hidden. When the owner hires a cashier, both reappear.
export function hasActiveCashiers(): boolean {
  const row = _legacySqliteDb().prepare("SELECT COUNT(*) AS c FROM employees WHERE role = 'employee' AND is_active = 1").get() as { c: number };
  return row.c > 0;
}

export function create(input: CreateInput): Employee {
  const result = _legacySqliteDb()
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
  const row = _legacySqliteDb()
    .prepare("SELECT * FROM employees WHERE username = ? AND is_active = 1")
    .get(username) as Employee | undefined;
  return row ?? null;
}

export function findById(id: number): Employee | null {
  const row = _legacySqliteDb().prepare("SELECT * FROM employees WHERE id = ?").get(id) as Employee | undefined;
  return row ?? null;
}

export function updatePassword(id: number, password_hash: string): void {
  _legacySqliteDb()
    .prepare("UPDATE employees SET password_hash = ?, updated_at = datetime('now') WHERE id = ?")
    .run(password_hash, id);
}

export function setActive(id: number, active: boolean): void {
  _legacySqliteDb()
    .prepare("UPDATE employees SET is_active = ?, updated_at = datetime('now') WHERE id = ?")
    .run(active ? 1 : 0, id);
}

export type PersonalInput = {
  full_name: string;
  phone: string | null;
  national_id_number: string | null;
  national_id_type: string | null;
  date_of_birth: string | null;
  gender: string | null;
  marital_status: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relation: string | null;
};

export type EmploymentInput = {
  position: string | null;
  hire_date: string | null;
  termination_date?: string | null;
  basic_salary: number;
  role: "owner" | "employee";
  is_active: boolean;
  username?: string | null;
};

export function listAll(opts: { activeOnly?: boolean } = {}): Employee[] {
  const where = opts.activeOnly ? "WHERE is_active = 1" : "";
  return _legacySqliteDb().prepare(`SELECT * FROM employees ${where} ORDER BY full_name`).all() as Employee[];
}

export function findFull(id: number): Employee | null {
  const row = _legacySqliteDb().prepare("SELECT * FROM employees WHERE id = ?").get(id) as Employee | undefined;
  return row ?? null;
}

export function updatePersonal(id: number, input: PersonalInput): void {
  _legacySqliteDb().prepare(`
    UPDATE employees SET
      full_name = @full_name,
      phone = @phone,
      national_id_number = @national_id_number,
      national_id_type = @national_id_type,
      date_of_birth = @date_of_birth,
      gender = @gender,
      marital_status = @marital_status,
      address = @address,
      emergency_contact_name = @emergency_contact_name,
      emergency_contact_phone = @emergency_contact_phone,
      emergency_contact_relation = @emergency_contact_relation,
      updated_at = datetime('now')
    WHERE id = @id
  `).run({ ...input, id });
}

export function updateEmployment(id: number, input: EmploymentInput): void {
  _legacySqliteDb().prepare(`
    UPDATE employees SET
      position = @position,
      hire_date = @hire_date,
      termination_date = @termination_date,
      basic_salary = @basic_salary,
      role = @role,
      is_active = @is_active,
      username = @username,
      updated_at = datetime('now')
    WHERE id = @id
  `).run({
    position: input.position,
    hire_date: input.hire_date,
    termination_date: input.termination_date ?? null,
    basic_salary: input.basic_salary,
    role: input.role,
    is_active: input.is_active ? 1 : 0,
    username: input.username ?? null,
    id,
  });
}

export function setOnboardingStatus(id: number, status: "incomplete" | "complete"): void {
  _legacySqliteDb().prepare("UPDATE employees SET onboarding_status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
}
