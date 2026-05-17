import { getSupabaseClient, storageBucket } from "../supabase";
import { storageKey } from "./index";
import { currentShopId } from "../shopContext";
import type { Storage, OwnerType, PutOptions, GetResult } from "./index";

export class SupabaseStorage implements Storage {
  async put(opts: PutOptions): Promise<void> {
    const client = getSupabaseClient();
    const key = storageKey(opts.ownerType, opts.ownerId, opts.filename);
    const { error } = await client.storage.from(storageBucket()).upload(key, opts.body, {
      contentType: opts.contentType,
      upsert: true,
    });
    if (error) throw error;
  }

  async get(ownerType: OwnerType, ownerId: number, filename: string): Promise<GetResult> {
    const client = getSupabaseClient();
    const key = storageKey(ownerType, ownerId, filename);
    const { data, error } = await client.storage.from(storageBucket()).download(key);
    if (error || !data) throw error ?? new Error(`storage object not found: ${key}`);
    const buf = Buffer.from(await data.arrayBuffer());
    return { body: buf, contentType: data.type || "application/octet-stream" };
  }

  async delete(ownerType: OwnerType, ownerId: number, filename: string): Promise<void> {
    const client = getSupabaseClient();
    const key = storageKey(ownerType, ownerId, filename);
    const { error } = await client.storage.from(storageBucket()).remove([key]);
    if (error) throw error;
  }

  async exists(ownerType: OwnerType, ownerId: number, filename: string): Promise<boolean> {
    const client = getSupabaseClient();
    const key = storageKey(ownerType, ownerId, filename);
    // Supabase has no head endpoint; list with a single-result filter.
    const { data, error } = await client.storage
      .from(storageBucket())
      .list(`shops/${currentShopId()}/${ownerType}/${ownerId}`, { search: filename, limit: 1 });
    if (error) throw error;
    return !!data && data.some((f) => f.name === filename);
  }
}
