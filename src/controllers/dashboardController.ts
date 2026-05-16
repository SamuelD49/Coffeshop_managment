import type { Request, Response } from "express";
import * as Reports from "../lib/reports";
import * as Settings from "../models/settings";
import * as Menu from "../models/menuItems";
import { todayBusinessDate } from "../lib/dates";
import { getStatus as getSetupStatus } from "../lib/setupStatus";

const TOKEN_FALLBACK = ["#C75D34", "#5C7558", "#B68A3C", "#8B2A26", "#3E2A1F", "#9E4524", "#7A6E62"];

function colorForItem(id: number, token_color: string | null | undefined): string {
  return token_color || TOKEN_FALLBACK[id % TOKEN_FALLBACK.length];
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayLabel(yyyymmdd: string): string {
  // Use UTC to avoid local-tz wobble; the date string itself is the canonical business date.
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return DAY_NAMES[dt.getUTCDay()];
}

export async function show(_req: Request, res: Response) {
  const today = todayBusinessDate(
    (await Settings.get("business_day_cutoff")) ?? "00:00",
    (await Settings.get("timezone")) ?? "Africa/Addis_Ababa",
  );

  // Today's snapshot (unchanged)
  const todayBlock = {
    salesTotal: Reports.todaySalesTotal(today),
    cashVsBank: Reports.todayCashVsBank(today),
    purchasesTotal: Reports.todayPurchasesTotal(today),
    pettyCashSpent: Reports.todayPettyCashSpent(today),
    topItems: Reports.topItemsToday(today, 5),
  };

  // Last 7 days sparkline (today inclusive)
  const weekFrom = Reports.shiftDate(today, -6);
  const weekDays = Reports.salesByDayDense({ from: weekFrom, to: today }).map(d => ({
    date: d.business_date,
    label: dayLabel(d.business_date),
    total: d.subtotal,
  }));
  const weekTotal = weekDays.reduce((s, d) => s + d.total, 0);
  const weekMax = Math.max(0, ...weekDays.map(d => d.total));

  // Prior 7 days for the comparison
  const priorTo = Reports.shiftDate(today, -7);
  const priorFrom = Reports.shiftDate(today, -13);
  const priorDays = Reports.salesByDay({ from: priorFrom, to: priorTo });
  const priorTotal = priorDays.reduce((s, d) => s + d.subtotal, 0);
  const weekDeltaPct = priorTotal > 0
    ? Math.round(((weekTotal - priorTotal) / priorTotal) * 100)
    : null;

  // Trending products (top 6 by qty over the last 7 days)
  const items = Menu.listAll();
  const itemById: Record<number, { name: string; token_color: string | null }> = {};
  for (const m of items) itemById[m.id] = { name: m.name, token_color: m.token_color };

  const trendingRaw = Reports.salesByItem({ from: weekFrom, to: today }).slice(0, 6);
  const trendingMax = Math.max(0, ...trendingRaw.map(t => t.qty));
  const trending = trendingRaw.map(r => ({
    name: r.name,
    qty: r.qty,
    revenue: r.revenue,
    color: colorForItem(r.menu_item_id, itemById[r.menu_item_id]?.token_color ?? null),
  }));

  // Onboarding checklist — only shown to owners and only until every step
  // is ticked. Hides itself once complete (no manual dismiss).
  const setup = await getSetupStatus();

  const data = {
    today,
    weekFrom,
    todayBlock,
    weekDays,
    weekTotal,
    weekMax,
    weekDeltaPct,
    priorTotal,
    trending,
    trendingMax,
    setup,
  };
  res.render("dashboard", { data });
}
