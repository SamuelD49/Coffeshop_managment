import type { Request, Response, NextFunction } from "express";
import * as Settings from "../models/settings";
import * as Employees from "../models/employees";

export async function localsMiddleware(req: Request, res: Response, next: NextFunction) {
  res.locals.shopName = (await Settings.get("shop_name")) ?? "Coffee Shop";
  res.locals.currentUser = null;
  res.locals.currentRole = null;
  if (req.session.employeeId) {
    const u = await Employees.findById(req.session.employeeId);
    if (u) {
      res.locals.currentUser = u;
      res.locals.currentRole = u.role;
    }
  }
  res.locals.currentPath = req.path;
  res.locals.pageTitle = derivePageTitle(req.path);
  next();
}

function derivePageTitle(path: string): string {
  if (path === "/") return "Dashboard";
  const seg = path.split("/").filter(Boolean)[0] ?? "";
  const map: Record<string, string> = {
    sales: "Sales",
    menu: "Menu",
    employees: "Employees",
    purchases: "Purchases",
    "petty-cash": "Petty cash",
    payroll: "Payroll",
    reports: "Reports",
    settings: "Settings",
    account: "Account",
  };
  return map[seg] ?? "";
}
