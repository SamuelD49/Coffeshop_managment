import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { unlinkSync, existsSync } from "fs";
import { closeDb, runMigrations } from "../../src/lib/db";

const TEST_DB = "./data/test-happy.db";
process.env.DB_PATH = TEST_DB;
process.env.SESSION_SECRET = "test-secret";

beforeEach(async () => {
  await closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  await runMigrations();
  // No pre-seeded shop — the test is exercising signup, which creates one.
});

afterAll(async () => {
  await closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

async function csrf(agent: request.SuperAgentTest, path: string): Promise<string> {
  const r = await agent.get(path);
  return /name="_csrf" value="([^"]+)"/.exec(r.text)![1];
}

describe("happy path", () => {
  it("signup → dashboard reflects shop_name → logout → login → still reflects", async () => {
    const { app } = await import("../../src/app");
    const agent = request.agent(app);

    // Signup creates the shop + first owner.
    let t = await csrf(agent, "/signup");
    await agent.post("/signup").type("form").send({
      _csrf: t,
      shop_name: "Bunna Café",
      full_name: "Sam",
      username: "sam",
      password: "secret12",
    });

    const home = await agent.get("/");
    expect(home.text).toContain("Bunna Café");

    // Logout
    t = await csrf(agent, "/");
    await agent.post("/logout").type("form").send({ _csrf: t });

    // Login again in a fresh agent
    const agent2 = request.agent(app);
    t = await csrf(agent2, "/login");
    await agent2.post("/login").type("form").send({ _csrf: t, username: "sam", password: "secret12" });
    const home2 = await agent2.get("/");
    expect(home2.text).toContain("Bunna Café");
  });
});
