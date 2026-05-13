import type { Request, Response } from "express";
import { resolve } from "path";
import * as Employees from "../models/employees";
import * as Guarantors from "../models/guarantors";
import * as Attachments from "../models/attachments";
import * as PayrollEntries from "../models/payrollEntries";
import { calculateCompleteness } from "../lib/onboarding";
import { writeAudit } from "../lib/audit";
import { pushFlash } from "../lib/flash";
import { pathFor, storeFile, deleteFile } from "../lib/uploads";

function actor(req: Request): number | null { return req.session.employeeId ?? null; }

export function list(req: Request, res: Response) {
  const showInactive = req.query.show === "all";
  const rows = Employees.listAll({ activeOnly: !showInactive }).filter(e => e.role !== "owner");
  const withStatus = rows.map(e => ({
    employee: e,
    completeness: calculateCompleteness(e.id),
  }));
  res.render("employees/list", { employees: withStatus, showInactive });
}

export function showNew(_req: Request, res: Response) {
  res.render("employees/new");
}

export function create(req: Request, res: Response) {
  const { full_name, phone, role } = req.body as Record<string, string>;
  if (!full_name || full_name.trim() === "") {
    pushFlash(req, "error", "Full name is required");
    return res.redirect("/employees/new");
  }
  const safeRole: "owner" | "employee" = role === "owner" ? "owner" : "employee";
  const e = Employees.create({ full_name: full_name.trim(), phone: phone ?? null, role: safeRole });
  writeAudit({ actor_id: actor(req), action: "create_employee", entity: "employees", entity_id: e.id });
  pushFlash(req, "success", `${e.full_name} added — fill out the profile next.`);
  res.redirect(`/employees/${e.id}`);
}

export function profile(req: Request, res: Response) {
  const id = Number(req.params.id);
  const employee = Employees.findFull(id);
  if (!employee) return res.status(404).render("errors/404");
  const tab = (req.query.tab as string) || "personal";
  const guarantors = Guarantors.listForEmployee(id);
  const attachments = Attachments.findByOwner("employee", id);
  const completeness = calculateCompleteness(id);
  const guarantorAttachments: Record<number, ReturnType<typeof Attachments.findByOwner>> = {};
  for (const g of guarantors) {
    guarantorAttachments[g.id] = Attachments.findByOwner("guarantor", g.id);
  }
  const payrollHistory = PayrollEntries.listForEmployee(id);
  res.render("employees/profile", { employee, guarantors, attachments, guarantorAttachments, completeness, tab, payrollHistory });
}

function refreshOnboardingStatus(id: number) {
  const status = calculateCompleteness(id).complete ? "complete" : "incomplete";
  Employees.setOnboardingStatus(id, status);
}

export function updatePersonal(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Employees.findFull(id)) return res.status(404).render("errors/404");
  Employees.updatePersonal(id, {
    full_name: (req.body.full_name ?? "").toString().trim(),
    phone: (req.body.phone || null) as string | null,
    national_id_number: req.body.national_id_number || null,
    national_id_type: req.body.national_id_type || null,
    date_of_birth: req.body.date_of_birth || null,
    gender: req.body.gender || null,
    marital_status: req.body.marital_status || null,
    address: req.body.address || null,
    emergency_contact_name: req.body.emergency_contact_name || null,
    emergency_contact_phone: req.body.emergency_contact_phone || null,
    emergency_contact_relation: req.body.emergency_contact_relation || null,
  });
  refreshOnboardingStatus(id);
  writeAudit({ actor_id: actor(req), action: "update_employee_personal", entity: "employees", entity_id: id });
  pushFlash(req, "success", "Personal info saved");
  res.redirect(`/employees/${id}?tab=personal`);
}

export function updateEmployment(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Employees.findFull(id)) return res.status(404).render("errors/404");
  const basic = req.body.basic_salary?.toString() || "0";
  const cents = Math.round(Number(basic) * 100);
  Employees.updateEmployment(id, {
    position: req.body.position || null,
    hire_date: req.body.hire_date || null,
    termination_date: req.body.termination_date || null,
    basic_salary: Number.isFinite(cents) ? cents : 0,
    role: req.body.role === "owner" ? "owner" : "employee",
    is_active: req.body.is_active === "true",
    username: req.body.username || null,
  });
  refreshOnboardingStatus(id);
  writeAudit({ actor_id: actor(req), action: "update_employee_employment", entity: "employees", entity_id: id });
  pushFlash(req, "success", "Employment info saved");
  res.redirect(`/employees/${id}?tab=employment`);
}

