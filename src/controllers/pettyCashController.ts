import type { Request, Response } from "express";
import * as Petty from "../models/pettyCash";
import * as Settings from "../models/settings";
import { writeAudit } from "../lib/audit";
import { pushFlash } from "../lib/flash";
import { todayBusinessDate } from "../lib/dates";

function actor(req: Request): number | null { return req.session.employeeId ?? null; }

function parseMajor(v: unknown): number {
  const n = Number(String(v ?? "0"));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function todayDate(): string {
  return todayBusinessDate(Settings.get("business_day_cutoff") ?? "00:00", Settings.get("timezone") ?? "Africa/Addis_Ababa");
}

function safeType(input: unknown): Petty.PettyType {
  return input === "expense" || input === "refund" || input === "replenishment" ? input : "expense";
}

export function list(req: Request, res: Response) {
  const filters: { from?: string; to?: string } = {};
  if (req.query.from) filters.from = String(req.query.from);
  if (req.query.to)   filters.to   = String(req.query.to);
  const entries = Petty.listWithBalance(filters);
  const balance = Petty.currentBalance();
  res.render("petty-cash/list", { entries, balance, filters, today: todayDate() });
}

export function create(req: Request, res: Response) {
  const description = (req.body.description ?? "").toString().trim();
  if (!description) {
    pushFlash(req, "error", "Description is required");
    return res.redirect("/petty-cash");
  }
  const e = Petty.create({
    entry_date: (req.body.entry_date ?? todayDate()).toString(),
    description,
    payer_name: (req.body.payer_name || null) as string | null,
    amount: parseMajor(req.body.amount),
    type: safeType(req.body.type),
    remark: (req.body.remark || null) as string | null,
    entered_by: actor(req),
  });
  writeAudit({ actor_id: actor(req), action: "create_petty_cash", entity: "petty_cash_entries", entity_id: e.id });
  pushFlash(req, "success", "Petty cash entry logged");
  res.redirect("/petty-cash");
}

export function showEdit(req: Request, res: Response) {
  const e = Petty.findById(Number(req.params.id));
  if (!e) return res.status(404).render("errors/404");
  res.render("petty-cash/edit", { entry: e });
}

export function update(req: Request, res: Response) {
  const id = Number(req.params.id);
  const e = Petty.findById(id);
  if (!e) return res.status(404).render("errors/404");
  Petty.update(id, {
    entry_date: (req.body.entry_date || e.entry_date).toString(),
    description: (req.body.description || e.description).toString(),
    payer_name: (req.body.payer_name || null) as string | null,
    amount: parseMajor(req.body.amount),
    type: safeType(req.body.type),
    remark: (req.body.remark || null) as string | null,
  });
  writeAudit({ actor_id: actor(req), action: "update_petty_cash", entity: "petty_cash_entries", entity_id: id });
  pushFlash(req, "success", "Entry updated");
  res.redirect("/petty-cash");
}

export function remove(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Petty.findById(id)) return res.status(404).render("errors/404");
  Petty.remove(id);
  writeAudit({ actor_id: actor(req), action: "delete_petty_cash", entity: "petty_cash_entries", entity_id: id });
  pushFlash(req, "success", "Entry removed");
  res.redirect("/petty-cash");
}
