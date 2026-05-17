import { Router } from "express";
import * as Ctrl from "../controllers/menuController";
import { requireAuth } from "../middleware/requireAuth";
import { requireOwner } from "../middleware/requireOwner";

export const menuRouter = Router();
menuRouter.use(requireAuth, requireOwner);

menuRouter.get("/",            Ctrl.list);
menuRouter.get("/new",         Ctrl.showNew);
menuRouter.post("/",           Ctrl.create);
menuRouter.post("/bulk-delete", Ctrl.bulkDelete);
menuRouter.get("/:id/edit",    Ctrl.showEdit);
menuRouter.post("/:id",        Ctrl.update);
menuRouter.post("/:id/active", Ctrl.toggleActive);
menuRouter.post("/:id/delete", Ctrl.destroy);
