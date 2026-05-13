import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import * as Employees from "../models/employees";
import { writeAudit } from "../lib/audit";
import { pushFlash } from "../lib/flash";

export function showForm(req: Request, res: Response) {
  if (Employees.count() > 0) return res.redirect("/");
  res.render("setup");
}

export async function submit(req: Request, res: Response) {
  if (Employees.count() > 0) return res.redirect("/");
  const { full_name, username, password } = req.body as Record<string, string>;
  if (!full_name || !username || !password || password.length < 6) {
    pushFlash(req, "error", "All fields required, password ≥ 6 chars");
    return res.redirect("/setup");
  }
  const hash = await bcrypt.hash(password, 12);
  const owner = Employees.create({
    full_name,
    username,
    password_hash: hash,
    role: "owner",
  });
  writeAudit({ actor_id: owner.id, action: "setup_owner", entity: "employees", entity_id: owner.id });
  req.session.employeeId = owner.id;
  req.session.role = "owner";
  pushFlash(req, "success", "Owner account created");
  res.redirect("/");
}
