import type { Request, Response } from "express";
import * as Sessions from "../models/salesSessions";
import * as Lines from "../models/saleLineItems";
import * as Menu from "../models/menuItems";
import * as Employees from "../models/employees";
import * as Settings from "../models/settings";
import { todayBusinessDate } from "../lib/dates";
import { writeAudit } from "../lib/audit";
import { pushFlash } from "../lib/flash";

function actor(req: Request): number { return req.session.employeeId!; }
function role(req: Request): "owner" | "employee" { return req.session.role!; }

function canView(req: Request, session: Sessions.SalesSession): boolean {
  return role(req) === "owner" || session.employee_id === actor(req);
}
function canEdit(req: Request, session: Sessions.SalesSession): boolean {
  if (role(req) === "owner") return true;
  return session.employee_id === actor(req) && session.status === "open";
}

export async function list(req: Request, res: Response) {
  const filters: any = {
    date: "",
    from: "",
    to: "",
    status: "",
    employeeId: undefined
  };
  
  const qDate = req.query.date;
  const qFrom = req.query.from;
  const qTo   = req.query.to;
  const hasAnyDateFilter =
    (typeof qDate === "string" && qDate.trim() !== "") ||
    (typeof qFrom === "string" && qFrom.trim() !== "") ||
    (typeof qTo   === "string" && qTo.trim()   !== "");

  if (typeof qDate === "string" && qDate.trim() !== "") {
    const d = qDate.trim();
    filters.date = d;
    filters.from = d;
    filters.to   = d;
  } else if (hasAnyDateFilter) {
    if (typeof qFrom === "string" && qFrom.trim() !== "") filters.from = qFrom.trim();
    if (typeof qTo   === "string" && qTo.trim()   !== "") filters.to   = qTo.trim();
  } else {
    const today = todayBusinessDate(
      (await Settings.get("business_day_cutoff")) ?? "00:00",
      (await Settings.get("timezone")) ?? "Africa/Addis_Ababa",
    );
    filters.date = today;
    filters.from = today;
    filters.to   = today;
  }

  const qStatus = req.query.status;
  if (typeof qStatus === "string") {
    // Explicit param wins, even if empty (the dropdown's "All" submits "").
    filters.status = qStatus.trim();
  } else {
    // Default: hide open shifts from the past-shifts list — the user's own
    // open shift is already rendered inline above the list.
    filters.status = "closed";
  }

  const qEmployee = req.query.employee;
  if (typeof qEmployee === "string" && qEmployee.trim() !== "") {
    filters.employeeId = Number(qEmployee.trim());
  }

  if (role(req) === "employee") {
    filters.employeeId = actor(req);
  }

  const rawSessions = await Sessions.listAll({
    from: filters.from || undefined,
    to: filters.to || undefined,
    employeeId: filters.employeeId,
    status: filters.status || undefined
  });
  const sessions = await Promise.all(rawSessions.map(async s => (await Sessions.withTotals(s.id))!));

  const employees = role(req) === "owner" ? await Employees.listAll({ activeOnly: false }) : [];
  const hasCashiers = await Employees.hasActiveCashiers();

  // Inline entry data — the current user's own shift for today (or null draft).
  // Independent of the filters above; the inline form is always "you, today".
  const today = todayBusinessDate(
    (await Settings.get("business_day_cutoff")) ?? "00:00",
    (await Settings.get("timezone")) ?? "Africa/Addis_Ababa",
  );
  const myOpen = await Sessions.listAll({
    from: today, to: today, employeeId: actor(req), status: "open",
  });
  let inlineSession: Sessions.SalesSession | null = myOpen[0] ?? null;
  if (!inlineSession) {
    const myClosed = await Sessions.listAll({
      from: today, to: today, employeeId: actor(req), status: "closed",
    });
    if (myClosed.length > 0) inlineSession = myClosed[0];
  }
  const items = await Menu.listActiveByPopularity();
  let inlineLines: Record<number, any> = {};
  let inlineTotals: any = { subtotal: 0, total_amount: 0, difference: 0 };
  if (inlineSession) {
    const linesArr = await Lines.listForSession(inlineSession.id);
    for (const l of linesArr) inlineLines[l.menu_item_id] = l;
    inlineTotals = (await Sessions.withTotals(inlineSession.id))!;
  }
  const inlineEditable = !inlineSession || inlineSession.status === "open";

  // Auto-open the past-shifts disclosure when any query param is set —
  // so direct loads of a filtered URL (or HTMX hx-push-url reloads) don't
  // hide the result that the user just asked for.
  const pastShiftsOpen = !!(
    req.query.date || req.query.from || req.query.to ||
    req.query.status || req.query.employee
  );

  res.render("sales/list", {
    sessions, employees, filters, hasCashiers,
    inlineSession, inlineLines, inlineTotals, items, inlineEditable,
    pastShiftsOpen,
  });
}

