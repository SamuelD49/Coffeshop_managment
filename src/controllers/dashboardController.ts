import type { Request, Response } from "express";
import * as Reports from "../lib/reports";
import * as Settings from "../models/settings";
import { todayBusinessDate } from "../lib/dates";

export function show(_req: Request, res: Response) {
  const today = todayBusinessDate(
    Settings.get("business_day_cutoff") ?? "00:00",
    Settings.get("timezone") ?? "Africa/Addis_Ababa",
  );
  const data = {
    today,
    salesTotal: Reports.todaySalesTotal(today),
    cashVsBank: Reports.todayCashVsBank(today),
    purchasesTotal: Reports.todayPurchasesTotal(today),
    pettyCashSpent: Reports.todayPettyCashSpent(today),
    topItems: Reports.topItemsToday(today, 5),
  };
  res.render("dashboard", { data });
}
