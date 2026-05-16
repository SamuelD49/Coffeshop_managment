import { _legacySqliteDb } from "../lib/db";

export function get(key: string): string | null {
  const row = _legacySqliteDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function set(key: string, value: string): void {
  _legacySqliteDb()
    .prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `)
    .run(key, value);
}

export function getAll(): Record<string, string> {
  const rows = _legacySqliteDb().prepare("SELECT key, value FROM settings").all() as Array<{ key: string; value: string }>;
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function getNumber(key: string): number {
  const v = get(key);
  if (v === null) throw new Error(`settings.getNumber: missing key "${key}"`);
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`settings.getNumber: "${key}" not numeric ("${v}")`);
  return n;
}

export function getBool(key: string): boolean {
  return get(key) === "true";
}
