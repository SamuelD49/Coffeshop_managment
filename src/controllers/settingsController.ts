import type { Request, Response } from "express";
import { join, resolve } from "path";
import * as Settings from "../models/settings";
import { writeAudit } from "../lib/audit";
import { pushFlash } from "../lib/flash";
import { runBackup, listBackups, backupDirPath } from "../lib/backup";

const ALLOWED_KEYS = [
  "shop_name", "shop_address", "shop_phone",
  "currency_code", "currency_symbol", "decimal_places", "thousand_separator", "decimal_separator",
  "pension_employer_default_pct", "pension_employee_default_pct", "standard_days_in_month",
  "business_day_cutoff", "timezone",
] as const;

export function show(_req: Request, res: Response) {
  const settings = Settings.getAll();
  const backups = listBackups();
  const backupDir = backupDirPath();
  res.render("settings/index", { settings, backups, backupDir });
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

export async function backupNow(_req: Request, res: Response) {
  try {
    await runBackup();
    pushFlash(_req as any, "success", "Backup created");
  } catch (err) {
    pushFlash(_req as any, "error", "Backup failed");
  }
  res.redirect("/settings");
}

export function downloadBackup(req: Request, res: Response) {
  const name = String(req.params.name || "");
  if (!/^shop-[\w-]+\.db$/.test(name)) return res.status(400).send("Invalid name");
  const path = resolve(join(backupDirPath(), name));
  res.download(path);
}

// Signature pad in Settings: accepts a single data URL (PNG) and stores it
// under the `shop_signature` key. Empty string clears the signature.
// Validates the data URL shape and a sane size ceiling so a malformed POST
// can't fill the settings row with garbage.
const MAX_SIG_BYTES = 200 * 1024; // 200 KB base64 ≈ 150 KB PNG, way more than enough
const SIG_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

export function saveSignature(req: Request, res: Response) {
  const raw = (req.body.signature_data_url ?? "").toString();
  if (raw === "") {
    Settings.set("shop_signature", "");
    writeAudit({ actor_id: req.session.employeeId ?? null, action: "clear_shop_signature", entity: "settings", entity_id: null });
    pushFlash(req, "success", "Signature cleared");
    return res.redirect("/settings");
  }
  if (raw.length > MAX_SIG_BYTES || !SIG_RE.test(raw)) {
    pushFlash(req, "error", "Could not save signature — invalid or too large");
    return res.redirect("/settings");
  }
  Settings.set("shop_signature", raw);
  writeAudit({ actor_id: req.session.employeeId ?? null, action: "update_shop_signature", entity: "settings", entity_id: null });
  pushFlash(req, "success", "Signature saved");
  res.redirect("/settings");
}
