import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { unlinkSync, existsSync } from "fs";
import { closeDb, runMigrations } from "../../src/lib/db";
import * as Employees from "../../src/models/employees";

const TEST_DB = "./data/test-auth.db";
process.env.DB_PATH = TEST_DB;
process.env.SESSION_SECRET = "test-secret";

async function seedOwner() {
  const hash = await bcrypt.hash("secret123", 12);
  Employees.create({ full_name: "Sam", username: "sam", password_hash: hash, role: "owner" });
}

beforeEach(async () => {
  await closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  await runMigrations();
  await seedOwner();
});

afterAll(async () => {
  await closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

async function getCsrf(agent: request.SuperAgentTest, path: string): Promise<string> {
  const res = await agent.get(path);
  const m = /name="_csrf" value="([^"]+)"/.exec(res.text);
  if (!m) throw new Error("no csrf token on " + path);
  return m[1];
}

describe("Auth", () => {
  it("GET /login renders the form", async () => {
    const { app } = await import("../../src/app");
    const res = await request(app).get("/login").expect(200);
    expect(res.text).toContain("Sign in");
  });

  it("rejects invalid credentials", async () => {
    const { app } = await import("../../src/app");
    const agent = request.agent(app);
    const csrf = await getCsrf(agent, "/login");
    const res = await agent.post("/login").type("form").send({ _csrf: csrf, username: "sam", password: "wrong" });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/login");
  });

  it("accepts valid credentials and redirects to /", async () => {
    const { app } = await import("../../src/app");
    const agent = request.agent(app);
    const csrf = await getCsrf(agent, "/login");
    const res = await agent.post("/login").type("form").send({ _csrf: csrf, username: "sam", password: "secret123" });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/");

    const home = await agent.get("/");
    expect(home.status).toBe(200);
    expect(home.text).toContain("Dashboard");
  });

  it("requireAuth redirects unauthenticated user to /login", async () => {
    const { app } = await import("../../src/app");
    const res = await request(app).get("/").expect(302);
    expect(res.headers.location).toBe("/login");
  });

  it("logout clears the session", async () => {
    const { app } = await import("../../src/app");
    const agent = request.agent(app);
    let csrf = await getCsrf(agent, "/login");
    await agent.post("/login").type("form").send({ _csrf: csrf, username: "sam", password: "secret123" });
    csrf = await getCsrf(agent, "/");
    await agent.post("/logout").type("form").send({ _csrf: csrf });
    const res = await agent.get("/");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/login");
  });
});
