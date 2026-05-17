import { Router } from "express";
import * as Ctrl from "../controllers/superadminController";

export const superadminRouter = Router();

function requireSuperAdmin(req: any, res: any, next: any) {
  if (!req.session.isSuperAdmin) {
    return res.redirect("/superadmin/login");
  }
  next();
}

superadminRouter.get("/login", Ctrl.showLogin);
superadminRouter.post("/login", Ctrl.submitLogin);
superadminRouter.post("/logout", Ctrl.logout);

superadminRouter.get("/", requireSuperAdmin, Ctrl.dashboard);
superadminRouter.get("/shops/:id", requireSuperAdmin, Ctrl.shopDetails);
superadminRouter.post("/shops/:id/toggle", requireSuperAdmin, Ctrl.toggleShop);
