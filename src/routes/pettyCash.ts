import { Router } from "express";
import * as Ctrl from "../controllers/pettyCashController";
import { requireAuth } from "../middleware/requireAuth";
import { requireOwner } from "../middleware/requireOwner";

export const pettyCashRouter = Router();
pettyCashRouter.use(requireAuth, requireOwner);

pettyCashRouter.get("/",            Ctrl.list);
pettyCashRouter.post("/",           Ctrl.create);
pettyCashRouter.get("/:id/edit",    Ctrl.showEdit);
pettyCashRouter.post("/:id",        Ctrl.update);
pettyCashRouter.post("/:id/delete", Ctrl.remove);
