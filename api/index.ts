// Vercel serverless function entrypoint.
//
// Wraps the existing Express `app` so the same routes/middleware that run
// locally also run on Vercel. Every incoming HTTP request goes through this
// handler.
//
// Two extras vs `src/server.ts`:
//   1. We don't call app.listen() — Vercel handles the HTTP layer.
//   2. We don't start the nightly backup cron — Supabase has managed PITR.
//
// runMigrations() is called once per cold-start, memoized via a promise so
// concurrent requests share one apply pass. The schema_migrations table
// makes it a no-op when everything is already applied.

import "dotenv/config";
import type { Request, Response } from "express";
import { app } from "../src/app";
import { runMigrations } from "../src/lib/db";

let _initPromise: Promise<void> | null = null;
function ensureInit(): Promise<void> {
  if (!_initPromise) {
    _initPromise = runMigrations().catch((err) => {
      // If migrations fail, surface the error and let the next request retry.
      _initPromise = null;
      throw err;
    });
  }
  return _initPromise;
}

export default async function handler(req: Request, res: Response) {
  await ensureInit();
  return app(req, res);
}
