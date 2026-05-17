import { Router } from "express";
import * as Auth from "../controllers/authController";
import * as Signup from "../controllers/signupController";
import * as Dashboard from "../controllers/dashboardController";
import * as Settings from "../controllers/settingsController";
import * as Account from "../controllers/accountController";
import { requireAuth } from "../middleware/requireAuth";
import { requireOwner } from "../middleware/requireOwner";
import { employeesRouter } from "./employees";
import { menuRouter } from "./menu";
import { salesRouter } from "./sales";
import { purchasesRouter } from "./purchases";
import { pettyCashRouter } from "./pettyCash";
import { payrollRouter } from "./payroll";
import { reportsRouter } from "./reports";

export const router = Router();

// Signup — creates a new shop + first owner. Public.
router.get("/signup", Signup.showSignup);
router.post("/signup", Signup.signup);

// Auth
router.get("/login", Auth.showLogin);
router.post("/login", Auth.submitLogin);
router.post("/logout", Auth.logout);

// Legacy /setup redirects to /signup so old links don't 404.
router.get("/setup", (_req, res) => res.redirect("/signup"));
router.post("/setup", (_req, res) => res.redirect("/signup"));

// Dashboard
router.get("/", requireAuth, Dashboard.show);

// Account (any logged-in user)
router.get("/account", requireAuth, Account.show);
router.post("/account/password", requireAuth, Account.changePassword);

// Settings (owner only)
router.get("/settings", requireAuth, requireOwner, Settings.show);
router.post("/settings/backup",            requireAuth, requireOwner, Settings.backupNow);
router.get("/settings/backup/:name",       requireAuth, requireOwner, Settings.downloadBackup);
router.post("/settings/signature",         requireAuth, requireOwner, Settings.saveSignature);
router.post("/settings", requireAuth, requireOwner, Settings.update);

router.use("/employees", employeesRouter);
router.use("/menu", menuRouter);
router.use("/sales", salesRouter);
router.use("/purchases", purchasesRouter);
router.use("/petty-cash", pettyCashRouter);
router.use("/payroll", payrollRouter);
router.use("/reports", reportsRouter);
