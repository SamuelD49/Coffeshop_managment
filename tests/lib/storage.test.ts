import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { rm, mkdir } from "fs/promises";
import { resolve } from "path";
import { LocalStorage } from "../../src/lib/storage/local";
import { runWithShop } from "../../src/lib/shopContext";

const ROOT = resolve(process.cwd(), "data/uploads");

beforeEach(async () => {
  await rm(ROOT, { recursive: true, force: true });
  await mkdir(ROOT, { recursive: true });
});

afterAll(async () => {
  await rm(ROOT, { recursive: true, force: true });
});

// All storage tests run inside a fake shop context so dirFor() can resolve.
function inShop<T>(fn: () => Promise<T>): Promise<T> {
  return runWithShop(1, fn) as Promise<T>;
}

describe("LocalStorage", () => {
  it("round-trips a file", async () => {
    await inShop(async () => {
      const s = new LocalStorage();
      const body = Buffer.from("hello");
      await s.put({ ownerType: "employee", ownerId: 1, filename: "x.txt", body, contentType: "text/plain" });
      const got = await s.get("employee", 1, "x.txt");
      expect(got.body.toString()).toBe("hello");
    });
  });

  it("exists() reports presence", async () => {
    await inShop(async () => {
      const s = new LocalStorage();
      expect(await s.exists("employee", 1, "x.txt")).toBe(false);
      await s.put({ ownerType: "employee", ownerId: 1, filename: "x.txt", body: Buffer.from("x"), contentType: "text/plain" });
      expect(await s.exists("employee", 1, "x.txt")).toBe(true);
    });
  });

  it("deletes a file", async () => {
    await inShop(async () => {
      const s = new LocalStorage();
      await s.put({ ownerType: "employee", ownerId: 1, filename: "x.txt", body: Buffer.from("x"), contentType: "text/plain" });
      await s.delete("employee", 1, "x.txt");
      expect(await s.exists("employee", 1, "x.txt")).toBe(false);
    });
  });

  it("delete on missing key does not throw", async () => {
    await inShop(async () => {
      const s = new LocalStorage();
      await expect(s.delete("employee", 1, "missing.txt")).resolves.toBeUndefined();
    });
  });
});
