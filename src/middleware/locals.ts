import type { Request, Response, NextFunction } from "express";
import * as Settings from "../models/settings";
import * as Employees from "../models/employees";

export function localsMiddleware(req: Request, res: Response, next: NextFunction) {
  res.locals.shopName = Settings.get("shop_name") ?? "Coffee Shop";
  res.locals.currentUser = null;
  res.locals.currentRole = null;
  if (req.session.employeeId) {
    const u = Employees.findById(req.session.employeeId);
    if (u) {
      res.locals.currentUser = u;
      res.locals.currentRole = u.role;
    }
  }
  res.locals.currentPath = req.path;
  next();
}
