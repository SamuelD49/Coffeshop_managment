import type { Request, Response, NextFunction } from "express";
import * as Settings from "../models/settings";
import * as Employees from "../models/employees";
import { runWithShop } from "../lib/shopContext";

export async function localsMiddleware(req: Request, res: Response, next: NextFunction) {
  res.locals.currentPath = req.path;
  res.locals.pageTitle = derivePageTitle(req.path);
  res.locals.currentUser = null;
  res.locals.currentRole = null;
  res.locals.shopId = req.session.shopId ?? null;

  if (!req.session.shopId || !req.session.employeeId) {
    // Unauthenticated request (login/signup pages). Use a neutral default
    // shop name; nothing else to load without a shop context.
    res.locals.shopName = "Coffee Shop";
    return next();
  }

  // Authenticated — load shop-specific data inside the shop's context.
  await runWithShop(req.session.shopId, async () => {
    res.locals.shopName = (await Settings.get("shop_name")) ?? "Coffee Shop";
    const u = await Employees.findById(req.session.employeeId!);
    if (u) {
      res.locals.currentUser = u;
      res.locals.currentRole = u.role;
    }
  });
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
