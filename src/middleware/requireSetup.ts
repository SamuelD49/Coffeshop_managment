import type { Request, Response, NextFunction } from "express";
import * as Employees from "../models/employees";

export function requireSetup(req: Request, res: Response, next: NextFunction) {
  // Allow /setup itself and static assets
  if (req.path.startsWith("/setup") || req.path.startsWith("/css") || req.path.startsWith("/js")) {
    return next();
  }
  if (Employees.count() === 0) {
    return res.redirect("/setup");
  }
  next();
}
