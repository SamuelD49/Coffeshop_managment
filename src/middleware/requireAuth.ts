import type { Request, Response, NextFunction } from "express";
import { runWithShop } from "../lib/shopContext";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.employeeId || !req.session.shopId) {
    return void res.redirect("/login");
  }
  // Establish shop context for the rest of this request. Every downstream
  // model call sees this via currentShopId().
  runWithShop(req.session.shopId, () => next());
}