export async function showNew(_req: Request, res: Response) {
  const today = todayBusinessDate(
    (await Settings.get("business_day_cutoff")) ?? "00:00",
    (await Settings.get("timezone")) ?? "Africa/Addis_Ababa",
  );
  res.render("sales/new", { today });
}

export async function create(req: Request, res: Response) {
  const business_date = (req.body.business_date ?? "").toString();
  const shift = (req.body.shift ?? "").toString().trim() || null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(business_date)) {
    pushFlash(req, "error", "Pick a valid date");
    return res.redirect("/sales/new");
  }
  const s = await Sessions.create({ employee_id: actor(req), business_date, shift });
  await writeAudit({ actor_id: actor(req), action: "create_sales_session", entity: "sales_sessions", entity_id: s.id });
  res.redirect(`/sales/${s.id}`);
}

async function resolveOrCreateTodaySession(req: Request): Promise<Sessions.SalesSession> {
  const today = todayBusinessDate(
    (await Settings.get("business_day_cutoff")) ?? "00:00",
    (await Settings.get("timezone")) ?? "Africa/Addis_Ababa",
  );
  const open = await Sessions.listAll({
    from: today, to: today, employeeId: actor(req), status: "open",
  });
  // TODO: this find-or-create has a small race window (two concurrent
  // first-keystroke requests can both miss). Acceptable for now — a
  // duplicate open shift is rare and recoverable. A unique index on
  // (shop_id, employee_id, business_date) where status='open' would
  // eliminate it cleanly.
  if (open.length > 0) return open[0];
  const s = await Sessions.create({ employee_id: actor(req), business_date: today, shift: null });
  await writeAudit({ actor_id: actor(req), action: "create_sales_session", entity: "sales_sessions", entity_id: s.id });
  return s;
}

export async function upsertLineToday(req: Request, res: Response) {
  const session = await resolveOrCreateTodaySession(req);
  req.params.id = String(session.id);
  return upsertLine(req, res);
}

export async function updateHeaderToday(req: Request, res: Response) {
  const session = await resolveOrCreateTodaySession(req);
  req.params.id = String(session.id);
  return updateHeader(req, res);
}

export async function closeToday(req: Request, res: Response) {
  const today = todayBusinessDate(
    (await Settings.get("business_day_cutoff")) ?? "00:00",
    (await Settings.get("timezone")) ?? "Africa/Addis_Ababa",
  );
  const open = await Sessions.listAll({
    from: today, to: today, employeeId: actor(req), status: "open",
  });
  if (open.length === 0) {
    pushFlash(req, "info", "No open shift to close.");
    return res.redirect("/sales");
  }
  req.params.id = String(open[0].id);
  return close(req, res);
}

