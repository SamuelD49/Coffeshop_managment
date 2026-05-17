import { getDb, nowIso } from "../lib/kysely";
import type { PayrollRunsTable } from "../lib/db-types";
import type { Selectable } from "kysely";

export type PayrollRun = Selectable<PayrollRunsTable>;

export type CreateInput = { year: number; month: number; prepared_by: number | null };

export async function create(input: CreateInput): Promise<PayrollRun> {
  const now = nowIso();
  const r = await getDb()
    .insertInto("payroll_runs")
    .values({ ...input, created_at: now, updated_at: now })
    .returning("id")
    .executeTakeFirstOrThrow();
  return (await findById(r.id))!;
}

export async function findById(id: number): Promise<PayrollRun | null> {
  const r = await getDb().selectFrom("payroll_runs").selectAll().where("id", "=", id).executeTakeFirst();
  return r ?? null;
}

export async function findByYearMonth(year: number, month: number): Promise<PayrollRun | null> {
  const r = await getDb()
    .selectFrom("payroll_runs")
    .selectAll()
    .where("year", "=", year)
    .where("month", "=", month)
    .executeTakeFirst();
  return r ?? null;
}

export async function listAll(): Promise<PayrollRun[]> {
  return await getDb()
    .selectFrom("payroll_runs")
    .selectAll()
    .orderBy("year", "desc")
    .orderBy("month", "desc")
    .execute();
}

export async function approve(id: number, approverId: number): Promise<void> {
  await getDb()
    .updateTable("payroll_runs")
    .set({ status: "approved", approved_by: approverId, updated_at: nowIso() })
    .where("id", "=", id)
    .execute();
}

export async function revert(id: number): Promise<void> {
  await getDb()
    .updateTable("payroll_runs")
    .set({ status: "draft", approved_by: null, updated_at: nowIso() })
    .where("id", "=", id)
    .execute();
}

// Deletes a run and (via ON DELETE CASCADE in the schema) all its entries.
export async function remove(id: number): Promise<void> {
  await getDb().deleteFrom("payroll_runs").where("id", "=", id).execute();
}