const ALLOWED_EMP_KINDS = ["profile_photo", "id_front", "id_back", "contract", "other"] as const;
type EmpKind = typeof ALLOWED_EMP_KINDS[number];

export async function uploadDocument(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Employees.findFull(id)) return res.status(404).render("errors/404");
  if (!req.file) {
    pushFlash(req, "error", "No file uploaded");
    return res.redirect(`/employees/${id}?tab=documents`);
  }
  const kindRaw = (req.body.kind || "other") as EmpKind;
  const kind: EmpKind = (ALLOWED_EMP_KINDS as readonly string[]).includes(kindRaw) ? kindRaw : "other";

  // Replace previous of same kind (we only keep the latest per kind for required slots)
  if (kind !== "other") {
    const existing = Attachments.findOneByKind("employee", id, kind);
    if (existing) {
      await deleteFile("employee", id, existing.filename, null);
      Attachments.remove(existing.id);
    }
  }

  const stored = await storeFile("employee", id, req.file);
  Attachments.create({
    owner_type: "employee",
    owner_id: id,
    kind,
    filename: stored.filename,
    original_name: req.file.originalname,
    mime_type: stored.mime,
    size_bytes: stored.size,
    uploaded_by: actor(req),
  });
  refreshOnboardingStatus(id);
  writeAudit({ actor_id: actor(req), action: `upload_${kind}`, entity: "employees", entity_id: id });
  pushFlash(req, "success", "File uploaded");
  res.redirect(`/employees/${id}?tab=documents`);
}

export async function deleteDocument(req: Request, res: Response) {
  const id = Number(req.params.id);
  const attId = Number(req.params.attId);
  const att = Attachments.findById(attId);
  if (!att || att.owner_id !== id || att.owner_type !== "employee") return res.status(404).render("errors/404");
  await deleteFile("employee", id, att.filename, null);
  Attachments.remove(attId);
  refreshOnboardingStatus(id);
  writeAudit({ actor_id: actor(req), action: "delete_document", entity: "attachments", entity_id: attId });
  pushFlash(req, "success", "File removed");
  res.redirect(`/employees/${id}?tab=documents`);
}

export function addGuarantor(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Employees.findFull(id)) return res.status(404).render("errors/404");
  const g = Guarantors.create({
    employee_id: id,
    full_name: (req.body.full_name ?? "").toString().trim() || "Unnamed guarantor",
    phone: req.body.phone || null,
    address: req.body.address || null,
    relation_to_employee: req.body.relation_to_employee || null,
    national_id_number: req.body.national_id_number || null,
    national_id_type: req.body.national_id_type || null,
    occupation: req.body.occupation || null,
    workplace: req.body.workplace || null,
    notes: req.body.notes || null,
  });
  refreshOnboardingStatus(id);
  writeAudit({ actor_id: actor(req), action: "add_guarantor", entity: "guarantors", entity_id: g.id });
  pushFlash(req, "success", "Guarantor added");
  res.redirect(`/employees/${id}?tab=guarantors`);
}

export function updateGuarantor(req: Request, res: Response) {
  const id = Number(req.params.id);
  const gid = Number(req.params.gid);
  const g = Guarantors.findById(gid);
  if (!g || g.employee_id !== id) return res.status(404).render("errors/404");
  Guarantors.update(gid, {
    full_name: (req.body.full_name ?? g.full_name).toString().trim(),
    phone: req.body.phone || null,
    address: req.body.address || null,
    relation_to_employee: req.body.relation_to_employee || null,
    national_id_number: req.body.national_id_number || null,
    national_id_type: req.body.national_id_type || null,
    occupation: req.body.occupation || null,
    workplace: req.body.workplace || null,
    notes: req.body.notes || null,
  });
  writeAudit({ actor_id: actor(req), action: "update_guarantor", entity: "guarantors", entity_id: gid });
  pushFlash(req, "success", "Guarantor updated");
  res.redirect(`/employees/${id}?tab=guarantors`);
}

