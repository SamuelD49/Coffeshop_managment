import { getDb } from "./kysely";
import { sql } from "kysely";

export type DateRange = { from: string; to: string };

export type SalesByDayRow = { business_date: string; subtotal: number; session_count: number };
export type SalesByMonthRow = { month: string; subtotal: number; session_count: number };
export type SalesByItemRow = { menu_item_id: number; name: string; qty: number; revenue: number };
export type SalesByEmployeeRow = { employee_id: number; full_name: string; subtotal: number; session_count: number };
export type PurchasesByDayRow = { purchase_date: string; total: number; row_count: number };
export type PurchasesByMonthRow = { month: string; total: number; row_count: number };
export type PettyCashByMonthRow = { month: string; total_in: number; total_out: number; net: number };
export type PettyCashSummary = {
  totalIn: number;
  totalOut: number;
  net: number;
  byType: { expense: number; refund: number; replenishment: number };
};

export async function salesByDay(range: DateRange): Promise<SalesByDayRow[]> {
  const rows = await getDb()
    .selectFrom("sales_sessions as s")
    .leftJoin("sale_line_items as l", "l.sales_session_id", "s.id")
    .select((eb) => [
      "s.business_date",
      eb.fn.coalesce(eb.fn.sum<number>("l.total"), eb.lit(0)).as("subtotal"),
      eb.fn.count<number>("s.id").distinct().as("session_count"),
    ])
    .where("s.business_date", ">=", range.from)
    .where("s.business_date", "<=", range.to)
    .groupBy("s.business_date")
    .orderBy("s.business_date")
    .execute();
  return rows.map((r) => ({ business_date: r.business_date, subtotal: Number(r.subtotal), session_count: Number(r.session_count) }));
}

// salesByDay but with zero-filled days for every date in the range — useful for
// the dashboard sparkline where missing days still need a bar position.
export async function salesByDayDense(range: DateRange): Promise<SalesByDayRow[]> {
  const rows = await salesByDay(range);
  const byDate: Record<string, SalesByDayRow> = {};
  for (const r of rows) byDate[r.business_date] = r;

  const out: SalesByDayRow[] = [];
  let cursor = range.from;
  while (cursor <= range.to) {
    out.push(byDate[cursor] ?? { business_date: cursor, subtotal: 0, session_count: 0 });
    cursor = addDays(cursor, 1);
  }
  return out;
}

