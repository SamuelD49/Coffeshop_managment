import { getDb } from "../../src/lib/db";
import { runWithShop } from "../../src/lib/shopContext";
import { nowIso } from "../../src/lib/kysely";

let _counter = 0;

// Mirrors the migration-002 defaults that ship in Sample Shop (id=1).
// Each test seed-shop needs its own copy because settings are per-shop.
const DEFAULT_SETTINGS: Array<[string, string]> = [
  ["shop_name", "My Coffee Shop"],
  ["shop_address", ""],
  ["shop_phone", ""],
  ["logo_path", ""],
  ["currency_code", "ETB"],
  ["currency_symbol", "Br"],
  ["decimal_places", "2"],
  ["thousand_separator", ","],
  ["decimal_separator", "."],
  ["pension_employer_default_pct", "11"],
  ["pension_employee_default_pct", "7"],
  ["standard_days_in_month", "30"],
  ["require_complete_hr_before_payroll", "false"],
  ["business_day_cutoff", "00:00"],
  ["timezone", "Africa/Addis_Ababa"],
  ["backup_path", "./data/backups/"],
];

// Creates a fresh shop in the current DB and returns its id. Tests call
// this in beforeEach, then wrap their assertions in runInShop.
export async function seedTestShop(name?: string): Promise<number> {
  _counter += 1;
  const shopName = name ?? `Test Shop ${_counter}-${Date.now()}`;
  const now = nowIso();
  const r = await getDb()
    .insertInto("shops")
    .values({ name: shopName, created_at: now })
    .returning("id")
    .executeTakeFirstOrThrow();
  const shopId = r.id;
  // Seed the per-shop default settings so tests behave the same as a
  // signed-up shop.
  await getDb()
    .insertInto("settings")
    .values(DEFAULT_SETTINGS.map(([k, v]) => ({ shop_id: shopId, key: k, value: v, updated_at: now })))
    .execute();
  return shopId;
}

// Wrap a test body in the given shop's context. Use this so the model
// layer's currentShopId() finds the right value.
export function runInShop<T>(shopId: number, fn: () => Promise<T>): Promise<T> {
  return runWithShop(shopId, fn) as Promise<T>;
}
