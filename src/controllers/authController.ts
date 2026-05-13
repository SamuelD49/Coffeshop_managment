import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import * as Employees from "../models/employees";
import { writeAudit } from "../lib/audit";
import { pushFlash } from "../lib/flash";

export function showLogin(req: Request, res: Response) {
  if (req.session.employeeId) return res.redirect("/");
  res.render("login");
}

export async function submitLogin(req: Request, res: Response) {
  const { username, password } = req.body as Record<string, string>;
  const user = username ? Employees.findByUsername(username) : null;
  if (!user || !user.password_hash) {
    pushFlash(req, "error", "Invalid username or password");
    return res.redirect("/login");
  }
  const ok = await bcrypt.compare(password ?? "", user.password_hash);
  if (!ok) {
    pushFlash(req, "error", "Invalid username or password");
    return res.redirect("/login");
  }
  req.session.employeeId = user.id;
  req.session.role = user.role;
  writeAudit({ actor_id: user.id, action: "login", entity: "session", entity_id: null });
  res.redirect("/");
}

export function logout(req: Request, res: Response) {
  const id = req.session.employeeId ?? null;
  req.session.destroy(() => {
    if (id) writeAudit({ actor_id: id, action: "logout", entity: "session", entity_id: null });
    res.redirect("/login");
  });
}
