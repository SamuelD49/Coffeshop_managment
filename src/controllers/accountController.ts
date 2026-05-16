import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import * as Employees from "../models/employees";
import { writeAudit } from "../lib/audit";
import { pushFlash } from "../lib/flash";

export function show(_req: Request, res: Response) {
  res.render("account");
}

export async function changePassword(req: Request, res: Response) {
  const id = req.session.employeeId!;
  const user = Employees.findById(id);
  if (!user || !user.password_hash) {
    pushFlash(req, "error", "Account not found");
    return res.redirect("/account");
  }
  const { current, next } = req.body as Record<string, string>;
  if (!next || next.length < 6) {
    pushFlash(req, "error", "New password must be at least 6 characters");
    return res.redirect("/account");
  }
  const ok = await bcrypt.compare(current ?? "", user.password_hash);
  if (!ok) {
    pushFlash(req, "error", "Current password is incorrect");
    return res.redirect("/account");
  }
  const newHash = await bcrypt.hash(next, 12);
  Employees.updatePassword(id, newHash);
  await writeAudit({ actor_id: id, action: "change_own_password", entity: "employees", entity_id: id });
  pushFlash(req, "success", "Password updated");
  res.redirect("/account");
}
