import type { Request, Response } from "express";
import * as Shops from "../models/shops";
import { pushFlash } from "../lib/flash";
import { getDb } from "../lib/kysely";
import bcrypt from "bcrypt";

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

  // 8. Find owner details
  const owner = await db.selectFrom("employees")
    .select(["id", "full_name", "username"])
    .where("shop_id", "=", shopId)
    .where("role", "=", "owner")
    .executeTakeFirst();

  res.render("superadmin/shopDetails", {
    shop,
    shopName: "SaaS Admin",
    title: `${shop.name} Analytics`,
    owner: owner || null,
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

export async function impersonate(req: Request, res: Response) {
  const shopId = Number(req.params.id);
  const shop = await Shops.findById(shopId);
  if (!shop) {
    pushFlash(req, "error", "Shop not found");
    return res.redirect("/superadmin");
  }

  const db = getDb();
  const owner = await db.selectFrom("employees")
    .select(["id"])
    .where("shop_id", "=", shopId)
    .where("role", "=", "owner")
    .executeTakeFirst();

  if (!owner) {
    pushFlash(req, "error", "This shop has no registered owner to impersonate.");
    return res.redirect(`/superadmin/shops/${shopId}`);
  }

  // Set the session fields for this shop owner
  req.session.shopId = shopId;
  req.session.employeeId = owner.id;
  req.session.role = "owner";
  
  pushFlash(req, "success", `Now impersonating owner of "${shop.name}".`);
  res.redirect("/");
}

export function exitImpersonation(req: Request, res: Response) {
  if (!req.session.isSuperAdmin) {
    pushFlash(req, "error", "Unauthorized exit call.");
    return res.redirect("/login");
  }

  // Clear owner context but preserve isSuperAdmin status
  delete req.session.shopId;
  delete req.session.employeeId;
  delete req.session.role;

  pushFlash(req, "info", "Exited impersonation control panel.");
  res.redirect("/superadmin");
}

export async function resetCredentials(req: Request, res: Response) {
  const shopId = Number(req.params.id);
  const { username, password } = req.body as Record<string, string>;

  const shop = await Shops.findById(shopId);
  if (!shop) {
    pushFlash(req, "error", "Shop not found");
    return res.redirect("/superadmin");
  }

  if (!username || username.trim().length < 3) {
    pushFlash(req, "error", "Username must be at least 3 characters.");
    return res.redirect(`/superadmin/shops/${shopId}`);
  }

  const db = getDb();
  
  // Find owner first
  const owner = await db.selectFrom("employees")
    .select(["id"])
    .where("shop_id", "=", shopId)
    .where("role", "=", "owner")
    .executeTakeFirst();

  if (!owner) {
    pushFlash(req, "error", "No owner account found to update.");
    return res.redirect(`/superadmin/shops/${shopId}`);
  }

  // Prepare updates
  const updates: Record<string, any> = {
    username: username.trim(),
    updated_at: new Date().toISOString().replace("T", " ").slice(0, 19)
  };

  if (password && password.trim().length > 0) {
    if (password.trim().length < 8) {
      pushFlash(req, "error", "Password must be at least 8 characters.");
      return res.redirect(`/superadmin/shops/${shopId}`);
    }
    updates.password_hash = await bcrypt.hash(password, 10);
  }

  await db.updateTable("employees")
    .set(updates)
    .where("id", "=", owner.id)
    .execute();

  pushFlash(req, "success", "Owner credentials updated successfully!");
  res.redirect(`/superadmin/shops/${shopId}`);
}
