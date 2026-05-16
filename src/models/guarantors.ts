import { getDb, nowIso } from "../lib/kysely";
import type { GuarantorsTable } from "../lib/db-types";
import type { Selectable } from "kysely";

export type Guarantor = Selectable<GuarantorsTable>;

export type GuarantorInput = Omit<Guarantor, "id" | "created_at" | "updated_at">;

export async function create(input: GuarantorInput): Promise<Guarantor> {
  const now = nowIso();
  const result = await getDb()
    .insertInto("guarantors")
    .values({
      employee_id: input.employee_id,
      full_name: input.full_name,
      phone: input.phone,
      address: input.address,
      relation_to_employee: input.relation_to_employee,
      national_id_number: input.national_id_number,
      national_id_type: input.national_id_type,
      occupation: input.occupation,
      workplace: input.workplace,
      notes: input.notes,
      created_at: now,
      updated_at: now,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return (await findById(result.id))!;
}

export async function listForEmployee(employeeId: number): Promise<Guarantor[]> {
  return await getDb()
    .selectFrom("guarantors")
    .selectAll()
    .where("employee_id", "=", employeeId)
    .orderBy("created_at")
    .orderBy("id")
    .execute();
}

export async function findById(id: number): Promise<Guarantor | null> {
  const row = await getDb()
    .selectFrom("guarantors")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
  return row ?? null;
}

export async function update(id: number, input: Omit<GuarantorInput, "employee_id">): Promise<void> {
  await getDb()
    .updateTable("guarantors")
    .set({
      full_name: input.full_name,
      phone: input.phone,
      address: input.address,
      relation_to_employee: input.relation_to_employee,
      national_id_number: input.national_id_number,
      national_id_type: input.national_id_type,
      occupation: input.occupation,
      workplace: input.workplace,
      notes: input.notes,
      updated_at: nowIso(),
    })
    .where("id", "=", id)
    .execute();
}

export async function remove(id: number): Promise<void> {
  await getDb()
    .deleteFrom("guarantors")
    .where("id", "=", id)
    .execute();
}
