import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { unlinkSync, existsSync, readdirSync, rmSync, statSync, writeFileSync } from "fs";
import { resolve } from "path";
import { closeDb, runMigrations, _legacySqliteDb } from "../src/lib/db";
import { runBackup, pruneOldBackups } from "../src/lib/backup";

const TEST_DB = "./data/test-backup.db";
const TEST_DIR = "./data/test-backups";
process.env.DB_PATH = TEST_DB;
process.env.BACKUP_DIR = TEST_DIR;

beforeEach(async () => {
  await closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  await runMigrations();
});

afterAll(async () => {
  await closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
});

describe("backup", () => {
  it("runBackup() writes a copy to BACKUP_DIR with a timestamp filename", async () => {
    // Add some data so the backup is non-trivial
    _legacySqliteDb().prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("test_key", "hello");
    const path = await runBackup();
    expect(existsSync(path)).toBe(true);
    expect(path).toMatch(/test-backups\/shop-\d{4}-\d{2}-\d{2}.*\.db$/);
    expect(statSync(path).size).toBeGreaterThan(0);
  });

  it("pruneOldBackups() removes files older than N days", async () => {
    await runBackup();
    // Sleep then create another so we have two files
    const files = readdirSync(TEST_DIR);
    expect(files.length).toBe(1);
    // Touch a fake old file
    const oldPath = resolve(TEST_DIR, "shop-2020-01-01.db");
    writeFileSync(oldPath, "old");
    // Antedate via fs.utimes
    const old = new Date(); old.setDate(old.getDate() - 90);
    const fs = require("fs");
    fs.utimesSync(oldPath, old, old);

    pruneOldBackups(30);
    expect(existsSync(oldPath)).toBe(false);
    // Recent one survives
    expect(readdirSync(TEST_DIR).length).toBe(1);
  });
});
