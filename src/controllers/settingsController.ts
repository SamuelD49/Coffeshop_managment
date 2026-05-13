import type { Request, Response } from "express";
import * as Settings from "../models/settings";
import { writeAudit } from "../lib/audit";
import { pushFlash } from "../lib/flash";

const ALLOWED_KEYS = [
  "shop_name", "shop_address", "shop_phone",
  "currency_code", "currency_symbol", "decimal_places", "thousand_separator", "decimal_separator",
  "pension_employer_default_pct", "pension_employee_default_pct", "standard_days_in_month",
  "business_day_cutoff", "timezone",
] as const;

export function show(_req: Request, res: Response) {
  res.render("settings/index", { settings: Settings.getAll() });
}

export function update(req: Request, res: Response) {
  for (const key of ALLOWED_KEYS) {
    if (typeof req.body[key] === "string") Settings.set(key, req.body[key]);
  }
  // Checkbox: present means "true", absent means "false"
  Settings.set("require_complete_hr_before_payroll", req.body.require_complete_hr_before_payroll === "true" ? "true" : "false");
  writeAudit({ actor_id: req.session.employeeId ?? null, action: "update_settings", entity: "settings", entity_id: null });
  pushFlash(req, "success", "Settings saved");
  res.redirect("/settings");
}
