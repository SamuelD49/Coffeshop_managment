import { getDb, nowIso } from "../lib/kysely";
import { currentShopId } from "../lib/shopContext";
import { invalidate } from "../lib/cache";

// Per-shop cache: each shop's settings are loaded on first access and held
// for CACHE_TTL_MS. A Settings.set() invalidates only its own shop's cache.
// closeDb() (in tests) wipes everything via _invalidateCache().
const _caches = new Map<number, { map: Map<string, string>; loadedAt: number }>();
const CACHE_TTL_MS = 30_000;

async function cache(): Promise<Map<string, string>> {
  const shopId = currentShopId();
  const hit = _caches.get(shopId);
  if (hit && Date.now() - hit.loadedAt < CACHE_TTL_MS) return hit.map;
  const rows = await getDb()
    .selectFrom("settings")
    .select(["key", "value"])
    .where("shop_id", "=", shopId)
    .execute();
  const m = new Map<string, string>();
  for (const r of rows) m.set(r.key, r.value);
  _caches.set(shopId, { map: m, loadedAt: Date.now() });
  return m;
}

function invalidateShop(shopId: number): void {
  _caches.delete(shopId);
}

export async function get(key: string): Promise<string | null> {
  const m = await cache();
  return m.has(key) ? m.get(key)! : null;
}

export async function set(key: string, value: string): Promise<void> {
  const shopId = currentShopId();
  const now = nowIso();
  await getDb()
    .insertInto("settings")
    .values({ shop_id: shopId, key, value, updated_at: now })
    .onConflict((oc) => oc.columns(["shop_id", "key"]).doUpdateSet({ value, updated_at: now }))
    .execute();
  invalidateShop(shopId);
  // Two settings drive the onboarding checklist — shop_name (off the
  // default placeholder) and shop_signature. Bust setup cache on either.
  if (key === "shop_name" || key === "shop_signature") {
    invalidate(`setupStatus:shop:${shopId}`);
  }
}

export async function getAll(): Promise<Record<string, string>> {
  const m = await cache();
  return Object.fromEntries(m);
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

// Test hook — wipes all shops' caches. Called by closeDb.
export function _invalidateCache(): void {
  _caches.clear();
}
