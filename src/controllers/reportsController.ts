import type { Request, Response } from "express";
import * as Reports from "../lib/reports";
import * as Runs from "../models/payrollRuns";
import * as Entries from "../models/payrollEntries";
import * as Settings from "../models/settings";
import { toCsv } from "../lib/csv";
import { todayBusinessDate } from "../lib/dates";

function defaultRange(): { from: string; to: string } {
  const today = todayBusinessDate(Settings.get("business_day_cutoff") ?? "00:00", Settings.get("timezone") ?? "Africa/Addis_Ababa");
  // last 30 days
  const t = new Date(today);
  t.setDate(t.getDate() - 30);
  const yyyy = t.getFullYear();
  const mm = String(t.getMonth() + 1).padStart(2, "0");
  const dd = String(t.getDate()).padStart(2, "0");
  return { from: `${yyyy}-${mm}-${dd}`, to: today };
}

function rangeFromReq(req: Request): { from: string; to: string } {
  const d = defaultRange();
  const from = req.query.from ? String(req.query.from) : d.from;
  const to   = req.query.to   ? String(req.query.to)   : d.to;
  return { from, to };
}

const TABS = ["sales", "purchases", "petty-cash", "payroll"] as const;
type Tab = typeof TABS[number];

function safeTab(input: unknown): Tab {
  return (TABS as readonly string[]).includes(String(input)) ? input as Tab : "sales";
}

function loadTabData(tab: Tab, range: { from: string; to: string }) {
  if (tab === "sales") {
    return {
      byDay: Reports.salesByDay(range),
      byItem: Reports.salesByItem(range),
      byEmployee: Reports.salesByEmployee(range),
    };
  }
  if (tab === "purchases") {
    return { byDay: Reports.purchasesByDay(range) };
  }
  if (tab === "petty-cash") {
    return { summary: Reports.pettyCashSummary(range) };
  }
  // payroll
  const runs = Runs.listAll().map(r => {
    const entries = Entries.listForRun(r.id);
    return {
      ...r,
      employee_count: entries.length,
      total_gross: entries.reduce((s, e) => s + e.gross_salary, 0),
      total_net: entries.reduce((s, e) => s + e.net_payment, 0),
    };
  });
  return { runs };
}

export function show(req: Request, res: Response) {
  const tab = safeTab(req.query.tab);
  const range = rangeFromReq(req);
  const data = loadTabData(tab, range);
  res.render("reports/index", { tab, range, data });
}

export function exportCsv(req: Request, res: Response) {
  const tab = safeTab(req.query.tab);
  const range = rangeFromReq(req);

  let filename = `${tab}-${range.from}-to-${range.to}.csv`;
  let csv = "";

  if (tab === "sales") {
    const grouping = (req.query.group as string) || "day";
    if (grouping === "item") {
      const rows = Reports.salesByItem(range).map(r => ({ ...r, revenue: (r.revenue / 100).toFixed(2) }));
      csv = toCsv(["name", "qty", "revenue"], rows);
      filename = `sales-by-item-${range.from}-to-${range.to}.csv`;
    } else if (grouping === "employee") {
      const rows = Reports.salesByEmployee(range).map(r => ({ ...r, subtotal: (r.subtotal / 100).toFixed(2) }));
      csv = toCsv(["full_name", "session_count", "subtotal"], rows);
      filename = `sales-by-employee-${range.from}-to-${range.to}.csv`;
    } else {
      const rows = Reports.salesByDay(range).map(r => ({ ...r, subtotal: (r.subtotal / 100).toFixed(2) }));
      csv = toCsv(["business_date", "session_count", "subtotal"], rows);
      filename = `sales-by-day-${range.from}-to-${range.to}.csv`;
    }
  } else if (tab === "purchases") {
    const rows = Reports.purchasesByDay(range).map(r => ({ ...r, total: (r.total / 100).toFixed(2) }));
    csv = toCsv(["purchase_date", "row_count", "total"], rows);
  } else if (tab === "petty-cash") {
    const s = Reports.pettyCashSummary(range);
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
  } else if (tab === "payroll") {
    const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const rows = Runs.listAll().map(r => {
      const entries = Entries.listForRun(r.id);
      return {
        period: `${monthNames[r.month - 1]} ${r.year}`,
        status: r.status,
        employees: entries.length,
        gross: (entries.reduce((s, e) => s + e.gross_salary, 0) / 100).toFixed(2),
        net:   (entries.reduce((s, e) => s + e.net_payment,  0) / 100).toFixed(2),
      };
    });
    csv = toCsv(["period", "status", "employees", "gross", "net"], rows);
    filename = `payroll-runs.csv`;
  }

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
}

export function print(req: Request, res: Response) {
  const tab = safeTab(req.query.tab);
  const range = rangeFromReq(req);
  const data = loadTabData(tab, range);
  const shopName = Settings.get("shop_name") ?? "Coffee Shop";
  res.render("reports/print", { tab, range, data, shopName });
}
