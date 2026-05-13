import { getDb } from "./db";

export type DateRange = { from: string; to: string };

export type SalesByDayRow = { business_date: string; subtotal: number; session_count: number };
export type SalesByItemRow = { menu_item_id: number; name: string; qty: number; revenue: number };
export type SalesByEmployeeRow = { employee_id: number; full_name: string; subtotal: number; session_count: number };
export type PurchasesByDayRow = { purchase_date: string; total: number; row_count: number };
export type PettyCashSummary = {
  totalIn: number;
  totalOut: number;
  net: number;
  byType: { expense: number; refund: number; replenishment: number };
};

export function salesByDay(range: DateRange): SalesByDayRow[] {
  return getDb().prepare(`
    SELECT s.business_date,
           COALESCE(SUM(l.total), 0) AS subtotal,
           COUNT(DISTINCT s.id) AS session_count
    FROM sales_sessions s
    LEFT JOIN sale_line_items l ON l.sales_session_id = s.id
    WHERE s.business_date BETWEEN @from AND @to
    GROUP BY s.business_date
    ORDER BY s.business_date
  `).all(range) as SalesByDayRow[];
}

export function salesByItem(range: DateRange): SalesByItemRow[] {
  return getDb().prepare(`
    SELECT l.menu_item_id, m.name,
           COALESCE(SUM(l.qty), 0)   AS qty,
           COALESCE(SUM(l.total), 0) AS revenue
    FROM sale_line_items l
    JOIN sales_sessions s ON s.id = l.sales_session_id
    JOIN menu_items m     ON m.id = l.menu_item_id
    WHERE s.business_date BETWEEN @from AND @to
    GROUP BY l.menu_item_id, m.name
    ORDER BY revenue DESC, m.name
  `).all(range) as SalesByItemRow[];
}

export function salesByEmployee(range: DateRange): SalesByEmployeeRow[] {
  return getDb().prepare(`
    SELECT s.employee_id, e.full_name,
           COALESCE(SUM(l.total), 0) AS subtotal,
           COUNT(DISTINCT s.id)      AS session_count
    FROM sales_sessions s
    JOIN employees e ON e.id = s.employee_id
    LEFT JOIN sale_line_items l ON l.sales_session_id = s.id
    WHERE s.business_date BETWEEN @from AND @to
    GROUP BY s.employee_id, e.full_name
    ORDER BY subtotal DESC, e.full_name
  `).all(range) as SalesByEmployeeRow[];
}

export function purchasesByDay(range: DateRange): PurchasesByDayRow[] {
  return getDb().prepare(`
    SELECT purchase_date,
           COALESCE(SUM(total), 0) AS total,
           COUNT(*) AS row_count
    FROM purchase_requisitions
    WHERE purchase_date BETWEEN @from AND @to
    GROUP BY purchase_date
    ORDER BY purchase_date
  `).all(range) as PurchasesByDayRow[];
}

export function pettyCashSummary(range: DateRange): PettyCashSummary {
  const rows = getDb().prepare(`
    SELECT type, COALESCE(SUM(amount), 0) AS total
    FROM petty_cash_entries
    WHERE entry_date BETWEEN @from AND @to
    GROUP BY type
  `).all(range) as Array<{ type: "expense" | "refund" | "replenishment"; total: number }>;

  const byType = { expense: 0, refund: 0, replenishment: 0 };
  for (const r of rows) byType[r.type] = r.total;
  const totalIn = byType.refund + byType.replenishment;
  const totalOut = byType.expense;
  return { totalIn, totalOut, net: totalIn - totalOut, byType };
}

// Dashboard helpers

export function todaySalesTotal(businessDate: string): number {
  const r = getDb().prepare(`
    SELECT COALESCE(SUM(l.total), 0) AS subtotal
    FROM sales_sessions s
    LEFT JOIN sale_line_items l ON l.sales_session_id = s.id
    WHERE s.business_date = ?
  `).get(businessDate) as { subtotal: number };
  return r.subtotal;
}

export function todayCashVsBank(businessDate: string): { cash: number; bank: number } {
  const r = getDb().prepare(`
    SELECT COALESCE(SUM(cash_amount), 0)         AS cash,
           COALESCE(SUM(bank_transfer_amount), 0) AS bank
    FROM sales_sessions
    WHERE business_date = ?
  `).get(businessDate) as { cash: number; bank: number };
  return r;
}

export function todayPurchasesTotal(businessDate: string): number {
  const r = getDb().prepare("SELECT COALESCE(SUM(total), 0) AS s FROM purchase_requisitions WHERE purchase_date = ?").get(businessDate) as { s: number };
  return r.s;
}

export function todayPettyCashSpent(businessDate: string): number {
  const r = getDb().prepare("SELECT COALESCE(SUM(amount), 0) AS s FROM petty_cash_entries WHERE entry_date = ? AND type = 'expense'").get(businessDate) as { s: number };
  return r.s;
}

export function topItemsToday(businessDate: string, limit: number = 5): SalesByItemRow[] {
  return getDb().prepare(`
    SELECT l.menu_item_id, m.name,
           COALESCE(SUM(l.qty), 0)   AS qty,
           COALESCE(SUM(l.total), 0) AS revenue
    FROM sale_line_items l
    JOIN sales_sessions s ON s.id = l.sales_session_id
    JOIN menu_items m     ON m.id = l.menu_item_id
    WHERE s.business_date = ?
    GROUP BY l.menu_item_id, m.name
    ORDER BY qty DESC, m.name
    LIMIT ?
  `).all(businessDate, limit) as SalesByItemRow[];
}
