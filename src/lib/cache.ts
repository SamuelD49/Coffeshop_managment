// Tiny in-process key/value cache for short-lived memoization of expensive
// query results. Targets the dashboard/reports fan-out where the same
// aggregate query is recomputed on every page load.
//
// Usage:
//   import { memoize, invalidate } from "../lib/cache";
//
//   const total = await memoize(`sales:byDay:${from}:${to}`, 10_000,
//     () => Reports.salesByDay({ from, to })
//   );
//
//   // After a write that affects sales, call:
//   invalidate("sales:");      // wipes everything under that prefix
//
// Notes:
// - All entries are local to the Node process. With a single-instance
//   deploy (your shop PC + Tailscale, or one Hetzner box) that's fine.
//   If you ever go multi-instance, swap for Redis.
// - Default TTL: 10 seconds. Long enough to absorb a page-load burst,
//   short enough that stale data isn't user-visible if invalidation misses.
// - We never cache user-specific data here. Reports are global aggregates.

type Entry = { value: unknown; expiresAt: number };

const _store = new Map<string, Entry>();

export async function memoize<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const hit = _store.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as T;
  const value = await loader();
  _store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

// Drop every entry whose key starts with the given prefix. Cheap because
// the cache is small (dozens of keys, not thousands).
export function invalidate(prefix: string): void {
  if (prefix === "") {
    _store.clear();
    return;
  }
  for (const k of _store.keys()) {
    if (k.startsWith(prefix)) _store.delete(k);
  }
}

export function _cacheSize(): number {
  return _store.size;
}
