import type { Request, Response } from "express";
import * as Runs from "../models/payrollRuns";
import * as Entries from "../models/payrollEntries";
import * as Employees from "../models/employees";
import * as Settings from "../models/settings";
import { calculateCompleteness } from "../lib/onboarding";
import { sumColumn } from "../lib/payrollMath";
import { writeAudit } from "../lib/audit";
import { pushFlash } from "../lib/flash";

function actor(req: Request): number { return req.session.employeeId!; }

function parseMajor(v: unknown): number {
  const n = Number(String(v ?? "0"));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function list(_req: Request, res: Response) {
  const runs = Runs.listAll().map(r => {
    const entries = Entries.listForRun(r.id);
    return {
      ...r,
      month_name: MONTH_NAMES[r.month - 1] || `Month ${r.month}`,
      employee_count: entries.length,
      total_net: sumColumn(entries, "net_payment"),
    };
  });
  res.render("payroll/list", { runs });
}

export function showNew(_req: Request, res: Response) {
  const today = new Date();
  const defaultYear = today.getFullYear();
  const defaultMonth = today.getMonth() + 1; // 1..12

  // Eligibility: active employees, optionally filtered by completeness
  const requireComplete = Settings.getBool("require_complete_hr_before_payroll");
  const all = Employees.listAll({ activeOnly: true });
  const eligible: Array<{ id: number; full_name: string; complete: boolean; missing: string[] }> = [];
  for (const e of all) {
    const c = calculateCompleteness(e.id);
    if (requireComplete && !c.complete) continue;
    eligible.push({ id: e.id, full_name: e.full_name, complete: c.complete, missing: c.missing });
  }
  // Also surface incomplete ones for owner awareness
  const incomplete = requireComplete ? all
    .map(e => ({ e, c: calculateCompleteness(e.id) }))
    .filter(x => !x.c.complete)
    .map(x => ({ id: x.e.id, full_name: x.e.full_name, missing: x.c.missing })) : [];

  res.render("payroll/new", { defaultYear, defaultMonth, monthNames: MONTH_NAMES, eligible, incomplete, requireComplete });
}

export function create(req: Request, res: Response) {
  const year = Number(req.body.year);
  const month = Number(req.body.month);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    pushFlash(req, "error", "Pick a valid year and month");
    return res.redirect("/payroll/new");
  }
  if (Runs.findByYearMonth(year, month)) {
    pushFlash(req, "error", "A payroll run for that month already exists");
    return res.redirect("/payroll/new");
  }

  const run = Runs.create({ year, month, prepared_by: actor(req) });
  writeAudit({ actor_id: actor(req), action: "create_payroll_run", entity: "payroll_runs", entity_id: run.id });

  // Auto-populate entries for active employees
  const requireComplete = Settings.getBool("require_complete_hr_before_payroll");
  const stdDays = Settings.getNumber("standard_days_in_month");
  const pePct = Settings.getNumber("pension_employer_default_pct");
  const pnPct = Settings.getNumber("pension_employee_default_pct");

  const employees = Employees.listAll({ activeOnly: true });
  for (const e of employees) {
    if (requireComplete && !calculateCompleteness(e.id).complete) continue;
    Entries.createFromEmployee({
      run_id: run.id,
      employee_id: e.id,
      basic_salary: e.basic_salary,
      days_worked: stdDays,
      standard_days_in_month: stdDays,
      pension_employer_pct: pePct,
      pension_employee_pct: pnPct,
    });
  }
  pushFlash(req, "success", `${MONTH_NAMES[month - 1]} ${year} payroll created`);
  res.redirect(`/payroll/${run.id}`);
}

