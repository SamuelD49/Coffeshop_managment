import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { unlinkSync, existsSync } from "fs";
import { closeDb, runMigrations } from "../../src/lib/db";
import * as Employees from "../../src/models/employees";
import * as Purchases from "../../src/models/purchases";
import * as Petty from "../../src/models/pettyCash";

const TEST_DB = "./data/test-purch-petty.db";
process.env.DB_PATH = TEST_DB;
process.env.SESSION_SECRET = "test-secret";

async function loginAs(app: any, u: string, p: string): Promise<request.SuperAgentTest> {
  const agent = request.agent(app);
  const r1 = await agent.get("/login");
  const csrf = /name="_csrf" value="([^"]+)"/.exec(r1.text)![1];
  await agent.post("/login").type("form").send({ _csrf: csrf, username: u, password: p });
  return agent;
}

async function csrfFrom(agent: any, path: string): Promise<string> {
  const r = await agent.get(path);
  return /name="_csrf" value="([^"]+)"/.exec(r.text)![1];
}

beforeEach(async () => {
  await closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  await runMigrations();
  const hash = await bcrypt.hash("pw", 12);
  await Employees.create({ full_name: "Owner",   username: "owner", password_hash: hash, role: "owner" });
  await Employees.create({ full_name: "Cashier", username: "cash",  password_hash: hash, role: "employee" });
});

afterAll(async () => {
  await closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

describe("Purchases", () => {
  it("owner can add a purchase via the inline form", async () => {
    const { app } = await import("../../src/app");
    const agent = await loginAs(app, "owner", "pw");
    const csrf = await csrfFrom(agent, "/purchases");
    // Use today's date so the row shows in the default-today filter on /purchases.
    const today = new Date().toISOString().slice(0, 10);
    const res = await agent.post("/purchases").type("form").send({
      _csrf: csrf, purchase_date: today, description: "Beans", unit: "kg", qty: "2", unit_price: "100.00", remark: "",
    });
    expect(res.status).toBe(302);
    const list = await agent.get("/purchases");
    expect(list.text).toContain("Beans");
    expect(list.text).toContain("200.00"); // 2 kg * 100.00
  });

  it("cashier cannot reach /purchases", async () => {
    const { app } = await import("../../src/app");
    const agent = await loginAs(app, "cash", "pw");
    const res = await agent.get("/purchases");
    expect(res.status).toBe(403);
  });

  it("update + delete cycle", async () => {
    const { app } = await import("../../src/app");
    const agent = await loginAs(app, "owner", "pw");
    const p = await Purchases.create({ purchase_date: "2026-05-12", description: "X", unit: null, qty: 1, unit_price: 10000, remark: null, entered_by: null });
    let csrf = await csrfFrom(agent, `/purchases/${p.id}/edit`);
    await agent.post(`/purchases/${p.id}`).type("form").send({
      _csrf: csrf, purchase_date: "2026-05-13", description: "Y", unit: "kg", qty: "3", unit_price: "50.00", remark: "",
    });
    expect((await Purchases.findById(p.id))?.description).toBe("Y");
    csrf = await csrfFrom(agent, "/purchases");
    await agent.post(`/purchases/${p.id}/delete`).type("form").send({ _csrf: csrf });
    expect(await Purchases.findById(p.id)).toBeNull();
  });
});

describe("Petty cash", () => {
  it("running balance reflects entries by date", async () => {
    const { app } = await import("../../src/app");
    const agent = await loginAs(app, "owner", "pw");
    let csrf = await csrfFrom(agent, "/petty-cash");
    await agent.post("/petty-cash").type("form").send({ _csrf: csrf, entry_date: "2026-05-12", type: "replenishment", amount: "1000.00", description: "Initial", payer_name: "Sam", remark: "" });
    csrf = await csrfFrom(agent, "/petty-cash");
    await agent.post("/petty-cash").type("form").send({ _csrf: csrf, entry_date: "2026-05-12", type: "expense", amount: "50.00", description: "Taxi", payer_name: "", remark: "" });
    const list = await agent.get("/petty-cash");
    expect(list.text).toContain("Initial");
    expect(list.text).toContain("Taxi");
    expect(await Petty.currentBalance()).toBe(95000); // 100000 - 5000
  });

  it("cashier cannot reach /petty-cash", async () => {
    const { app } = await import("../../src/app");
    const agent = await loginAs(app, "cash", "pw");
    const res = await agent.get("/petty-cash");
    expect(res.status).toBe(403);
  });
});
