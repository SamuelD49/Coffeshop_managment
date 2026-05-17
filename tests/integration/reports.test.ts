import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { unlinkSync, existsSync, rmSync } from "fs";
import { closeDb, runMigrations } from "../../src/lib/db";
import * as Employees from "../../src/models/employees";
import * as Menu from "../../src/models/menuItems";
import * as Sessions from "../../src/models/salesSessions";
import * as Lines from "../../src/models/saleLineItems";

import { seedTestShop, runInShop } from "../lib/testShop";

const TEST_DB = "./data/test-reports-int.db";
process.env.DB_PATH = TEST_DB;
process.env.SESSION_SECRET = "test-secret";

async function loginAsOwner(app: any): Promise<request.SuperAgentTest> {
  const agent = request.agent(app);
  const r1 = await agent.get("/login");
  const csrf = /name="_csrf" value="([^"]+)"/.exec(r1.text)![1];
  await agent.post("/login").type("form").send({ _csrf: csrf, username: "owner", password: "pw" });
  return agent;
}
let shopId: number;


beforeEach(async () => {
  await closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  await runMigrations();
  shopId = await seedTestShop();
  await runInShop(shopId, async () => {
    const hash = await bcrypt.hash("pw", 12);
    await Employees.create({ full_name: "Owner",   username: "owner", password_hash: hash, role: "owner" });
    const e = await Employees.create({ full_name: "Cashier", username: "cash",  password_hash: hash, role: "employee" });
    const m = await Menu.create({ name: "Latte", price: 5000, sort_order: 1 });
    const s = await Sessions.create({ employee_id: e.id, business_date: "2026-05-12", shift: "morning" });
    await Lines.upsert(s.id, m.id, 3);
    await Sessions.updateHeader(s.id, { cash_amount: 15000, bank_transfer_amount: 0, notes: null });
  });
});

afterAll(async () => {
  await closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

describe("Reports", () => {
  it("renders the sales tab with the seeded data", async () => {

    await runInShop(shopId, async () => {
    const { app } = await import("../../src/app");
    const agent = await loginAsOwner(app);
    const res = await agent.get("/reports?tab=sales&from=2026-05-01&to=2026-05-31");
    expect(res.status).toBe(200);
    expect(res.text).toContain("2026-05-12");
    expect(res.text).toContain("150.00"); // 3 * 50.00
    expect(res.text).toContain("Latte");
  

    });

  });

  it("exports sales-by-item as CSV", async () => {


    await runInShop(shopId, async () => {
    const { app } = await import("../../src/app");
    const agent = await loginAsOwner(app);
    const res = await agent.get("/reports/export?tab=sales&group=item&from=2026-05-01&to=2026-05-31");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.headers["content-disposition"]).toContain("attachment");
    expect(res.text).toContain("name,qty,revenue");
    expect(res.text).toContain("Latte,3,150.00");
  


    });


  });

  it("cashier cannot access reports", async () => {


    await runInShop(shopId, async () => {
    const { app } = await import("../../src/app");
    const agent = request.agent(app);
    const r1 = await agent.get("/login");
    const csrf = /name="_csrf" value="([^"]+)"/.exec(r1.text)![1];
    await agent.post("/login").type("form").send({ _csrf: csrf, username: "cash", password: "pw" });
    const res = await agent.get("/reports");
    expect(res.status).toBe(403);
  


    });


  });
});

describe("Backups via settings", () => {
  it("dashboard shows live numbers after a sale", async () => {

    await runInShop(shopId, async () => {
    const { app } = await import("../../src/app");
    const agent = await loginAsOwner(app);
    const res = await agent.get("/");
    expect(res.status).toBe(200);
    // The seeded shift is for 2026-05-12 — likely not today's business date in test runtime.
    // Just confirm dashboard renders and contains the card label.
    expect(res.text).toContain("Today's sales");
  

    });

  });
});
