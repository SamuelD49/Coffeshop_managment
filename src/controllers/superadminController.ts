import type { Request, Response } from "express";
import * as Shops from "../models/shops";
import { pushFlash } from "../lib/flash";

export function showLogin(req: Request, res: Response) {
  if (req.session.isSuperAdmin) {
    return res.redirect("/superadmin");
  }
  // Neutral mock shopName for head include
  res.render("superadmin/login", { shopName: "SaaS Admin", title: "SuperAdmin Login" });
}

export function submitLogin(req: Request, res: Response) {
  const { password } = req.body as Record<string, string>;
  const adminPass = process.env.SUPERADMIN_PASSWORD || "admin123";
  
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
