import { getDb, nowIso } from "../lib/kysely";

// In-memory cache of the entire settings table. Settings are read on almost
// every request (timezone, business-day cutoff, currency formatting, etc.)
// but written rarely (only through the /settings page). One round trip to
// Supabase costs ~100ms from Africa; without this cache, a single dashboard
// render fires 4-6 settings lookups serially. With it, the first request
// fills the cache and every subsequent settings read is in-process.
//
// Invalidation: any successful Settings.set() clears the cache.
let _cache: Map<string, string> | null = null;
let _cacheLoadedAt = 0;
const CACHE_TTL_MS = 30_000;

async function loadCache(): Promise<Map<string, string>> {
  const rows = await getDb().selectFrom("settings").select(["key", "value"]).execute();
  const m = new Map<string, string>();
  for (const r of rows) m.set(r.key, r.value);
  _cache = m;
  _cacheLoadedAt = Date.now();
  return m;
}

function invalidate(): void {
  _cache = null;
  _cacheLoadedAt = 0;
}

async function cache(): Promise<Map<string, string>> {
  if (_cache && Date.now() - _cacheLoadedAt < CACHE_TTL_MS) return _cache;
  return await loadCache();
}

export async function get(key: string): Promise<string | null> {
  const m = await cache();
  return m.has(key) ? m.get(key)! : null;
}

export async function set(key: string, value: string): Promise<void> {
  const now = nowIso();
  await getDb()
    .insertInto("settings")
    .values({ key, value, updated_at: now })
    .onConflict((oc) => oc.columns(["shop_id", "key"]).doUpdateSet({ value, updated_at: now }))
    .execute();
  invalidate();
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

// Test hook: lets the model tests wipe the cache between tests without
// having to know about its existence.
export function _invalidateCache(): void {
  invalidate();
}
