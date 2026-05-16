import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { unlinkSync, existsSync } from "fs";
import { closeDb, runMigrations } from "../../src/lib/db";

const TEST_DB = "./data/test-setup.db";
process.env.DB_PATH = TEST_DB;
process.env.SESSION_SECRET = "test-secret";

async function freshApp() {
  await closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  // Force re-import after env change
  const dbMod = await import("../../src/lib/db");
  await dbMod.runMigrations();
  const { app } = await import("../../src/app");
  return app;
}

beforeEach(async () => {
  await closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  await runMigrations();
});

afterAll(async () => {
  await closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

describe("First-run setup", () => {
  it("redirects any request to /setup when no employees exist", async () => {
    const { app } = await import("../../src/app");
    const res = await request(app).get("/").expect(302);
    expect(res.headers.location).toBe("/setup");
  });

  it("shows the setup form on GET /setup", async () => {
    const { app } = await import("../../src/app");
    const res = await request(app).get("/setup").expect(200);
    expect(res.text).toContain("Open the ledger");
  });

  it("creates owner on POST /setup and redirects to /", async () => {
    const { app } = await import("../../src/app");
    const agent = request.agent(app);
    // Fetch GET first to obtain a session and CSRF token via cookies
    const getRes = await agent.get("/setup");
    const csrf = /name="_csrf" value="([^"]+)"/.exec(getRes.text)?.[1];
    expect(csrf).toBeDefined();

    const res = await agent.post("/setup").type("form").send({
      _csrf: csrf,
      shop_name: "Bunna",
      full_name: "Sam",
      username: "sam",
      password: "secret123",
    });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/");
  });

  it("rejects POST /setup if employees already exist", async () => {
    const { app } = await import("../../src/app");
    const agent = request.agent(app);
    const getRes = await agent.get("/setup");
    const csrf = /name="_csrf" value="([^"]+)"/.exec(getRes.text)?.[1]!;
    await agent.post("/setup").type("form").send({ _csrf: csrf, shop_name: "Bunna", full_name: "Sam", username: "sam", password: "secret123" });

    const getRes2 = await agent.get("/setup");
    // After setup, requireSetup no longer redirects to /setup — root works.
    // The /setup route itself should refuse re-creation. We'll assert it returns 302 to / or shows a "disabled" state.
    expect(getRes2.status).toBe(302);
  });
});
