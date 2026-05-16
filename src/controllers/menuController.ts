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

// Curated palette — exported so views can render the picker from the same list.
export const TOKEN_PALETTE = [
  "#C75D34", // ember
  "#5C7558", // leaf
  "#B68A3C", // clay
  "#8B2A26", // crimson
  "#3E2A1F", // bean
  "#9E4524", // ember-deep
  "#7A6E62", // smoke
] as const;

function parseTokenColor(input: unknown): string | null {
  const v = (input ?? "").toString().trim();
  if (v === "") return null; // "auto" — server falls back to deterministic palette
  if ((TOKEN_PALETTE as readonly string[]).includes(v)) return v;
  // Accept any well-formed #RRGGBB hex chosen via the custom color picker.
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : null;
}

export function list(_req: Request, res: Response) {
  const items = Menu.listAll();
  res.render("menu/list", { items, palette: TOKEN_PALETTE });
}

export function showNew(_req: Request, res: Response) {
  res.render("menu/new", { palette: TOKEN_PALETTE });
}

export async function create(req: Request, res: Response) {
  const name = (req.body.name ?? "").toString().trim();
  if (!name) {
    pushFlash(req, "error", "Name is required");
    return res.redirect("/menu/new");
  }
  const price = parsePriceMajor(req.body.price);
  const token_color = parseTokenColor(req.body.token_color);
  const m = Menu.create({ name, price, token_color });
  await writeAudit({ actor_id: actor(req), action: "create_menu_item", entity: "menu_items", entity_id: m.id });
  pushFlash(req, "success", `${m.name} added to menu`);
  res.redirect("/menu");
}

export function showEdit(req: Request, res: Response) {
  const item = Menu.findById(Number(req.params.id));
  if (!item) return res.status(404).render("errors/404");
  res.render("menu/edit", { item, palette: TOKEN_PALETTE });
}

export async function update(req: Request, res: Response) {
  const id = Number(req.params.id);
  const item = Menu.findById(id);
  if (!item) return res.status(404).render("errors/404");
  const name = (req.body.name ?? item.name).toString().trim() || item.name;
  Menu.update(id, {
    name,
    price: parsePriceMajor(req.body.price),
    token_color: parseTokenColor(req.body.token_color),
  });
  await writeAudit({ actor_id: actor(req), action: "update_menu_item", entity: "menu_items", entity_id: id });
  pushFlash(req, "success", `${name} updated`);
  res.redirect("/menu");
}

export async function toggleActive(req: Request, res: Response) {
  const id = Number(req.params.id);
  const item = Menu.findById(id);
  if (!item) return res.status(404).render("errors/404");
  const next = !item.is_active;
  Menu.setActive(id, next);
  await writeAudit({ actor_id: actor(req), action: next ? "activate_menu_item" : "deactivate_menu_item", entity: "menu_items", entity_id: id });
  pushFlash(req, "success", res.locals.t(next ? "flash.menu.activated" : "flash.menu.deactivated", { name: item.name }));
  res.redirect("/menu");
}