function addDays(yyyymmdd: string, days: number): string {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function shiftDate(yyyymmdd: string, days: number): string {
  return addDays(yyyymmdd, days);
}

export async function salesByItem(range: DateRange): Promise<SalesByItemRow[]> {
  const rows = await getDb()
    .selectFrom("sale_line_items as l")
    .innerJoin("sales_sessions as s", "s.id", "l.sales_session_id")
    .innerJoin("menu_items as m", "m.id", "l.menu_item_id")
    .select((eb) => [
      "l.menu_item_id",
      "m.name",
      eb.fn.coalesce(eb.fn.sum<number>("l.qty"), eb.lit(0)).as("qty"),
      eb.fn.coalesce(eb.fn.sum<number>("l.total"), eb.lit(0)).as("revenue"),
    ])
    .where("s.business_date", ">=", range.from)
    .where("s.business_date", "<=", range.to)
    .groupBy(["l.menu_item_id", "m.name"])
    .orderBy("revenue", "desc")
    .orderBy("m.name")
    .execute();
  return rows.map((r) => ({ menu_item_id: r.menu_item_id, name: r.name, qty: Number(r.qty), revenue: Number(r.revenue) }));
}

export async function salesByEmployee(range: DateRange): Promise<SalesByEmployeeRow[]> {
  const rows = await getDb()
    .selectFrom("sales_sessions as s")
    .innerJoin("employees as e", "e.id", "s.employee_id")
    .leftJoin("sale_line_items as l", "l.sales_session_id", "s.id")
    .select((eb) => [
      "s.employee_id",
      "e.full_name",
      eb.fn.coalesce(eb.fn.sum<number>("l.total"), eb.lit(0)).as("subtotal"),
      eb.fn.count<number>("s.id").distinct().as("session_count"),
    ])
    .where("s.business_date", ">=", range.from)
    .where("s.business_date", "<=", range.to)
    .groupBy(["s.employee_id", "e.full_name"])
    .orderBy("subtotal", "desc")
    .orderBy("e.full_name")
    .execute();
  return rows.map((r) => ({ employee_id: r.employee_id, full_name: r.full_name, subtotal: Number(r.subtotal), session_count: Number(r.session_count) }));
}

export async function purchasesByDay(range: DateRange): Promise<PurchasesByDayRow[]> {
  const rows = await getDb()
    .selectFrom("purchase_requisitions")
    .select((eb) => [
      "purchase_date",
      eb.fn.coalesce(eb.fn.sum<number>("total"), eb.lit(0)).as("total"),
      eb.fn.countAll<number>().as("row_count"),
    ])
    .where("purchase_date", ">=", range.from)
    .where("purchase_date", "<=", range.to)
    .groupBy("purchase_date")
    .orderBy("purchase_date")
    .execute();
  return rows.map((r) => ({ purchase_date: r.purchase_date, total: Number(r.total), row_count: Number(r.row_count) }));
}

// Monthly aggregations group by the YYYY-MM prefix of the date string. Both
// SQLite and Postgres support substr(col, 1, 7); we use the raw SQL helper to
// keep the alias stable across dialects.
export async function salesByMonth(range: DateRange): Promise<SalesByMonthRow[]> {
  const rows = await getDb()
    .selectFrom("sales_sessions as s")
    .leftJoin("sale_line_items as l", "l.sales_session_id", "s.id")
    .select((eb) => [
      sql<string>`substr(s.business_date, 1, 7)`.as("month"),
      eb.fn.coalesce(eb.fn.sum<number>("l.total"), eb.lit(0)).as("subtotal"),
      eb.fn.count<number>("s.id").distinct().as("session_count"),
    ])
    .where("s.business_date", ">=", range.from)
    .where("s.business_date", "<=", range.to)
    .groupBy("month")
    .orderBy("month")
    .execute();
  return rows.map((r) => ({ month: r.month, subtotal: Number(r.subtotal), session_count: Number(r.session_count) }));
}

export async function purchasesByMonth(range: DateRange): Promise<PurchasesByMonthRow[]> {
  const rows = await getDb()
    .selectFrom("purchase_requisitions")
    .select((eb) => [
      sql<string>`substr(purchase_date, 1, 7)`.as("month"),
      eb.fn.coalesce(eb.fn.sum<number>("total"), eb.lit(0)).as("total"),
      eb.fn.countAll<number>().as("row_count"),
    ])
    .where("purchase_date", ">=", range.from)
    .where("purchase_date", "<=", range.to)
    .groupBy("month")
    .orderBy("month")
    .execute();
  return rows.map((r) => ({ month: r.month, total: Number(r.total), row_count: Number(r.row_count) }));
}

export async function pettyCashByMonth(range: DateRange): Promise<PettyCashByMonthRow[]> {
  const rows = await getDb()
    .selectFrom("petty_cash_entries")
    .select([
      sql<string>`substr(entry_date, 1, 7)`.as("month"),
      sql<number>`COALESCE(SUM(CASE WHEN type IN ('refund','replenishment') THEN amount ELSE 0 END), 0)`.as("total_in"),
      sql<number>`COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0)`.as("total_out"),
    ])
    .where("entry_date", ">=", range.from)
    .where("entry_date", "<=", range.to)
    .groupBy("month")
    .orderBy("month")
    .execute();
  return rows.map((r) => ({
    month: r.month,
    total_in: Number(r.total_in),
    total_out: Number(r.total_out),
    net: Number(r.total_in) - Number(r.total_out),
  }));
}

export async function pettyCashSummary(range: DateRange): Promise<PettyCashSummary> {
  const rows = await getDb()
    .selectFrom("petty_cash_entries")
    .select((eb) => [
      "type",
      eb.fn.coalesce(eb.fn.sum<number>("amount"), eb.lit(0)).as("total"),
    ])
    .where("entry_date", ">=", range.from)
    .where("entry_date", "<=", range.to)
    .groupBy("type")
    .execute();

  const byType = { expense: 0, refund: 0, replenishment: 0 };
  for (const r of rows) byType[r.type as keyof typeof byType] = Number(r.total);
  const totalIn = byType.refund + byType.replenishment;
  const totalOut = byType.expense;
  return { totalIn, totalOut, net: totalIn - totalOut, byType };
}

// Dashboard helpers

export async function todaySalesTotal(businessDate: string): Promise<number> {
  const r = await getDb()
    .selectFrom("sales_sessions as s")
    .leftJoin("sale_line_items as l", "l.sales_session_id", "s.id")
    .select((eb) => eb.fn.coalesce(eb.fn.sum<number>("l.total"), eb.lit(0)).as("subtotal"))
    .where("s.business_date", "=", businessDate)
    .executeTakeFirstOrThrow();
  return Number(r.subtotal);
}

export async function todayCashVsBank(businessDate: string): Promise<{ cash: number; bank: number }> {
  const r = await getDb()
    .selectFrom("sales_sessions")
    .select((eb) => [
      eb.fn.coalesce(eb.fn.sum<number>("cash_amount"), eb.lit(0)).as("cash"),
      eb.fn.coalesce(eb.fn.sum<number>("bank_transfer_amount"), eb.lit(0)).as("bank"),
    ])
    .where("business_date", "=", businessDate)
    .executeTakeFirstOrThrow();
  return { cash: Number(r.cash), bank: Number(r.bank) };
}

export async function todayPurchasesTotal(businessDate: string): Promise<number> {
  const r = await getDb()
    .selectFrom("purchase_requisitions")
    .select((eb) => eb.fn.coalesce(eb.fn.sum<number>("total"), eb.lit(0)).as("s"))
    .where("purchase_date", "=", businessDate)
    .executeTakeFirstOrThrow();
  return Number(r.s);
}

export async function todayPettyCashSpent(businessDate: string): Promise<number> {
  const r = await getDb()
    .selectFrom("petty_cash_entries")
    .select((eb) => eb.fn.coalesce(eb.fn.sum<number>("amount"), eb.lit(0)).as("s"))
    .where("entry_date", "=", businessDate)
    .where("type", "=", "expense")
    .executeTakeFirstOrThrow();
  return Number(r.s);
}

export async function topItemsToday(businessDate: string, limit: number = 5): Promise<SalesByItemRow[]> {
  const rows = await getDb()
    .selectFrom("sale_line_items as l")
    .innerJoin("sales_sessions as s", "s.id", "l.sales_session_id")
    .innerJoin("menu_items as m", "m.id", "l.menu_item_id")
    .select((eb) => [
      "l.menu_item_id",
      "m.name",
      eb.fn.coalesce(eb.fn.sum<number>("l.qty"), eb.lit(0)).as("qty"),
      eb.fn.coalesce(eb.fn.sum<number>("l.total"), eb.lit(0)).as("revenue"),
    ])
    .where("s.business_date", "=", businessDate)
    .groupBy(["l.menu_item_id", "m.name"])
    .orderBy("qty", "desc")
    .orderBy("m.name")
    .limit(limit)
    .execute();
  return rows.map((r) => ({ menu_item_id: r.menu_item_id, name: r.name, qty: Number(r.qty), revenue: Number(r.revenue) }));
}