export function run(req: Request, res: Response) {
  const id = Number(req.params.id);
  const r = Runs.findById(id);
  if (!r) return res.status(404).render("errors/404");
  const entries = Entries.listForRun(id);
  const totals = {
    gross_salary: sumColumn(entries, "gross_salary"),
    pension_employer_amount: sumColumn(entries, "pension_employer_amount"),
    pension_employee_amount: sumColumn(entries, "pension_employee_amount"),
    income_tax: sumColumn(entries, "income_tax"),
    advance_salary: sumColumn(entries, "advance_salary"),
    total_deduction: sumColumn(entries, "total_deduction"),
    net_payment: sumColumn(entries, "net_payment"),
  };
  const month_name = MONTH_NAMES[r.month - 1];
  const stdDays = Settings.getNumber("standard_days_in_month");
  res.render("payroll/run", { run: r, entries, totals, month_name, stdDays, locked: r.status === "approved" });
}

export function updateEntry(req: Request, res: Response) {
  const runId = Number(req.params.id);
  const entryId = Number(req.params.entryId);
  const r = Runs.findById(runId);
  if (!r) return res.status(404).render("errors/404");
  if (r.status === "approved") {
    pushFlash(req, "error", "This run is approved and locked");
    return res.redirect(`/payroll/${runId}`);
  }
  const entry = Entries.findById(entryId);
  if (!entry || entry.payroll_run_id !== runId) return res.status(404).render("errors/404");

  const stdDays = Settings.getNumber("standard_days_in_month");
  Entries.update(entryId, {
    days_worked: Number(req.body.days_worked || 0),
    income_tax: parseMajor(req.body.income_tax),
    advance_salary: parseMajor(req.body.advance_salary),
    standard_days_in_month: stdDays,
  });
  writeAudit({ actor_id: actor(req), action: "update_payroll_entry", entity: "payroll_entries", entity_id: entryId });
  pushFlash(req, "success", "Entry updated");
  res.redirect(`/payroll/${runId}`);
}

export function approve(req: Request, res: Response) {
  const id = Number(req.params.id);
  const r = Runs.findById(id);
  if (!r) return res.status(404).render("errors/404");
  Runs.approve(id, actor(req));
  writeAudit({ actor_id: actor(req), action: "approve_payroll_run", entity: "payroll_runs", entity_id: id });
  pushFlash(req, "success", "Payroll approved and locked");
  res.redirect(`/payroll/${id}`);
}

export function revert(req: Request, res: Response) {
  const id = Number(req.params.id);
  const r = Runs.findById(id);
  if (!r) return res.status(404).render("errors/404");
  Runs.revert(id);
  writeAudit({ actor_id: actor(req), action: "revert_payroll_run", entity: "payroll_runs", entity_id: id });
  pushFlash(req, "success", "Payroll reopened for edits");
  res.redirect(`/payroll/${id}`);
}

export function remove(req: Request, res: Response) {
  const id = Number(req.params.id);
  const r = Runs.findById(id);
  if (!r) return res.status(404).render("errors/404");
  const label = `${r.year}-${String(r.month).padStart(2, "0")}`;
  Runs.remove(id);
  writeAudit({ actor_id: actor(req), action: "delete_payroll_run", entity: "payroll_runs", entity_id: id });
  pushFlash(req, "success", `Payroll for ${label} deleted`);
  res.redirect("/payroll");
}

export function print(req: Request, res: Response) {
  const id = Number(req.params.id);
  const r = Runs.findById(id);
  if (!r) return res.status(404).render("errors/404");
  const entries = Entries.listForRun(id);
  const totals = {
    gross_salary: sumColumn(entries, "gross_salary"),
    pension_employer_amount: sumColumn(entries, "pension_employer_amount"),
    pension_employee_amount: sumColumn(entries, "pension_employee_amount"),
    income_tax: sumColumn(entries, "income_tax"),
    advance_salary: sumColumn(entries, "advance_salary"),
    total_deduction: sumColumn(entries, "total_deduction"),
    net_payment: sumColumn(entries, "net_payment"),
  };
  const preparer = r.prepared_by ? Employees.findById(r.prepared_by) : null;
  const approver = r.approved_by ? Employees.findById(r.approved_by) : null;
  const month_name = MONTH_NAMES[r.month - 1];
  const shopName = Settings.get("shop_name") ?? "Coffee Shop";
  const signature = Settings.get("shop_signature") || "";
  res.render("payroll/print", { run: r, entries, totals, month_name, preparer, approver, shopName, signature });
}
