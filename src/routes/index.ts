import { Router } from "express";
import * as Auth from "../controllers/authController";
import * as Setup from "../controllers/setupController";
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

// Setup (only reachable when employees table is empty — enforced by requireSetup middleware)
router.get("/setup", Setup.showForm);
router.post("/setup", Setup.submit);

// Auth
router.get("/login", Auth.showLogin);
router.post("/login", Auth.submitLogin);
router.post("/logout", Auth.logout);

// Dashboard
router.get("/", requireAuth, Dashboard.show);

// Account (any logged-in user)
router.get("/account", requireAuth, Account.show);
router.post("/account/password", requireAuth, Account.changePassword);

// Settings (owner only)
router.get("/settings", requireAuth, requireOwner, Settings.show);
router.post("/settings/backup",            requireAuth, requireOwner, Settings.backupNow);
router.get("/settings/backup/:name",       requireAuth, requireOwner, Settings.downloadBackup);
router.post("/settings", requireAuth, requireOwner, Settings.update);

router.use("/employees", employeesRouter);
router.use("/menu", menuRouter);
router.use("/sales", salesRouter);
router.use("/purchases", purchasesRouter);
router.use("/petty-cash", pettyCashRouter);
router.use("/payroll", payrollRouter);
router.use("/reports", reportsRouter);
