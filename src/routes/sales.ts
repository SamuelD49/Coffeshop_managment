import { Router } from "express";
import * as Ctrl from "../controllers/salesController";
import { requireAuth } from "../middleware/requireAuth";

export const salesRouter = Router();
salesRouter.use(requireAuth);

salesRouter.get("/",            Ctrl.list);
salesRouter.get("/new",         Ctrl.showNew);
salesRouter.post("/",           Ctrl.create);
salesRouter.get("/:id",         Ctrl.entry);

// HTMX endpoints
salesRouter.post("/:id/lines/:menuItemId", Ctrl.upsertLine);
salesRouter.post("/:id/header",            Ctrl.updateHeader);

salesRouter.post("/:id/close",  Ctrl.close);
salesRouter.post("/:id/reopen", Ctrl.reopen);