export async function entry(req: Request, res: Response) {
  const id = Number(req.params.id);
  const session = await Sessions.findById(id);
  if (!session) return res.status(404).render("errors/404");
  if (!canView(req, session)) return res.status(403).render("errors/403", { message: "Not your shift" });

  const items = await Menu.listActiveByPopularity();
  const linesArr = await Lines.listForSession(id);
  const lines: Record<number, typeof linesArr[0]> = {};
  for (const l of linesArr) lines[l.menu_item_id] = l;
  const totals = (await Sessions.withTotals(id))!;
  const editable = canEdit(req, session);
  const employee = await Employees.findById(session.employee_id);
  const hasCashiers = await Employees.hasActiveCashiers();
  res.render("sales/entry", { session, totals, items, lines, employee, editable, hasCashiers });
}

export async function upsertLine(req: Request, res: Response) {
  const id = Number(req.params.id);
  const menuItemId = Number(req.params.menuItemId);
  const session = await Sessions.findById(id);
  if (!session || !canEdit(req, session)) return res.status(403).send("Forbidden");

  const qty = Math.max(0, Math.floor(Number(req.body.qty || 0)));
  const line = await Lines.upsert(id, menuItemId, qty);
  const totals = (await Sessions.withTotals(id))!;
  const item = await Menu.findById(menuItemId);

  // Return two HTML fragments: the row total and the footer totals (out-of-band swap).
  res.render("sales/_row", { item, line, totals, layout: false }, (err, rowHtml) => {
    if (err) return res.status(500).send("render error");
    res.render("sales/_totals", { totals, layout: false, oob: true }, (err2, totalsHtml) => {
      if (err2) return res.status(500).send("render error");
      res.send(rowHtml + totalsHtml);
    });
  });
}

function parseMajor(input: unknown): number {
  const n = Number(String(input ?? "0"));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export async function updateHeader(req: Request, res: Response) {
  const id = Number(req.params.id);
  const session = await Sessions.findById(id);
  if (!session || !canEdit(req, session)) return res.status(403).send("Forbidden");
  await Sessions.updateHeader(id, {
    cash_amount: parseMajor(req.body.cash_amount),
    bank_transfer_amount: parseMajor(req.body.bank_transfer_amount),
    notes: (req.body.notes ?? "").toString() || null,
  });
  const totals = (await Sessions.withTotals(id))!;
  res.render("sales/_totals", { totals, layout: false }, (err, html) => {
    if (err) return res.status(500).send("render error");
    res.send(html);
  });
}

export async function close(req: Request, res: Response) {
  const id = Number(req.params.id);
  const session = await Sessions.findById(id);
  if (!session || !canEdit(req, session)) return res.status(403).render("errors/403", { message: "Cannot close this shift" });
  await Sessions.close(id);
  await writeAudit({ actor_id: actor(req), action: "close_sales_session", entity: "sales_sessions", entity_id: id });
  pushFlash(req, "success", "Shift closed");
  // Owners typically close-and-move-on; landing back on the list shows
  // the new closed status in context with the other entries.
  res.redirect("/sales");
}

export async function reopen(req: Request, res: Response) {
  const id = Number(req.params.id);
  const session = await Sessions.findById(id);
  if (!session) return res.status(404).render("errors/404");
  if (role(req) !== "owner") return res.status(403).render("errors/403", { message: "Only the owner can reopen a shift" });
  await Sessions.reopen(id);
  await writeAudit({ actor_id: actor(req), action: "reopen_sales_session", entity: "sales_sessions", entity_id: id });
  pushFlash(req, "success", "Shift reopened");
  res.redirect(`/sales/${id}`);
}

export async function remove(req: Request, res: Response) {
  const id = Number(req.params.id);
  const session = await Sessions.findById(id);
  if (!session) return res.status(404).render("errors/404");
  if (role(req) !== "owner") return res.status(403).render("errors/403", { message: "Only the owner can delete a sales record" });
  await Sessions.remove(id);
  await writeAudit({ actor_id: actor(req), action: "delete_sales_session", entity: "sales_sessions", entity_id: id });
  pushFlash(req, "success", "Sales record deleted");
  res.redirect("/sales");
}
