import type { Request, Response } from "express";
import * as Reports from "../lib/reports";
import * as Runs from "../models/payrollRuns";
import * as Entries from "../models/payrollEntries";
import * as Settings from "../models/settings";
import * as Purchases from "../models/purchases";
import * as Sessions from "../models/salesSessions";
import * as Employees from "../models/employees";
import { toCsv } from "../lib/csv";
import { todayBusinessDate } from "../lib/dates";

async function defaultRange(): Promise<{ from: string; to: string }> {
  // Default to today only — that's the single most-asked-for view. The user
  // widens the range with the date picker when they want history; the by-month
  // section then fills in once the range crosses a month boundary.
  const today = todayBusinessDate((await Settings.get("business_day_cutoff")) ?? "00:00", (await Settings.get("timezone")) ?? "Africa/Addis_Ababa");
  return { from: today, to: today };
}

async function rangeFromReq(req: Request): Promise<{ from: string; to: string }> {
  const d = await defaultRange();
  const from = req.query.from ? String(req.query.from) : d.from;
  const to   = req.query.to   ? String(req.query.to)   : d.to;
  return { from, to };
}

const TABS = ["sales", "purchases", "petty-cash", "payroll"] as const;
type Tab = typeof TABS[number];

function safeTab(input: unknown): Tab {
  return (TABS as readonly string[]).includes(String(input)) ? input as Tab : "sales";
}

async function loadTabData(tab: Tab, range: { from: string; to: string }) {
  if (tab === "sales") {
    return {
      byDay: await Reports.salesByDay(range),
      byMonth: await Reports.salesByMonth(range),
      byItem: await Reports.salesByItem(range),
      byEmployee: await Reports.salesByEmployee(range),
    };
  }
  if (tab === "purchases") {
    return {
      byDay: await Reports.purchasesByDay(range),
      byMonth: await Reports.purchasesByMonth(range),
      details: await Purchases.listAll(range), // every line item in the range
    };
  }
  if (tab === "petty-cash") {
    return {
      summary: await Reports.pettyCashSummary(range),
      byMonth: await Reports.pettyCashByMonth(range),
    };
  }
  // payroll
  const rawRuns = await Runs.listAll();
  const runs = await Promise.all(rawRuns.map(async r => {
    const entries = await Entries.listForRun(r.id);
    return {
      ...r,
      employee_count: entries.length,
      total_gross: entries.reduce((s, e) => s + e.gross_salary, 0),
      total_net: entries.reduce((s, e) => s + e.net_payment, 0),
    };
  }));
  return { runs };
}

export async function show(req: Request, res: Response) {
  const tab = safeTab(req.query.tab);
  const range = await rangeFromReq(req);
  const data = await loadTabData(tab, range);
  res.render("reports/index", { tab, range, data });
}

// Fragment endpoint for the "By day" drilldown modal on the Sales reports tab.
// Renders the day's shift breakdown + top items without a page layout.
export async function dayDetail(req: Request, res: Response) {
  const date = String(req.params.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).send("Bad date");

  const rawShifts = await Sessions.listAll({ from: date, to: date });
  const shifts = await Promise.all(rawShifts.map(s => Sessions.withTotals(s.id).then(t => t!)));
  const employeeIds = Array.from(new Set(shifts.map(s => s.employee_id)));
  const allEmployees = await Employees.listAll({ activeOnly: false });
  const empById: Record<number, string> = {};
  for (const e of allEmployees) empById[e.id] = e.full_name;

  const byItem = await Reports.salesByItem({ from: date, to: date });
  const topItems = byItem.slice(0, 10);

  const dayTotalSubtotal = shifts.reduce((s, x) => s + x.subtotal, 0);
  const dayTotalCounted  = shifts.reduce((s, x) => s + x.total_amount, 0);
  const dayDifference    = dayTotalCounted - dayTotalSubtotal;

  res.render("reports/_day_detail", {
    date, shifts, empById, topItems,
    dayTotalSubtotal, dayTotalCounted, dayDifference,
    layout: false,
  }, (err, html) => {
    if (err) return res.status(500).send("render error");
    res.send(html);
  });
}

