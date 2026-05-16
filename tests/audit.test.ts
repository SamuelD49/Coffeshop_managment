import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { unlinkSync, existsSync } from "fs";
import { closeDb, runMigrations, _legacySqliteDb } from "../src/lib/db";
import { writeAudit } from "../src/lib/audit";

const TEST_DB = "./data/test-audit.db";
process.env.DB_PATH = TEST_DB;

beforeEach(async () => {
  await closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  await runMigrations();
});

afterAll(async () => {
  await closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

describe("writeAudit", () => {
  it("inserts a row", async () => {
    await writeAudit({ actor_id: null, action: "login", entity: "session", entity_id: null });
    const rows = _legacySqliteDb().prepare("SELECT * FROM audit_log").all() as any[];
    expect(rows.length).toBe(1);
    expect(rows[0].action).toBe("login");
    expect(rows[0].entity).toBe("session");
  });
});
