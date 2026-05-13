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

export function list(req: Request, res: Response) {
  const filters: any = {};
  if (req.query.from)   filters.from = String(req.query.from);
  if (req.query.to)     filters.to   = String(req.query.to);
  if (req.query.status) filters.status = String(req.query.status);
  if (role(req) === "employee") filters.employeeId = actor(req);
  else if (req.query.employee) filters.employeeId = Number(req.query.employee);

  const sessions = Sessions.listAll(filters).map(s => Sessions.withTotals(s.id)!);
  const employees = role(req) === "owner" ? Employees.listAll({ activeOnly: false }) : [];
  res.render("sales/list", { sessions, employees, filters });
}

export function showNew(_req: Request, res: Response) {
  const today = todayBusinessDate(
    Settings.get("business_day_cutoff") ?? "00:00",
    Settings.get("timezone") ?? "Africa/Addis_Ababa",
  );
  res.render("sales/new", { today });
}

export function create(req: Request, res: Response) {
  const business_date = (req.body.business_date ?? "").toString();
  const shift = (req.body.shift ?? "").toString().trim() || null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(business_date)) {
    pushFlash(req, "error", "Pick a valid date");
    return res.redirect("/sales/new");
  }
  const s = Sessions.create({ employee_id: actor(req), business_date, shift });
  writeAudit({ actor_id: actor(req), action: "create_sales_session", entity: "sales_sessions", entity_id: s.id });
  res.redirect(`/sales/${s.id}`);
}

export function entry(req: Request, res: Response) {
  const id = Number(req.params.id);
  const session = Sessions.findById(id);
  if (!session) return res.status(404).render("errors/404");
  if (!canView(req, session)) return res.status(403).render("errors/403", { message: "Not your shift" });

  const items = Menu.listActiveByPopularity();
  const linesArr = Lines.listForSession(id);
  const lines: Record<number, typeof linesArr[0]> = {};
  for (const l of linesArr) lines[l.menu_item_id] = l;
  const totals = Sessions.withTotals(id)!;
  const editable = canEdit(req, session);
  const employee = Employees.findById(session.employee_id);
  res.render("sales/entry", { session, totals, items, lines, employee, editable });
}

export function upsertLine(req: Request, res: Response) {
  const id = Number(req.params.id);
  const menuItemId = Number(req.params.menuItemId);
  const session = Sessions.findById(id);
  if (!session || !canEdit(req, session)) return res.status(403).send("Forbidden");

  const qty = Math.max(0, Math.floor(Number(req.body.qty || 0)));
  const line = Lines.upsert(id, menuItemId, qty);
  const totals = Sessions.withTotals(id)!;
  const item = Menu.findById(menuItemId);

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

export function updateHeader(req: Request, res: Response) {
  const id = Number(req.params.id);
  const session = Sessions.findById(id);
  if (!session || !canEdit(req, session)) return res.status(403).send("Forbidden");
  Sessions.updateHeader(id, {
    cash_amount: parseMajor(req.body.cash_amount),
    bank_transfer_amount: parseMajor(req.body.bank_transfer_amount),
    notes: (req.body.notes ?? "").toString() || null,
  });
  const totals = Sessions.withTotals(id)!;
  res.render("sales/_totals", { totals, layout: false }, (err, html) => {
    if (err) return res.status(500).send("render error");
    res.send(html);
  });
}

export function close(req: Request, res: Response) {
  const id = Number(req.params.id);
  const session = Sessions.findById(id);
  if (!session || !canEdit(req, session)) return res.status(403).render("errors/403", { message: "Cannot close this shift" });
  Sessions.close(id);
  writeAudit({ actor_id: actor(req), action: "close_sales_session", entity: "sales_sessions", entity_id: id });
  pushFlash(req, "success", "Shift closed");
  res.redirect(`/sales/${id}`);
}

export function reopen(req: Request, res: Response) {
  const id = Number(req.params.id);
  const session = Sessions.findById(id);
  if (!session) return res.status(404).render("errors/404");
  if (role(req) !== "owner") return res.status(403).render("errors/403", { message: "Only the owner can reopen a shift" });
  Sessions.reopen(id);
  writeAudit({ actor_id: actor(req), action: "reopen_sales_session", entity: "sales_sessions", entity_id: id });
  pushFlash(req, "success", "Shift reopened");
  res.redirect(`/sales/${id}`);
}
