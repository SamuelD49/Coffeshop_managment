import { Router } from "express";
import * as Ctrl from "../controllers/reportsController";
import { requireAuth } from "../middleware/requireAuth";
import { requireOwner } from "../middleware/requireOwner";

export const reportsRouter = Router();
reportsRouter.use(requireAuth, requireOwner);

reportsRouter.get("/",          Ctrl.show);
reportsRouter.get("/export",    Ctrl.exportCsv);
reportsRouter.get("/print",     Ctrl.print);
