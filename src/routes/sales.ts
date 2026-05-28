import { Router } from "express";
import * as Ctrl from "../controllers/salesController";
import { requireAuth } from "../middleware/requireAuth";

export const salesRouter = Router();
salesRouter.use(requireAuth);

salesRouter.get("/",            Ctrl.list);
salesRouter.get("/new",         Ctrl.showNew);
salesRouter.post("/",           Ctrl.create);

// Inline-entry endpoints: "today" resolves to the current user's open shift
// for today, lazily creating one on the first interaction.
salesRouter.post("/today/lines/:menuItemId", Ctrl.upsertLineToday);
salesRouter.post("/today/header",            Ctrl.updateHeaderToday);
salesRouter.post("/today/close",             Ctrl.closeToday);

salesRouter.get("/:id",         Ctrl.entry);

// HTMX endpoints for a specific session id
salesRouter.post("/:id/lines/:menuItemId", Ctrl.upsertLine);
salesRouter.post("/:id/header",            Ctrl.updateHeader);

salesRouter.post("/:id/close",  Ctrl.close);
salesRouter.post("/:id/reopen", Ctrl.reopen);
salesRouter.post("/:id/delete", Ctrl.remove);
