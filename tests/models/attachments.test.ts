import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { unlinkSync, existsSync } from "fs";
import { closeDb, runMigrations } from "../../src/lib/db";
import * as Employees from "../../src/models/employees";
import * as Attachments from "../../src/models/attachments";

const TEST_DB = "./data/test-attachments.db";
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

describe("Attachments", () => {
  it("create() and findByOwner() round-trip", async () => {
    const e = await Employees.create({ full_name: "Almaz", username: "alm", password_hash: "h", role: "employee" });
    await Attachments.create({ owner_type: "employee", owner_id: e.id, kind: "profile_photo", filename: "abc.png", original_name: "me.png", mime_type: "image/png", size_bytes: 1234, uploaded_by: null });
    await Attachments.create({ owner_type: "employee", owner_id: e.id, kind: "id_front", filename: "def.jpg", original_name: "id.jpg", mime_type: "image/jpeg", size_bytes: 5678, uploaded_by: null });
    const list = await Attachments.findByOwner("employee", e.id);
    expect(list).toHaveLength(2);
    expect(list.map(a => a.kind).sort()).toEqual(["id_front", "profile_photo"]);
  });

  it("findOneByKind() returns the latest of a kind or null", async () => {
    const e = await Employees.create({ full_name: "Almaz", username: "alm", password_hash: "h", role: "employee" });
    await Attachments.create({ owner_type: "employee", owner_id: e.id, kind: "profile_photo", filename: "old.png", original_name: "old.png", mime_type: "image/png", size_bytes: 1, uploaded_by: null });
    await Attachments.create({ owner_type: "employee", owner_id: e.id, kind: "profile_photo", filename: "new.png", original_name: "new.png", mime_type: "image/png", size_bytes: 2, uploaded_by: null });
    expect((await Attachments.findOneByKind("employee", e.id, "profile_photo"))?.filename).toBe("new.png");
    expect(await Attachments.findOneByKind("employee", e.id, "contract")).toBeNull();
  });

  it("remove() deletes by id", async () => {
    const e = await Employees.create({ full_name: "Almaz", username: "alm", password_hash: "h", role: "employee" });
    const a = await Attachments.create({ owner_type: "employee", owner_id: e.id, kind: "id_front", filename: "x.jpg", original_name: "x.jpg", mime_type: "image/jpeg", size_bytes: 1, uploaded_by: null });
    await Attachments.remove(a.id);
    expect(await Attachments.findByOwner("employee", e.id)).toHaveLength(0);
  });

  it("removeByOwner() bulk-deletes all rows for an owner", async () => {
    const e = await Employees.create({ full_name: "Almaz", username: "alm", password_hash: "h", role: "employee" });
    await Attachments.create({ owner_type: "employee", owner_id: e.id, kind: "id_front",  filename: "a", original_name: "a", mime_type: "image/png", size_bytes: 1, uploaded_by: null });
    await Attachments.create({ owner_type: "employee", owner_id: e.id, kind: "id_back",   filename: "b", original_name: "b", mime_type: "image/png", size_bytes: 1, uploaded_by: null });
    await Attachments.removeByOwner("employee", e.id);
    expect(await Attachments.findByOwner("employee", e.id)).toHaveLength(0);
  });
});
