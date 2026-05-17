import { mkdirSync, existsSync } from "fs";
import { readFile, writeFile, unlink, stat } from "fs/promises";
import { resolve, join } from "path";
import { currentShopId } from "../shopContext";
import type { Storage, OwnerType, PutOptions, GetResult } from "./index";

const ROOT = resolve(process.cwd(), "data/uploads");

function dirFor(ownerType: OwnerType, ownerId: number): string {
  const d = join(ROOT, "shops", String(currentShopId()), ownerType, String(ownerId));
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  return d;
}

export class LocalStorage implements Storage {
  async put(opts: PutOptions): Promise<void> {
    const dir = dirFor(opts.ownerType, opts.ownerId);
    await writeFile(join(dir, opts.filename), opts.body);
  }

  async get(ownerType: OwnerType, ownerId: number, filename: string): Promise<GetResult> {
    const fullPath = join(dirFor(ownerType, ownerId), filename);
    const body = await readFile(fullPath);
    return { body, contentType: "application/octet-stream" };
  }

  async delete(ownerType: OwnerType, ownerId: number, filename: string): Promise<void> {
    const fullPath = join(dirFor(ownerType, ownerId), filename);
    try { await unlink(fullPath); } catch { /* missing file is fine */ }
  }

  async exists(ownerType: OwnerType, ownerId: number, filename: string): Promise<boolean> {
    const fullPath = join(dirFor(ownerType, ownerId), filename);
    try { await stat(fullPath); return true; } catch { return false; }
  }
}
