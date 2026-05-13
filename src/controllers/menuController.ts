import type { Request, Response } from "express";
import * as Menu from "../models/menuItems";
import { writeAudit } from "../lib/audit";
import { pushFlash } from "../lib/flash";

function actor(req: Request): number | null { return req.session.employeeId ?? null; }

function parsePriceMajor(input: unknown): number {
  const n = Number(String(input ?? "0"));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function list(_req: Request, res: Response) {
  const items = Menu.listAll();
  res.render("menu/list", { items });
}

export function showNew(_req: Request, res: Response) {
  res.render("menu/new");
}

export function create(req: Request, res: Response) {
  const name = (req.body.name ?? "").toString().trim();
  if (!name) {
    pushFlash(req, "error", "Name is required");
    return res.redirect("/menu/new");
  }
  const price = parsePriceMajor(req.body.price);
  const m = Menu.create({ name, price });
  writeAudit({ actor_id: actor(req), action: "create_menu_item", entity: "menu_items", entity_id: m.id });
  pushFlash(req, "success", `${m.name} added to menu`);
  res.redirect("/menu");
}

export function showEdit(req: Request, res: Response) {
  const item = Menu.findById(Number(req.params.id));
  if (!item) return res.status(404).render("errors/404");
  res.render("menu/edit", { item });
}

export function update(req: Request, res: Response) {
  const id = Number(req.params.id);
  const item = Menu.findById(id);
  if (!item) return res.status(404).render("errors/404");
  const name = (req.body.name ?? item.name).toString().trim() || item.name;
  Menu.update(id, {
    name,
    price: parsePriceMajor(req.body.price),
  });
  writeAudit({ actor_id: actor(req), action: "update_menu_item", entity: "menu_items", entity_id: id });
  pushFlash(req, "success", `${name} updated`);
  res.redirect("/menu");
}

export function toggleActive(req: Request, res: Response) {
  const id = Number(req.params.id);
  const item = Menu.findById(id);
  if (!item) return res.status(404).render("errors/404");
  const next = !item.is_active;
  Menu.setActive(id, next);
  writeAudit({ actor_id: actor(req), action: next ? "activate_menu_item" : "deactivate_menu_item", entity: "menu_items", entity_id: id });
  pushFlash(req, "success", `${item.name} ${next ? "activated" : "deactivated"}`);
  res.redirect("/menu");
}
