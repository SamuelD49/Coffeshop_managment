import { AsyncLocalStorage } from "async_hooks";

// Per-request scope holding the active shop's id. Middleware sets it
// after the session is loaded; every model uses currentShopId() to filter
// queries. This avoids threading shopId through every function signature.
//
// IMPORTANT: code that runs OUTSIDE a request (the seed script, the boot
// migration runner, ad-hoc tsx scripts) must wrap its work in
// `runWithShop(id, fn)` so model calls work. The migration runner itself
// is exempt because it issues raw SQL, not Kysely model calls.

const storage = new AsyncLocalStorage<{ shopId: number }>();

export function runWithShop<T>(shopId: number, fn: () => Promise<T> | T): Promise<T> | T {
  return storage.run({ shopId }, fn);
}

// Returns null if not in a shop context — callers must decide whether
// that's fatal or not. Most should treat it as a programmer error.
export function maybeCurrentShopId(): number | null {
  return storage.getStore()?.shopId ?? null;
}

// Throws if called outside any runWithShop block. This is the version
// every model should use — a missing shopId is a bug, not a possibility
// to handle gracefully.
export function currentShopId(): number {
  const id = maybeCurrentShopId();
  if (id == null) {
    throw new Error(
      "currentShopId() called outside a shop context. " +
        "If this is a script, wrap your work in runWithShop(shopId, ...). " +
        "If this is a request, the auth/setup middleware should have run.",
    );
  }
  return id;
}
