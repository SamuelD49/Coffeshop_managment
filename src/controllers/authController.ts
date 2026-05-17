import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import * as Employees from "../models/employees";
import { writeAudit } from "../lib/audit";
import { pushFlash } from "../lib/flash";
import { runWithShop } from "../lib/shopContext";

export function showLogin(req: Request, res: Response) {
  if (req.session.employeeId) return res.redirect("/");
  res.render("login");
}

export async function submitLogin(req: Request, res: Response) {
  const { username, password } = req.body as Record<string, string>;
  // findByUsername reads globally (no shop filter) — we don't know the
  // shop yet. The matched row carries shop_id which we use below.
  const user = username ? await Employees.findByUsername(username) : null;
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
  req.session.shopId = user.shop_id;
  // Audit needs a shop context to write to the right shop's log.
  await runWithShop(user.shop_id, async () => {
    await writeAudit({ actor_id: user.id, action: "login", entity: "session", entity_id: null });
  });
  res.redirect("/");
}

export function logout(req: Request, res: Response) {
  const id = req.session.employeeId ?? null;
  const shopId = req.session.shopId ?? null;
  req.session.destroy(async () => {
    if (id && shopId) {
      await runWithShop(shopId, async () => {
        await writeAudit({ actor_id: id, action: "logout", entity: "session", entity_id: null });
      });
    }
    res.redirect("/login");
  });
}