export async function removeGuarantor(req: Request, res: Response) {
  const id = Number(req.params.id);
  const gid = Number(req.params.gid);
  const g = Guarantors.findById(gid);
  if (!g || g.employee_id !== id) return res.status(404).render("errors/404");
  // delete guarantor files first
  const atts = Attachments.findByOwner("guarantor", gid);
  for (const a of atts) await deleteFile("guarantor", gid, a.filename, null);
  Attachments.removeByOwner("guarantor", gid);
  Guarantors.remove(gid);
  refreshOnboardingStatus(id);
  writeAudit({ actor_id: actor(req), action: "delete_guarantor", entity: "guarantors", entity_id: gid });
  pushFlash(req, "success", "Guarantor removed");
  res.redirect(`/employees/${id}?tab=guarantors`);
}

const ALLOWED_GUARANTOR_KINDS = ["id_front", "id_back", "guarantor_letter", "other"] as const;
type GKind = typeof ALLOWED_GUARANTOR_KINDS[number];

export async function uploadGuarantorDocument(req: Request, res: Response) {
  const id = Number(req.params.id);
  const gid = Number(req.params.gid);
  const g = Guarantors.findById(gid);
  if (!g || g.employee_id !== id) return res.status(404).render("errors/404");
  if (!req.file) {
    pushFlash(req, "error", "No file uploaded");
    return res.redirect(`/employees/${id}?tab=guarantors`);
  }
  const kindRaw = (req.body.kind || "other") as GKind;
  const kind: GKind = (ALLOWED_GUARANTOR_KINDS as readonly string[]).includes(kindRaw) ? kindRaw : "other";

  if (kind !== "other") {
    const existing = Attachments.findOneByKind("guarantor", gid, kind);
    if (existing) {
      await deleteFile("guarantor", gid, existing.filename, null);
      Attachments.remove(existing.id);
    }
  }

  const stored = await storeFile("guarantor", gid, req.file);
  Attachments.create({
    owner_type: "guarantor",
    owner_id: gid,
    kind,
    filename: stored.filename,
    original_name: req.file.originalname,
    mime_type: stored.mime,
    size_bytes: stored.size,
    uploaded_by: actor(req),
  });
  refreshOnboardingStatus(id);
  writeAudit({ actor_id: actor(req), action: `upload_guarantor_${kind}`, entity: "guarantors", entity_id: gid });
  pushFlash(req, "success", "File uploaded");
  res.redirect(`/employees/${id}?tab=guarantors`);
}

export async function deleteGuarantorDocument(req: Request, res: Response) {
  const id = Number(req.params.id);
  const gid = Number(req.params.gid);
  const attId = Number(req.params.attId);
  const att = Attachments.findById(attId);
  if (!att || att.owner_type !== "guarantor" || att.owner_id !== gid) return res.status(404).render("errors/404");
  const g = Guarantors.findById(gid);
  if (!g || g.employee_id !== id) return res.status(404).render("errors/404");
  await deleteFile("guarantor", gid, att.filename, null);
  Attachments.remove(attId);
  refreshOnboardingStatus(id);
  writeAudit({ actor_id: actor(req), action: "delete_guarantor_document", entity: "attachments", entity_id: attId });
  pushFlash(req, "success", "File removed");
  res.redirect(`/employees/${id}?tab=guarantors`);
}

// Auth-gated file serving: only owners can view files
export function serveEmployeeFile(req: Request, res: Response) {
  const id = Number(req.params.id);
  const filename = String(req.params.filename);
  if (!/^[\w\-.]+$/.test(filename)) return res.status(400).send("Invalid filename");
  const full = pathFor("employee", id, filename);
  res.sendFile(resolve(full));
}

export function serveGuarantorFile(req: Request, res: Response) {
  const id = Number(req.params.id);
  const gid = Number(req.params.gid);
  const filename = String(req.params.filename);
  if (!/^[\w\-.]+$/.test(filename)) return res.status(400).send("Invalid filename");
  const g = Guarantors.findById(gid);
  if (!g || g.employee_id !== id) return res.status(404).send("Not found");
  const full = pathFor("guarantor", gid, filename);
  res.sendFile(resolve(full));
}
