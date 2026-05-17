# Hosting on Vercel

Free tier, no credit card. Trade-offs vs Render/Fly: serverless cold starts (~1-3 sec), no long-running process for crons (Supabase cron handles that anyway), 4.5MB request body cap (limits big photo uploads).

## One-time setup

### 1. Sign up at vercel.com

GitHub login. Grant repo access on `Coffeshop_managment` only.

### 2. Import the project

1. Vercel dashboard → **Add New… → Project**.
2. Pick the `Coffeshop_managment` repo.
3. Vercel auto-detects `vercel.json`. Framework should show as **"Other"**.
4. Expand **Environment Variables** and add these 7. Same values as your local `.env`:

   | Key | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `DB_DRIVER` | `supabase` |
   | `STORAGE_DRIVER` | `supabase` |
   | `SUPABASE_STORAGE_BUCKET` | `coffeeshop` |
   | `SESSION_SECRET` | generate fresh: `openssl rand -hex 32` |
   | `DATABASE_URL` | your Session-pooler URI |
   | `SUPABASE_URL` | from `.env` |
   | `SUPABASE_SERVICE_ROLE_KEY` | from `.env` |

5. Click **Deploy**.

First deploy: ~2-3 min. When green, click the URL Vercel gives you — something like `coffeshop-managment.vercel.app`.

## How updates work

Every push to `main` triggers a preview/production deploy. Vercel keeps the previous version up until the new one is healthy. No downtime.

## What you'll feel different vs local

- **Cold starts.** A function that hasn't been hit for ~10 minutes takes ~1-3 sec on the next request. After that, fast until the next idle. Render's free was 30s; Vercel is much better but not zero.
- **Caches don't persist.** My recent `Settings` cache and report memoizer assume one long-running process. On Vercel, each function instance has its own cache — across many instances during a traffic spike, you'll see more raw DB queries than locally. For a single-shop traffic pattern this is barely noticeable.
- **No background cron.** The nightly backup cron in `server.ts` doesn't run on Vercel — and it's already a no-op when `DB_DRIVER=supabase` (Supabase handles backups). So this is fine.
- **Photo uploads >4MB will 413.** Vercel Hobby has a 4.5MB request body cap. The multer limit in code is 5MB, but Vercel rejects the request before it reaches multer. For ID-card / contract scans this is rarely a problem; for high-res phone photos it can be. The fix when you hit it: client-side compress before upload.

## Custom domain

Project → **Settings → Domains → Add**. Point your DNS at the value Vercel shows. Auto HTTPS via Let's Encrypt.

## Logs

Project → **Logs** tab (or **Functions** for per-invocation). Last 4 hours retained on free; longer on paid.

## Rolling back

Project → **Deployments** → click an older deploy → **Promote to Production**.

## Cost projections

- **Free (Hobby)**: 100 GB-hours/mo of function execution and 100GB bandwidth. For a single shop's traffic, you'll use a fraction of either. Cost: $0.
- **If you outgrow it**: Pro plan is $20/mo. Almost certainly not needed.