export async function exportCsv(req: Request, res: Response) {
  const tab = safeTab(req.query.tab);
  const range = await rangeFromReq(req);

  let filename = `${tab}-${range.from}-to-${range.to}.csv`;
  let csv = "";

  if (tab === "sales") {
    const grouping = (req.query.group as string) || "day";
    if (grouping === "item") {
      const rows = (await Reports.salesByItem(range)).map(r => ({ ...r, revenue: (r.revenue / 100).toFixed(2) }));
      csv = toCsv(["name", "qty", "revenue"], rows);
      filename = `sales-by-item-${range.from}-to-${range.to}.csv`;
    } else if (grouping === "employee") {
      const rows = (await Reports.salesByEmployee(range)).map(r => ({ ...r, subtotal: (r.subtotal / 100).toFixed(2) }));
      csv = toCsv(["full_name", "session_count", "subtotal"], rows);
      filename = `sales-by-employee-${range.from}-to-${range.to}.csv`;
    } else if (grouping === "month") {
      const rows = (await Reports.salesByMonth(range)).map(r => ({ ...r, subtotal: (r.subtotal / 100).toFixed(2) }));
      csv = toCsv(["month", "session_count", "subtotal"], rows);
      filename = `sales-by-month-${range.from}-to-${range.to}.csv`;
    } else {
      const rows = (await Reports.salesByDay(range)).map(r => ({ ...r, subtotal: (r.subtotal / 100).toFixed(2) }));
      csv = toCsv(["business_date", "session_count", "subtotal"], rows);
      filename = `sales-by-day-${range.from}-to-${range.to}.csv`;
    }
  } else if (tab === "purchases") {
    const grouping = (req.query.group as string) || "day";
    if (grouping === "month") {
      const rows = (await Reports.purchasesByMonth(range)).map(r => ({ ...r, total: (r.total / 100).toFixed(2) }));
      csv = toCsv(["month", "row_count", "total"], rows);
      filename = `purchases-by-month-${range.from}-to-${range.to}.csv`;
    } else if (grouping === "detail") {
      const rows = (await Purchases.listAll(range)).map(r => ({
        date: r.purchase_date,
        description: r.description,
        unit: r.unit ?? "",
        qty: r.qty,
        unit_price: (r.unit_price / 100).toFixed(2),
        total: (r.total / 100).toFixed(2),
        remark: r.remark ?? "",
      }));
      csv = toCsv(["date", "description", "unit", "qty", "unit_price", "total", "remark"], rows);
      filename = `purchases-detail-${range.from}-to-${range.to}.csv`;
    } else {
      const rows = (await Reports.purchasesByDay(range)).map(r => ({ ...r, total: (r.total / 100).toFixed(2) }));
      csv = toCsv(["purchase_date", "row_count", "total"], rows);
    }
  } else if (tab === "petty-cash") {
    const grouping = (req.query.group as string) || "summary";
    if (grouping === "month") {
      const rows = (await Reports.pettyCashByMonth(range)).map(r => ({
        month: r.month,
        total_in:  (r.total_in / 100).toFixed(2),
        total_out: (r.total_out / 100).toFixed(2),
        net:       (r.net / 100).toFixed(2),
      }));
      csv = toCsv(["month", "total_in", "total_out", "net"], rows);
      filename = `petty-cash-by-month-${range.from}-to-${range.to}.csv`;
    } else {
      const s = await Reports.pettyCashSummary(range);
      csv = toCsv(
        ["metric", "amount"],
        [
          { metric: "expense",       amount: (s.byType.expense / 100).toFixed(2) },
          { metric: "refund",        amount: (s.byType.refund / 100).toFixed(2) },
          { metric: "replenishment", amount: (s.byType.replenishment / 100).toFixed(2) },
          { metric: "total_in",      amount: (s.totalIn / 100).toFixed(2) },
          { metric: "total_out",     amount: (s.totalOut / 100).toFixed(2) },
          { metric: "net",           amount: (s.net / 100).toFixed(2) },
        ],
      );
    }
  } else if (tab === "payroll") {
    const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const rawRuns = await Runs.listAll();
    const rows = await Promise.all(rawRuns.map(async r => {
      const entries = await Entries.listForRun(r.id);
      return {
        period: `${monthNames[r.month - 1]} ${r.year}`,
        status: r.status,
        employees: entries.length,
        gross: (entries.reduce((s, e) => s + e.gross_salary, 0) / 100).toFixed(2),
        net:   (entries.reduce((s, e) => s + e.net_payment,  0) / 100).toFixed(2),
      };
    }));
    csv = toCsv(["period", "status", "employees", "gross", "net"], rows);
    filename = `payroll-runs.csv`;
  }

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
}

export async function print(req: Request, res: Response) {
  const tab = safeTab(req.query.tab);
  const range = await rangeFromReq(req);
  const data = await loadTabData(tab, range);
  const shopName = (await Settings.get("shop_name")) ?? "Coffee Shop";
  res.render("reports/print", { tab, range, data, shopName });
}
