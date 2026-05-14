import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { unlinkSync, existsSync } from "fs";
import { closeDb, runMigrations } from "../../src/lib/db";

const TEST_DB = "./data/test-happy.db";
process.env.DB_PATH = TEST_DB;
process.env.SESSION_SECRET = "test-secret";

beforeEach(() => {
  closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  runMigrations();
});

afterAll(() => {
  closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

async function csrf(agent: request.SuperAgentTest, path: string): Promise<string> {
  const r = await agent.get(path);
  return /name="_csrf" value="([^"]+)"/.exec(r.text)![1];
}

describe("happy path", () => {
  it("setup → settings update → logout → login → settings reflect", async () => {
    const { app } = await import("../../src/app");
    const agent = request.agent(app);

    // Setup — shop_name is now collected here and becomes the app title.
    let t = await csrf(agent, "/setup");
    await agent.post("/setup").type("form").send({ _csrf: t, shop_name: "Bunna Café", full_name: "Sam", username: "sam", password: "secret123" });

    // Verify reflected in dashboard
    const home = await agent.get("/");
    expect(home.text).toContain("Bunna Café");

    // Logout
    t = await csrf(agent, "/");
    await agent.post("/logout").type("form").send({ _csrf: t });

    // Login again
    const agent2 = request.agent(app);
    t = await csrf(agent2, "/login");
    await agent2.post("/login").type("form").send({ _csrf: t, username: "sam", password: "secret123" });
    const home2 = await agent2.get("/");
    expect(home2.text).toContain("Bunna Café");
  });
});
