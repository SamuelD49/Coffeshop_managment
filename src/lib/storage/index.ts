import { LocalStorage } from "./local";
import { SupabaseStorage } from "./supabase";
import { currentShopId } from "../shopContext";

export type OwnerType = "employee" | "guarantor";

export type PutOptions = {
  ownerType: OwnerType;
  ownerId: number;
  filename: string;
  body: Buffer;
  contentType: string;
};

export type GetResult = {
  body: Buffer;
  contentType: string;
};

export interface Storage {
  put(opts: PutOptions): Promise<void>;
  get(ownerType: OwnerType, ownerId: number, filename: string): Promise<GetResult>;
  delete(ownerType: OwnerType, ownerId: number, filename: string): Promise<void>;
  exists(ownerType: OwnerType, ownerId: number, filename: string): Promise<boolean>;
}

let _storage: Storage | null = null;

export function getStorage(): Storage {
  if (_storage) return _storage;
  const driver = (process.env.STORAGE_DRIVER ?? "local").toLowerCase();
  if (driver === "local") _storage = new LocalStorage();
  else if (driver === "supabase") _storage = new SupabaseStorage();
  else throw new Error(`STORAGE_DRIVER must be "local" or "supabase", got: ${driver}`);
  return _storage;
}

export function currentStorageDriver(): "local" | "supabase" {
  return (process.env.STORAGE_DRIVER ?? "local").toLowerCase() === "supabase" ? "supabase" : "local";
}

// All keys are scoped under `shops/{shopId}/...` so two shops can never
// collide on the same object path. The shopId is read from request-scoped
// AsyncLocalStorage — every storage call happens inside a runWithShop block.
export function storageKey(ownerType: OwnerType, ownerId: number, filename: string): string {
  return `shops/${currentShopId()}/${ownerType}/${ownerId}/${filename}`;
}
