import { _legacySqliteDb } from "./db";
import * as Settings from "../models/settings";

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

function tableHasRows(table: string): boolean {
  const row = _legacySqliteDb()
    .prepare(`SELECT 1 FROM ${table} LIMIT 1`)
    .get() as unknown;
  return !!row;
}

export async function getStatus(): Promise<SetupStatus> {
  const shopName = await Settings.get("shop_name");
  const hasShopName = !!shopName && shopName.trim().length > 0 && shopName !== "Coffee Shop";
  const hasMenu = tableHasRows("menu_items");
  // employees table always contains the owner. The meaningful check is
  // "has at least one non-owner record" — but a single-owner shop is valid,
  // so we treat "any employees row" as true. Owner counts.
  const hasEmployees = tableHasRows("employees");
  const hasSales = tableHasRows("sales_sessions");
  const sig = await Settings.get("shop_signature");
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
}
