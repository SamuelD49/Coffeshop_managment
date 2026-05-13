import { Router } from "express";
import * as Ctrl from "../controllers/purchasesController";
import { requireAuth } from "../middleware/requireAuth";
import { requireOwner } from "../middleware/requireOwner";

export const purchasesRouter = Router();
purchasesRouter.use(requireAuth, requireOwner);

purchasesRouter.get("/",            Ctrl.list);
purchasesRouter.post("/",           Ctrl.create);
purchasesRouter.get("/:id/edit",    Ctrl.showEdit);
purchasesRouter.post("/:id",        Ctrl.update);
purchasesRouter.post("/:id/delete", Ctrl.remove);
