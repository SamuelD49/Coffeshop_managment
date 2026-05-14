import { Router } from "express";
import * as Ctrl from "../controllers/payrollController";
import { requireAuth } from "../middleware/requireAuth";
import { requireOwner } from "../middleware/requireOwner";

export const payrollRouter = Router();
payrollRouter.use(requireAuth, requireOwner);

payrollRouter.get("/",              Ctrl.list);
payrollRouter.get("/new",           Ctrl.showNew);
payrollRouter.post("/",             Ctrl.create);
payrollRouter.get("/:id",           Ctrl.run);
payrollRouter.post("/:id/entries/:entryId", Ctrl.updateEntry);
payrollRouter.post("/:id/approve",  Ctrl.approve);
payrollRouter.post("/:id/revert",   Ctrl.revert);
payrollRouter.post("/:id/delete",   Ctrl.remove);
payrollRouter.get("/:id/print",     Ctrl.print);
