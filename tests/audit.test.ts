import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { unlinkSync, existsSync } from "fs";
import { closeDb, runMigrations, getDb } from "../src/lib/db";
import { writeAudit } from "../src/lib/audit";

import { seedTestShop, runInShop } from "./lib/testShop";

const TEST_DB = "./data/test-audit.db";
process.env.DB_PATH = TEST_DB;

let shopId: number;

beforeEach(async () => {
  await closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  await runMigrations();
  shopId = await seedTestShop();
});

afterAll(async () => {
  await closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

describe("writeAudit", () => {
  it("inserts a row", async () => {

    await runInShop(shopId, async () => {
    await writeAudit({ actor_id: null, action: "login", entity: "session", entity_id: null });
    const rows = await getDb().selectFrom("audit_log").selectAll().execute();
    expect(rows.length).toBe(1);
    expect(rows[0].action).toBe("login");
    expect(rows[0].entity).toBe("session");
  

    });

  });
});
