import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import * as Employees from "../models/employees";
import * as Settings from "../models/settings";
import { writeAudit } from "../lib/audit";
import { pushFlash } from "../lib/flash";

export async function showForm(req: Request, res: Response) {
  if ((await Employees.count()) > 0) return res.redirect("/");
  res.render("setup");
}

export async function submit(req: Request, res: Response) {
  if ((await Employees.count()) > 0) return res.redirect("/");
  const { shop_name, full_name, username, password } = req.body as Record<string, string>;
  const trimmedShop = (shop_name ?? "").toString().trim();
  if (!trimmedShop || !full_name || !username || !password || password.length < 6) {
    pushFlash(req, "error", "All fields required, password ≥ 6 chars");
    return res.redirect("/setup");
  }
  await Settings.set("shop_name", trimmedShop);
  const hash = await bcrypt.hash(password, 12);
  const owner = await Employees.create({
    full_name,
    username,
    password_hash: hash,
    role: "owner",
  });
  await writeAudit({ actor_id: owner.id, action: "setup_owner", entity: "employees", entity_id: owner.id });
  req.session.employeeId = owner.id;
  req.session.role = "owner";
  pushFlash(req, "success", `${trimmedShop} is ready`);
  res.redirect("/");
}
