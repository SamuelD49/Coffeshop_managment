import type { Request, Response, NextFunction } from "express";
import * as Settings from "../models/settings";
import * as Employees from "../models/employees";
import * as Shops from "../models/shops";
import { runWithShop } from "../lib/shopContext";

export async function localsMiddleware(req: Request, res: Response, next: NextFunction) {
  res.locals.currentPath = req.path;
  res.locals.pageTitle = derivePageTitle(req.path);
  res.locals.currentUser = null;
  res.locals.currentRole = null;
  res.locals.shopId = req.session.shopId ?? null;
  res.locals.isSuperAdmin = !!req.session.isSuperAdmin;

  if (!req.session.shopId || !req.session.employeeId) {
    // Unauthenticated request (login/signup pages). Use a neutral default
    // shop name; nothing else to load without a shop context.
    res.locals.shopName = "Coffee Shop";
    return next();
  }

  // Authenticated — load shop-specific data inside the shop's context.
  // Settings.get + Employees.findById are independent; firing in parallel
  // saves one query RTT on every authenticated page nav.
  let isShopActive = true;
  await runWithShop(req.session.shopId, async () => {
    const [shopName, u, shop] = await Promise.all([
      Settings.get("shop_name"),
      Employees.findById(req.session.employeeId!),
      Shops.findById(req.session.shopId!),
    ]);
    res.locals.shopName = shopName ?? "Coffee Shop";
    if (u) {
      res.locals.currentUser = u;
      res.locals.currentRole = u.role;
    }
    if (!shop || !shop.is_active) {
      isShopActive = false;
    }
  });

  if (!isShopActive) {
    req.session.destroy(() => {
      res.redirect("/login?deactivated=1");
    });
    return;
  }

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
