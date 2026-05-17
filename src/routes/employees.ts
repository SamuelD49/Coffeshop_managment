import { Router } from "express";
import * as Ctrl from "../controllers/employeesController";
import { requireAuth } from "../middleware/requireAuth";
import { requireOwner } from "../middleware/requireOwner";
import { upload } from "../lib/uploads";
import { csrfMultipart } from "../lib/csrf";

export const employeesRouter = Router();

employeesRouter.use(requireAuth, requireOwner);

employeesRouter.get("/",        Ctrl.list);
employeesRouter.get("/new",     Ctrl.showNew);
employeesRouter.post("/",       Ctrl.create);
employeesRouter.get("/:id",     Ctrl.profile);

// Tab updates
employeesRouter.post("/:id/personal",   Ctrl.updatePersonal);
employeesRouter.post("/:id/employment", Ctrl.updateEmployment);

// Soft-delete toggle (activate / deactivate)
employeesRouter.post("/:id/active",     Ctrl.toggleActive);

// Documents (employee)
employeesRouter.post("/:id/documents",          upload.single("file"), csrfMultipart, Ctrl.uploadDocument);
employeesRouter.post("/:id/documents/:attId/delete", Ctrl.deleteDocument);

// Guarantors
employeesRouter.post("/:id/guarantors",                       Ctrl.addGuarantor);
employeesRouter.post("/:id/guarantors/:gid",                  Ctrl.updateGuarantor);
employeesRouter.post("/:id/guarantors/:gid/delete",           Ctrl.removeGuarantor);
employeesRouter.post("/:id/guarantors/:gid/documents",        upload.single("file"), csrfMultipart, Ctrl.uploadGuarantorDocument);
employeesRouter.post("/:id/guarantors/:gid/documents/:attId/delete", Ctrl.deleteGuarantorDocument);

// File serving (auth-gated)
employeesRouter.get("/:id/files/:filename",                 Ctrl.serveEmployeeFile);
employeesRouter.get("/:id/guarantors/:gid/files/:filename", Ctrl.serveGuarantorFile);
