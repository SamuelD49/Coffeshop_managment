# Supabase setup — operator checklist

This document walks you through provisioning a Supabase project so the app can
run with `DB_DRIVER=supabase` and `STORAGE_DRIVER=supabase`. Do it once.

You only need to follow this if you're cutting over from the default local
SQLite + local-disk-uploads setup. The app works fine on the defaults
forever — Supabase is optional.

## 1. Create the Supabase project

1. Go to https://supabase.com and sign in (or create a free account).
2. Click **New project**. Pick:
   - **Name**: anything you want (e.g. `coffeeshop-prod`)
   - **Database password**: generate a strong one and save it in your password manager — you cannot recover it later, only reset
   - **Region**: pick the one geographically closest to where the app runs (latency matters; the app issues many small queries per request)
3. Wait ~2 minutes for provisioning. You'll land on the project dashboard.

## 2. Capture the database connection string

1. From the project dashboard, click the **Connect** button at the top (or go to **Project Settings → Database**).
2. Find the **Connection string** section. Pick the **URI** tab.
3. There are usually three options:
   - **Direct connection** (port 5432) — use this for `DATABASE_URL`. Best for a single-instance Node app that holds a long-lived pool.
   - **Session pooler** (port 5432, via `pooler.supabase.com`) — also fine, use this if your hosting provider has IPv4-only egress.
   - **Transaction pooler** (port 6543) — ⚠️ do NOT use this. It uses PgBouncer in transaction mode, which rewrites prepared statements and breaks Kysely's query planning. Symptoms: random `prepared statement "..." does not exist` errors.
4. The URI looks like: `postgresql://postgres.abcdefgh:YOUR_DB_PASSWORD@aws-0-region.pooler.supabase.com:5432/postgres`
5. Replace `[YOUR-PASSWORD]` with the password from step 1.
6. Paste into `.env.local` as `DATABASE_URL=...`

## 3. Capture the API keys

1. **Project Settings → API**.
2. Copy **Project URL** → `SUPABASE_URL=...` in `.env.local`.
3. Copy the **service_role** key (it's a long JWT) → `SUPABASE_SERVICE_ROLE_KEY=...`.
   - ⚠️ This key bypasses Row-Level Security. **Never** ship it to a browser or commit it. Server-side only.
   - The `anon` key is not used by this app.

## 4. Create the storage bucket

1. Left sidebar → **Storage** → **New bucket**.
2. Name it `coffeshop` (or pick another name and set `SUPABASE_STORAGE_BUCKET=` to match).
3. Toggle **Public** to **off** (private). The app generates signed URLs / streams via the service role.
4. Click **Create bucket**.

## 5. Fill out `.env.local`

Your local file (which is gitignored) should now look something like:

```bash
PORT=3000
SESSION_SECRET=already-set-something-long
NODE_ENV=development

# Leave at defaults until cutover
DB_DRIVER=sqlite
STORAGE_DRIVER=local

DATABASE_URL=postgresql://postgres.abcdefgh:longpasswordhere@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
SUPABASE_URL=https://abcdefgh.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
SUPABASE_STORAGE_BUCKET=coffeshop
```

## 6. Cutover (do this after the migration code is in place)

Once Tasks 18-25 of the migration plan land:

1. **Apply the Postgres schema** by booting the app once against Supabase:
   ```bash
   DB_DRIVER=supabase npm run build
   DB_DRIVER=supabase node dist/server.js
   ```
   You should see `Applied migration: 001_init.sql` (etc.). Stop the app.

2. **Verify the tables exist**:
   ```bash
   psql "$DATABASE_URL" -c '\dt'
   ```
   You should see `employees`, `sales_sessions`, `audit_log`, etc.

3. **Copy data from SQLite to Supabase** (one-time):
   ```bash
   npm run copy:supabase
   ```

4. **Copy uploaded files from disk to Supabase Storage** (one-time):
   ```bash
   npm run copy:uploads
   ```

5. **Flip the drivers** in `.env.local`:
   ```bash
   DB_DRIVER=supabase
   STORAGE_DRIVER=supabase
   ```

6. **Boot for real**: `npm start`. Click through the major flows (login, dashboard, add sale, upload an employee document, run a payroll, view reports). Confirm everything works end-to-end against Supabase.

The local `data/shop.db` and `data/uploads/` directory remain on disk as a backup. Roll back at any time by flipping the drivers back to `sqlite` / `local`.

## Troubleshooting

- **`prepared statement does not exist`** — you're using the transaction pooler. Switch to the direct connection or session pooler (port 5432, not 6543).
- **`connect ETIMEDOUT`** — your network blocks outbound 5432. Try the session pooler URI instead, which uses port 5432 over `pooler.supabase.com`.
- **`SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for supabase storage`** — you set `STORAGE_DRIVER=supabase` without filling in the Supabase API keys.
- **`permission denied for table employees`** — you used the `anon` key instead of `service_role`. Service-role bypasses RLS, anon does not.
- **Upload throws but DB row gets created** — check the bucket name matches `SUPABASE_STORAGE_BUCKET`. The upload silently 404s if the bucket doesn't exist.
