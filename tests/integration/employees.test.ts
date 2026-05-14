import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { unlinkSync, existsSync, rmSync } from "fs";
import { closeDb, runMigrations } from "../../src/lib/db";
import * as Employees from "../../src/models/employees";

const TEST_DB = "./data/test-employees-int.db";
process.env.DB_PATH = TEST_DB;
process.env.SESSION_SECRET = "test-secret";

async function loginAsOwner(app: any): Promise<request.SuperAgentTest> {
  const agent = request.agent(app);
  const r1 = await agent.get("/login");
  const csrf = /name="_csrf" value="([^"]+)"/.exec(r1.text)![1];
  await agent.post("/login").type("form").send({ _csrf: csrf, username: "owner", password: "secret123" });
  return agent;
}

async function csrfFrom(agent: any, path: string): Promise<string> {
  const r = await agent.get(path);
  return /name="_csrf" value="([^"]+)"/.exec(r.text)![1];
}

beforeEach(async () => {
  closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  if (existsSync("./data/uploads")) rmSync("./data/uploads", { recursive: true, force: true });
  runMigrations();
  const hash = await bcrypt.hash("secret123", 12);
  Employees.create({ full_name: "Owner", username: "owner", password_hash: hash, role: "owner" });
});

afterAll(() => {
  closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  if (existsSync("./data/uploads")) rmSync("./data/uploads", { recursive: true, force: true });
});

describe("Employees onboarding flow", () => {
  it("renders the employees list with an empty state", async () => {
    const { app } = await import("../../src/app");
    const agent = await loginAsOwner(app);
    const res = await agent.get("/employees");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Employees");
    // The seeded Owner row now appears on the list (the page shows everyone in
    // the system, including owners, so the count matches payroll).
    expect(res.text).toContain("Owner");
  });

  it("creates an employee via POST /employees", async () => {
    const { app } = await import("../../src/app");
    const agent = await loginAsOwner(app);
    const csrf = await csrfFrom(agent, "/employees/new");
    const res = await agent.post("/employees").type("form").send({ _csrf: csrf, full_name: "Almaz", phone: "+251911", role: "employee" });
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/employees\/\d+$/);
    const list = await agent.get("/employees");
    expect(list.text).toContain("Almaz");
  });

  it("renders the profile and personal tab with form fields", async () => {
    const { app } = await import("../../src/app");
    const agent = await loginAsOwner(app);
    const csrf = await csrfFrom(agent, "/employees/new");
    const create = await agent.post("/employees").type("form").send({ _csrf: csrf, full_name: "Almaz", phone: "", role: "employee" });
    const profileUrl = create.headers.location!;
    const res = await agent.get(profileUrl);
    expect(res.text).toContain("Almaz");
    expect(res.text).toContain("Personal");
    expect(res.text).toContain("Documents");
    expect(res.text).toContain("Guarantors");
    expect(res.text).toContain("Employment");
    expect(res.text).toContain("missing"); // status badge
  });

  it("saves personal info and updates onboarding completeness", async () => {
    const { app } = await import("../../src/app");
    const agent = await loginAsOwner(app);
    let csrf = await csrfFrom(agent, "/employees/new");
    const create = await agent.post("/employees").type("form").send({ _csrf: csrf, full_name: "Almaz", phone: "", role: "employee" });
    const profileUrl = create.headers.location!;
    const id = Number(profileUrl.split("/").pop());

    csrf = await csrfFrom(agent, `${profileUrl}?tab=personal`);
    await agent.post(`/employees/${id}/personal`).type("form").send({
      _csrf: csrf,
      full_name: "Almaz Tesfaye",
      phone: "+251911234567",
      national_id_number: "ID123",
      national_id_type: "Kebele",
      date_of_birth: "1995-04-10",
      gender: "F",
      marital_status: "single",
      address: "Bole, Addis Ababa",
      emergency_contact_name: "Hanna",
      emergency_contact_phone: "+251911234568",
      emergency_contact_relation: "Sister",
    });

    const full = Employees.findFull(id);
    expect(full?.phone).toBe("+251911234567");
    expect(full?.onboarding_status).toBe("incomplete"); // docs + guarantor still missing
  });

  it("blocks employee role from /employees", async () => {
    const { app } = await import("../../src/app");
    // employee account
    const hash = await bcrypt.hash("emp123", 12);
    Employees.create({ full_name: "Cashier", username: "cash", password_hash: hash, role: "employee" });

    const agent = request.agent(app);
    let csrf = await csrfFrom(agent, "/login");
    await agent.post("/login").type("form").send({ _csrf: csrf, username: "cash", password: "emp123" });
    const res = await agent.get("/employees");
    expect(res.status).toBe(403);
  });
});
