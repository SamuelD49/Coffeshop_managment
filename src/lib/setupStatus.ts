import { getDb } from "./kysely";
import { currentShopId } from "./shopContext";
import { memoize } from "./cache";
import * as Settings from "../models/settings";
import type { DB } from "./db-types";

/**
 * First-run onboarding status — drives the "Getting started" checklist on
 * the dashboard. Each step represents a concrete first action the owner
 * needs to take to make the app useful. Once all are done, the checklist
 * never reappears (we just check status on every dashboard render).
 */

export type SetupStep = {
  key: string;
  done: boolean;
  href: string;
};

export type SetupStatus = {
  complete: boolean;
  doneCount: number;
  totalCount: number;
  steps: SetupStep[];
};

async function tableHasRows(table: keyof DB): Promise<boolean> {
  const row = await getDb()
    .selectFrom(table)
    .select("id" as any)
    .where("shop_id" as any, "=", currentShopId())
    .limit(1)
    .executeTakeFirst();
  return !!row;
}

export async function getStatus(): Promise<SetupStatus> {
  // Memoize the whole thing per-shop. Setup state changes rarely (once,
  // basically — when the owner completes the 5-step checklist). 30s TTL
  // is short enough that a write that flips a step is visible within
  // half a minute even without explicit invalidation; the writes in
  // models/employees, models/menuItems, models/salesSessions, and
  // models/settings call invalidate() to bust it immediately.
  return memoize(`setupStatus:shop:${currentShopId()}`, 30_000, async () => {
    const [shopName, hasMenu, hasEmployees, hasSales, sig] = await Promise.all([
      Settings.get("shop_name"),
      tableHasRows("menu_items"),
      tableHasRows("employees"),
      tableHasRows("sales_sessions"),
      Settings.get("shop_signature"),
    ]);

  const hasShopName = !!shopName && shopName.trim().length > 0 && shopName !== "Coffee Shop";
  const hasSignature = !!sig && sig.length > 0;

  const steps: SetupStep[] = [
    { key: "shop_name", done: hasShopName,  href: "/settings" },
    { key: "menu",      done: hasMenu,      href: "/menu/new" },
    { key: "employees", done: hasEmployees, href: "/employees/new" },
    { key: "sale",      done: hasSales,     href: "/sales/new" },
    { key: "signature", done: hasSignature, href: "/settings" },
  ];

    const doneCount = steps.filter((s) => s.done).length;
    return {
      complete: doneCount === steps.length,
      doneCount,
      totalCount: steps.length,
      steps,
    };
  });
}
