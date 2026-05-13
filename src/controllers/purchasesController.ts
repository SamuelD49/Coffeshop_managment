import type { Request, Response } from "express";
import * as Purchases from "../models/purchases";
import { writeAudit } from "../lib/audit";
import { pushFlash } from "../lib/flash";
import { todayBusinessDate } from "../lib/dates";
import * as Settings from "../models/settings";

function actor(req: Request): number | null { return req.session.employeeId ?? null; }

function parseMajor(v: unknown): number {
  const n = Number(String(v ?? "0"));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function todayDate(): string {
  return todayBusinessDate(Settings.get("business_day_cutoff") ?? "00:00", Settings.get("timezone") ?? "Africa/Addis_Ababa");
}

export function list(req: Request, res: Response) {
  const filters: { from?: string; to?: string } = {};
  if (req.query.from) filters.from = String(req.query.from);
  if (req.query.to)   filters.to   = String(req.query.to);
  const purchases = Purchases.listAll(filters);
  const sumTotal = purchases.reduce((acc, p) => acc + p.total, 0);
  res.render("purchases/list", { purchases, filters, sumTotal, today: todayDate() });
}

export function create(req: Request, res: Response) {
  const description = (req.body.description ?? "").toString().trim();
  if (!description) {
    pushFlash(req, "error", "Description is required");
    return res.redirect("/purchases");
  }
  const purchase_date = (req.body.purchase_date ?? todayDate()).toString();
  const qty = Number(req.body.qty || 0);
  const p = Purchases.create({
    purchase_date,
    description,
    unit: (req.body.unit || null) as string | null,
    qty: Number.isFinite(qty) ? qty : 0,
    unit_price: parseMajor(req.body.unit_price),
    remark: (req.body.remark || null) as string | null,
    entered_by: actor(req),
  });
  writeAudit({ actor_id: actor(req), action: "create_purchase", entity: "purchase_requisitions", entity_id: p.id });
  pushFlash(req, "success", "Purchase logged");
  res.redirect("/purchases");
}

export function showEdit(req: Request, res: Response) {
  const p = Purchases.findById(Number(req.params.id));
  if (!p) return res.status(404).render("errors/404");
  res.render("purchases/edit", { purchase: p });
}

export function update(req: Request, res: Response) {
  const id = Number(req.params.id);
  const p = Purchases.findById(id);
  if (!p) return res.status(404).render("errors/404");
  Purchases.update(id, {
    purchase_date: (req.body.purchase_date || p.purchase_date).toString(),
    description: (req.body.description || p.description).toString(),
    unit: (req.body.unit || null) as string | null,
    qty: Number(req.body.qty || 0),
    unit_price: parseMajor(req.body.unit_price),
    remark: (req.body.remark || null) as string | null,
  });
  writeAudit({ actor_id: actor(req), action: "update_purchase", entity: "purchase_requisitions", entity_id: id });
  pushFlash(req, "success", "Purchase updated");
  res.redirect("/purchases");
}

export function remove(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Purchases.findById(id)) return res.status(404).render("errors/404");
  Purchases.remove(id);
  writeAudit({ actor_id: actor(req), action: "delete_purchase", entity: "purchase_requisitions", entity_id: id });
  pushFlash(req, "success", "Purchase removed");
  res.redirect("/purchases");
}
