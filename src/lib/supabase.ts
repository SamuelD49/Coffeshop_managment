import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required when STORAGE_DRIVER=supabase");
  }
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

export function storageBucket(): string {
  return process.env.SUPABASE_STORAGE_BUCKET ?? "coffeshop";
}
