import { getDb, nowIso } from "../lib/kysely";
import { currentShopId } from "../lib/shopContext";
import type { EmployeesTable } from "../lib/db-types";
import type { Selectable } from "kysely";

export type Employee = Selectable<EmployeesTable>;

export type CreateInput = {
  full_name: string;
  username?: string | null;
  password_hash?: string | null;
  role: "owner" | "employee";
  phone?: string | null;
};

export async function count(): Promise<number> {
  const row = await getDb()
    .selectFrom("employees")
    .select((eb) => eb.fn.countAll<number>().as("c"))
    .where("shop_id", "=", currentShopId())
    .executeTakeFirstOrThrow();
  return Number(row.c);
}

export async function hasActiveCashiers(): Promise<boolean> {
  const row = await getDb()
    .selectFrom("employees")
    .select((eb) => eb.fn.countAll<number>().as("c"))
    .where("shop_id", "=", currentShopId())
    .where("role", "=", "employee")
    .where("is_active", "=", 1)
    .executeTakeFirstOrThrow();
  return Number(row.c) > 0;
}

export async function create(input: CreateInput): Promise<Employee> {
  const now = nowIso();
  const result = await getDb()
    .insertInto("employees")
    .values({
      shop_id: currentShopId(),
      full_name: input.full_name,
      phone: input.phone ?? null,
      username: input.username ?? null,
      password_hash: input.password_hash ?? null,
      role: input.role,
      created_at: now,
      updated_at: now,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return (await findById(result.id))!;
}

// SPECIAL: at LOGIN time we don't yet know which shop the user belongs to.
// We look the employee up globally by username and resolve their shop_id
// from the matched row. Login is the ONE place we read without a shop
// filter; everywhere else uses currentShopId().
// Note: username uniqueness is per-shop, so multiple shops may have an
// employee named "owner". Login takes the first match — document this
// as a known SaaS V1 limitation.
export async function findByUsername(username: string): Promise<Employee | null> {
  const row = await getDb()
    .selectFrom("employees")
    .selectAll()
    .where("username", "=", username)
    .where("is_active", "=", 1)
    .executeTakeFirst();
  return row ?? null;
}

export async function findById(id: number): Promise<Employee | null> {
  const row = await getDb()
    .selectFrom("employees")
    .selectAll()
    .where("shop_id", "=", currentShopId())
    .where("id", "=", id)
    .executeTakeFirst();
  return row ?? null;
}

export async function updatePassword(id: number, password_hash: string): Promise<void> {
  await getDb()
    .updateTable("employees")
    .set({ password_hash, updated_at: nowIso() })
    .where("shop_id", "=", currentShopId())
    .where("id", "=", id)
    .execute();
}

export async function setActive(id: number, active: boolean): Promise<void> {
  await getDb()
    .updateTable("employees")
    .set({ is_active: active ? 1 : 0, updated_at: nowIso() })
    .where("shop_id", "=", currentShopId())
    .where("id", "=", id)
    .execute();
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

export async function listAll(opts: { activeOnly?: boolean } = {}): Promise<Employee[]> {
  let q = getDb().selectFrom("employees").selectAll().where("shop_id", "=", currentShopId());
  if (opts.activeOnly) q = q.where("is_active", "=", 1);
  return await q.orderBy("full_name").execute();
}

export async function findFull(id: number): Promise<Employee | null> {
  return findById(id);
}

export async function updatePersonal(id: number, input: PersonalInput): Promise<void> {
  await getDb()
    .updateTable("employees")
    .set({ ...input, updated_at: nowIso() })
    .where("shop_id", "=", currentShopId())
    .where("id", "=", id)
    .execute();
}

export async function updateEmployment(id: number, input: EmploymentInput): Promise<void> {
  await getDb()
    .updateTable("employees")
    .set({
      position: input.position,
      hire_date: input.hire_date,
      termination_date: input.termination_date ?? null,
      basic_salary: input.basic_salary,
      role: input.role,
      is_active: input.is_active ? 1 : 0,
      username: input.username ?? null,
      updated_at: nowIso(),
    })
    .where("shop_id", "=", currentShopId())
    .where("id", "=", id)
    .execute();
}

export async function setOnboardingStatus(id: number, status: "incomplete" | "complete"): Promise<void> {
  await getDb()
    .updateTable("employees")
    .set({ onboarding_status: status, updated_at: nowIso() })
    .where("shop_id", "=", currentShopId())
    .where("id", "=", id)
    .execute();
}
