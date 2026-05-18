import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import { getDb, nowIso } from "../lib/kysely";
import { runWithShop } from "../lib/shopContext";
import { writeAudit } from "../lib/audit";
import { pushFlash } from "../lib/flash";

// Server-side validation rules. HTML pattern attrs are bypassable; this
// is the only check that actually decides whether the row gets created.
const NAME_MIN = 2;
const NAME_MAX = 120;
const USERNAME_MIN = 3;
const USERNAME_MAX = 60;
const USERNAME_RE = /^[A-Za-z0-9_]+$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 256;

type ValidationResult =
  | { ok: true; shop_name: string; full_name: string; username: string; password: string }
  | { ok: false; error: string };

function validate(body: Record<string, unknown>): ValidationResult {
  const shop_name = String(body.shop_name ?? "").trim();
  const full_name = String(body.full_name ?? "").trim();
  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");

  if (shop_name.length < NAME_MIN) return { ok: false, error: "Shop name is required" };
  if (shop_name.length > NAME_MAX) return { ok: false, error: `Shop name must be ${NAME_MAX} characters or fewer` };
  if (full_name.length < NAME_MIN) return { ok: false, error: "Your full name is required" };
  if (full_name.length > NAME_MAX) return { ok: false, error: `Full name must be ${NAME_MAX} characters or fewer` };
  if (username.length < USERNAME_MIN) return { ok: false, error: `Username must be at least ${USERNAME_MIN} characters` };
  if (username.length > USERNAME_MAX) return { ok: false, error: `Username must be ${USERNAME_MAX} characters or fewer` };
  if (!USERNAME_RE.test(username)) return { ok: false, error: "Username can only contain letters, numbers, and underscores" };
  if (password.length < PASSWORD_MIN) return { ok: false, error: `Password must be at least ${PASSWORD_MIN} characters` };
  if (password.length > PASSWORD_MAX) return { ok: false, error: `Password must be ${PASSWORD_MAX} characters or fewer` };

  return { ok: true, shop_name, full_name, username, password };
}

export function showSignup(req: Request, res: Response) {
  if (req.session.employeeId) return res.redirect("/");
  res.render("signup");
}

export async function signup(req: Request, res: Response) {
  if (req.session.employeeId) return res.redirect("/");

  const v = validate(req.body as Record<string, unknown>);
  if (!v.ok) {
    pushFlash(req, "error", v.error);
    return res.redirect("/signup");
  }

  // bcrypt cost 10 is the de-facto default; cost 12 added ~190ms of CPU
  // per signup with no real security gain at typical password lengths.
  const hash = await bcrypt.hash(v.password, 10);
  const now = nowIso();

  // Check if we require administrator approval for new signups
  const settingRow = await getDb()
    .selectFrom("settings")
    .select("value")
    .where("shop_id", "=", 1)
    .where("key", "=", "global:require_approval")
    .executeTakeFirst();
  const requireApproval = settingRow ? settingRow.value === "true" : false;
  const initialActive = requireApproval ? 0 : 1;

  // Whole signup is one transaction. If anything fails, the shop, owner,
  // and seeded settings all roll back. Username uniqueness is per-shop
  // (CREATE UNIQUE INDEX idx_employees_username_per_shop) — a new shop
  // can have an "owner" username even if another shop already does.
  const result = await getDb().transaction().execute(async (trx) => {
    const shop = await trx
      .insertInto("shops")
      .values({ name: v.shop_name, is_active: initialActive, created_at: now })
      .returning(["id"])
      .executeTakeFirstOrThrow();

    const owner = await trx
      .insertInto("employees")
      .values({
        shop_id: shop.id,
        full_name: v.full_name,
        username: v.username,
        password_hash: hash,
        role: "owner",
        created_at: now,
        updated_at: now,
      })
      .returning(["id"])
      .executeTakeFirstOrThrow();

    // Seed the new shop's default settings in a single bulk INSERT.
    // shop_name uses the value the owner just chose.
    const defaults: Array<[string, string]> = [
      ["shop_name", v.shop_name],
      ["currency_code", "ETB"],
      ["currency_symbol", "Br"],
      ["decimal_places", "2"],
      ["thousand_separator", ","],
      ["decimal_separator", "."],
      ["pension_employer_default_pct", "11"],
      ["pension_employee_default_pct", "7"],
      ["standard_days_in_month", "30"],
      ["require_complete_hr_before_payroll", "false"],
      ["business_day_cutoff", "00:00"],
      ["timezone", "Africa/Addis_Ababa"],
    ];
    await trx
      .insertInto("settings")
      .values(defaults.map(([k, val]) => ({ shop_id: shop.id, key: k, value: val, updated_at: now })))
      .execute();
    return { shopId: shop.id, ownerId: owner.id };
  });

  if (initialActive === 0) {
    // Do NOT log the new user in automatically. They must wait for approval.
    await runWithShop(result.shopId, async () => {
      await writeAudit({ actor_id: result.ownerId, action: "signup", entity: "shops", entity_id: result.shopId });
    });
    pushFlash(req, "success", `Shop "${v.shop_name}" registered successfully! It is currently pending administrator approval.`);
    res.redirect("/login?pending=1");
  } else {
    // Log the new user in automatically.
    req.session.employeeId = result.ownerId;
    req.session.shopId = result.shopId;
    req.session.role = "owner";
    await runWithShop(result.shopId, async () => {
      await writeAudit({ actor_id: result.ownerId, action: "signup", entity: "shops", entity_id: result.shopId });
    });
    pushFlash(req, "success", `Welcome to ${v.shop_name}.`);
    res.redirect("/");
  }
}
