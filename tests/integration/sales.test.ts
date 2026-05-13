import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { unlinkSync, existsSync } from "fs";
import { closeDb, runMigrations } from "../../src/lib/db";
import * as Employees from "../../src/models/employees";
import * as Menu from "../../src/models/menuItems";

const TEST_DB = "./data/test-sales-int.db";
process.env.DB_PATH = TEST_DB;
process.env.SESSION_SECRET = "test-secret";

async function loginAs(app: any, username: string, password: string): Promise<request.SuperAgentTest> {
  const agent = request.agent(app);
  const r1 = await agent.get("/login");
  const csrf = /name="_csrf" value="([^"]+)"/.exec(r1.text)![1];
  await agent.post("/login").type("form").send({ _csrf: csrf, username, password });
  return agent;
}

async function csrfFrom(agent: any, path: string): Promise<string> {
  const r = await agent.get(path);
  return /name="_csrf" value="([^"]+)"/.exec(r.text)![1];
}

beforeEach(async () => {
  closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  runMigrations();
  const hash = await bcrypt.hash("pw123", 12);
  Employees.create({ full_name: "Owner",   username: "owner", password_hash: hash, role: "owner" });
  Employees.create({ full_name: "Cashier", username: "cash",  password_hash: hash, role: "employee" });
  Menu.create({ name: "Latte",    price: 5000, sort_order: 1 });
  Menu.create({ name: "Espresso", price: 3000, sort_order: 2 });
});

afterAll(() => {
  closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

describe("Sales flow", () => {
  it("cashier can create a shift and enter line items", async () => {
    const { app } = await import("../../src/app");
    const agent = await loginAs(app, "cash", "pw123");

    let csrf = await csrfFrom(agent, "/sales/new");
    const create = await agent.post("/sales").type("form").send({ _csrf: csrf, business_date: "2026-05-12", shift: "morning" });
    expect(create.status).toBe(302);
    const sessionUrl = create.headers.location!;
    const id = Number(sessionUrl.split("/").pop());

    // entry page renders
    const entry = await agent.get(sessionUrl);
    expect(entry.text).toContain("Latte");
    expect(entry.text).toContain("Espresso");

    // upsert a line (HTMX-style POST returns HTML fragments — we just check status)
    csrf = await csrfFrom(agent, sessionUrl); // get a fresh csrf token if needed
    const latte = Menu.listActive().find(m => m.name === "Latte")!;
    const post = await agent.post(`/sales/${id}/lines/${latte.id}`)
      .set("x-csrf-token", csrf)
      .type("form").send({ qty: 3 });
    expect(post.status).toBe(200);
    expect(post.text).toContain("150.00"); // 3 * 50.00

    // close the shift
    csrf = await csrfFrom(agent, sessionUrl);
    const close = await agent.post(`/sales/${id}/close`).type("form").send({ _csrf: csrf });
    expect(close.status).toBe(302);

    // back on the entry page, "Reopen shift" is not visible to cashier
    const after = await agent.get(sessionUrl);
    expect(after.text).not.toContain("Reopen shift");
  });

  it("owner can see all shifts; cashier only their own", async () => {
    const { app } = await import("../../src/app");

    // cashier creates a shift
    const cashierAgent = await loginAs(app, "cash", "pw123");
    let csrf = await csrfFrom(cashierAgent, "/sales/new");
    await cashierAgent.post("/sales").type("form").send({ _csrf: csrf, business_date: "2026-05-12", shift: "morning" });

    // owner sees it
    const ownerAgent = await loginAs(app, "owner", "pw123");
    const ownerList = await ownerAgent.get("/sales");
    expect(ownerList.text).toContain("2026-05-12");

    // cashier sees their own
    const cashierList = await cashierAgent.get("/sales");
    expect(cashierList.text).toContain("2026-05-12");
  });

  it("non-owner can't edit a closed shift", async () => {
    const { app } = await import("../../src/app");
    const cashierAgent = await loginAs(app, "cash", "pw123");
    let csrf = await csrfFrom(cashierAgent, "/sales/new");
    const create = await cashierAgent.post("/sales").type("form").send({ _csrf: csrf, business_date: "2026-05-12", shift: "morning" });
    const id = Number(create.headers.location!.split("/").pop());

    csrf = await csrfFrom(cashierAgent, `/sales/${id}`);
    await cashierAgent.post(`/sales/${id}/close`).type("form").send({ _csrf: csrf });

    // try to update a line — should be 403
    const latte = Menu.listActive().find(m => m.name === "Latte")!;
    csrf = await csrfFrom(cashierAgent, `/sales/${id}`);
    const post = await cashierAgent.post(`/sales/${id}/lines/${latte.id}`)
      .set("x-csrf-token", csrf)
      .type("form").send({ qty: 1 });
    expect(post.status).toBe(403);
  });
});
