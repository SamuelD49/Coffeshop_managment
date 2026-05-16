import { getDb, nowIso } from "../lib/kysely";

export async function get(key: string): Promise<string | null> {
  const row = await getDb()
    .selectFrom("settings")
    .select("value")
    .where("key", "=", key)
    .executeTakeFirst();
  return row?.value ?? null;
}

export async function set(key: string, value: string): Promise<void> {
  const now = nowIso();
  await getDb()
    .insertInto("settings")
    .values({ key, value, updated_at: now })
    .onConflict((oc) => oc.column("key").doUpdateSet({ value, updated_at: now }))
    .execute();
}

export async function getAll(): Promise<Record<string, string>> {
  const rows = await getDb().selectFrom("settings").select(["key", "value"]).execute();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function getNumber(key: string): Promise<number> {
  const v = await get(key);
  if (v === null) throw new Error(`settings.getNumber: missing key "${key}"`);
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`settings.getNumber: "${key}" not numeric ("${v}")`);
  return n;
}

export async function getBool(key: string): Promise<boolean> {
  return (await get(key)) === "true";
}
