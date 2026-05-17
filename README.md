# Coffee Shop Management

Local-first management system for a coffee shop. See [the design spec](docs/superpowers/specs/2026-05-12-coffee-shop-management-design.md) for what it does.

## Quick start (development)

```bash
cp .env.example .env
npm install
npm run css:build       # one-time, builds Tailwind output
npm run dev             # starts on http://localhost:3000
```

First visit redirects to `/setup` to create the owner account.

## Demo install (one command)

For a customer demo on a clean machine, one command sets everything up with realistic seed data:

```bash
npm run install:demo
```

Login as `owner` / `demo123` (full nav) or `almaz` / `demo123` (cashier view). Full walkthrough + suggested 5-minute demo script in **[docs/demo-install.md](docs/demo-install.md)**.

## Production on the shop PC

```bash
npm run css:build
npm run build           # compiles TS to ./dist
npm start               # runs dist/server.js
```

The startup log prints every URL the app is reachable at — `localhost`, the LAN IP, and (when Tailscale is installed) the tailnet IP.

To auto-start the app at login + restart on crash + log to `data/logs/`, install the launchd plist. See **[docs/remote-access.md](docs/remote-access.md)** for the full setup, plus three ways to reach the app from outside the shop (Tailscale recommended).

## Tests

```bash
npm test
```

## Database & storage backends

The app supports two backends, switched via env vars:

- **`DB_DRIVER=sqlite`** (default) — local `data/shop.db` via better-sqlite3. No setup needed.
- **`DB_DRIVER=supabase`** — Supabase Postgres. Requires `DATABASE_URL` (the **direct** or **session pooler** URI; **not** the transaction pooler — that breaks Kysely's prepared statements).

Files:

- **`STORAGE_DRIVER=local`** (default) — uploads live under `data/uploads/`.
- **`STORAGE_DRIVER=supabase`** — uploads live in Supabase Storage. Requires `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_STORAGE_BUCKET` (default: `coffeshop`).

Schema migrations are dialect-aware (`migrations/sqlite/` vs `migrations/postgres/`) and applied automatically at boot.

### Migrating an existing install to Supabase

Full operator checklist with click-by-click setup: [`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md).

Short version:

1. Create a Supabase project + private storage bucket. Fill in `.env.local` (see `.env.example`).
2. Boot once with `DB_DRIVER=supabase` to apply migrations: `DB_DRIVER=supabase npm run build && DB_DRIVER=supabase node dist/server.js`. Stop the app.
3. Copy data: `npm run copy:supabase`.
4. Copy uploaded files: `npm run copy:uploads`.
5. Set both drivers to `supabase` in `.env.local`. Start the app.

The local `data/shop.db` and `data/uploads/` directory stay on disk as a backup. Roll back by flipping the drivers back to `sqlite` / `local`.

Nightly backup cron is a no-op under `DB_DRIVER=supabase` — Supabase handles PITR + daily snapshots server-side.
