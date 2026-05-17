import type { Request, Response } from "express";
import * as Shops from "../models/shops";
import { pushFlash } from "../lib/flash";
import { getDb } from "../lib/kysely";

export function showLogin(req: Request, res: Response) {
  if (req.session.isSuperAdmin) {
    return res.redirect("/superadmin");
  }
  // Neutral mock shopName for head include
  res.render("superadmin/login", { shopName: "SaaS Admin", title: "SuperAdmin Login" });
}

export function submitLogin(req: Request, res: Response) {
  const { password } = req.body as Record<string, string>;
  const adminPass = process.env.SUPERADMIN_PASSWORD;
  
  if (!adminPass) {
    pushFlash(req, "error", "SuperAdmin access is not configured on the server.");
    return res.redirect("/superadmin/login");
  }

  if (password === adminPass) {
    req.session.isSuperAdmin = true;
    pushFlash(req, "success", "Welcome, SaaS Super Admin!");
    return res.redirect("/superadmin");
  } else {
    pushFlash(req, "error", "Invalid SuperAdmin password");
    return res.redirect("/superadmin/login");
  }
}

export function logout(req: Request, res: Response) {
  req.session.isSuperAdmin = false;
  pushFlash(req, "success", "Logged out from SuperAdmin");
  res.redirect("/superadmin/login");
}

export async function dashboard(req: Request, res: Response) {
  const allShops = await Shops.listAll();
  res.render("superadmin/dashboard", { 
    shops: allShops, 
    shopName: "SaaS Admin", 
    title: "SaaS Control Center" 
  });
}

export async function toggleShop(req: Request, res: Response) {
  const shopId = Number(req.params.id);
  const { active } = req.body as { active?: string };
  const nextActive = active === "true";
  
  const shop = await Shops.findById(shopId);
  if (!shop) {
    pushFlash(req, "error", "Shop not found");
    return res.redirect("/superadmin");
  }
  
  await Shops.setActive(shopId, nextActive);
  pushFlash(req, "success", `Shop "${shop.name}" has been ${nextActive ? "activated" : "suspended"}!`);
  res.redirect("/superadmin");
}

export async function shopDetails(req: Request, res: Response) {
  const shopId = Number(req.params.id);
  const shop = await Shops.findById(shopId);
  if (!shop) {
    pushFlash(req, "error", "Shop not found");
    return res.redirect("/superadmin");
  }

  const db = getDb();
  
  // 1. Employees count
  const employeeCountRow = await db.selectFrom("employees")
    .select((eb) => eb.fn.count<number>("id").as("count"))
    .where("shop_id", "=", shopId)
    .executeTakeFirst();
  const employeeCount = Number(employeeCountRow?.count || 0);

  // 2. Menu items count
  const menuItemCountRow = await db.selectFrom("menu_items")
    .select((eb) => eb.fn.count<number>("id").as("count"))
    .where("shop_id", "=", shopId)
    .executeTakeFirst();
  const menuItemCount = Number(menuItemCountRow?.count || 0);

  // 3. Sales sessions count
  const salesSessionCountRow = await db.selectFrom("sales_sessions")
    .select((eb) => eb.fn.count<number>("id").as("count"))
    .where("shop_id", "=", shopId)
    .executeTakeFirst();
  const salesSessionCount = Number(salesSessionCountRow?.count || 0);

  // 4. Total revenue
  const revenueRow = await db.selectFrom("sales_sessions")
    .select((eb) => [
      eb.fn.sum<number>("cash_amount").as("cash"),
      eb.fn.sum<number>("bank_transfer_amount").as("bank")
    ])
    .where("shop_id", "=", shopId)
    .executeTakeFirst();
  const totalRevenue = Number(revenueRow?.cash || 0) + Number(revenueRow?.bank || 0);

  // 5. Total expenses (petty cash)
  const expenseRow = await db.selectFrom("petty_cash_entries")
    .select((eb) => eb.fn.sum<number>("amount").as("total"))
    .where("shop_id", "=", shopId)
    .where("type", "=", "expense")
    .executeTakeFirst();
  const totalExpenses = Number(expenseRow?.total || 0);

  // 6. Recent audit logs
  const auditLogs = await db.selectFrom("audit_log as a")
    .leftJoin("employees as e", "e.id", "a.actor_id")
    .select(["a.id", "a.action", "a.entity", "a.entity_id", "a.at", "e.full_name as actor_name"])
    .where("a.shop_id", "=", shopId)
    .orderBy("a.at", "desc")
    .limit(10)
    .execute();

  // 7. Employee details list
  const employeesList = await db.selectFrom("employees")
    .select(["id", "full_name", "position", "basic_salary", "is_active"])
    .where("shop_id", "=", shopId)
    .orderBy("is_active", "desc")
    .orderBy("id", "asc")
    .execute();

  res.render("superadmin/shopDetails", {
    shop,
    shopName: "SaaS Admin",
    title: `${shop.name} Analytics`,
    analytics: {
      employeeCount,
      menuItemCount,
      salesSessionCount,
      totalRevenue,
      totalExpenses,
      auditLogs,
      employeesList
    }
  });
}
