# Hosting on Render (free tier)

Free, no credit card required. Trade-off: the service spins down after 15 minutes of no traffic, so the first hit after an idle window takes ~30 seconds to wake up. For a shop tool with steady daytime traffic this is invisible; for sporadic use it can sting.

## One-time setup

### 1. Push the repo to GitHub

Already done — repo lives at https://github.com/SamuelD49/Coffeshop_managment.

### 2. Sign up at render.com

- Use your GitHub login. Render asks for repo access; grant read on this repo only.
- No card needed for the free plan.

### 3. Create the service via Blueprint

The repo has a `render.yaml` at the root that describes exactly what to deploy.

1. In the Render dashboard: **New +** → **Blueprint**.
2. Select the `Coffeshop_managment` repo.
3. Render reads `render.yaml`, shows a preview, and asks you to fill in 4 secret env vars:
   - `SESSION_SECRET` — generate a fresh one: `openssl rand -hex 32` (paste the output)
   - `DATABASE_URL` — same Session-pooler URI you have in `.env` locally
   - `SUPABASE_URL` — same as local
   - `SUPABASE_SERVICE_ROLE_KEY` — same as local
4. Click **Apply**.

Render will provision a free Node service in Frankfurt, run `npm install && npm run build && npm run css:build`, then `npm start`. First deploy takes ~3-5 minutes.

When it's green, you'll get a URL like `https://coffeshop-management.onrender.com`.

### 4. First-run setup

Visit the URL. The app redirects to `/setup` for the first owner account. Same flow as local.

## How updates work

Every push to `main` on GitHub triggers an auto-deploy. Build runs again, the old version stays up until the new one is healthy, then traffic flips. Zero downtime.

To trigger a manual deploy from the dashboard: **Manual Deploy → Deploy latest commit**.

## Things to know about the free tier

- **Spin-down after 15 minutes idle.** The first request after that waits ~30s for the container to boot. After that, fast until the next idle.
  - Workaround if it bothers you: a free uptime-monitor service (UptimeRobot etc.) that pings `/login` every 14 minutes during business hours.
- **750 free instance hours/month.** A single always-running service uses ~720. The free tier won't bill you for overages but the service won't actually stay up if you cross 750 — keep one service per repo.
- **Persistent disk: none.** Anything written to local fs is lost on restart. We don't write to local fs in production — uploads go to Supabase Storage and DB to Supabase Postgres — so this doesn't affect us.
- **Logs**: dashboard → Logs tab. Last 7 days retained.
- **Custom domain**: free plan supports custom domains. Add in dashboard → Settings → Custom Domains. Point your DNS at the value Render shows. Auto HTTPS via Let's Encrypt.

## Rolling back

Dashboard → Deploys → click a previous successful deploy → **Rollback to this deploy**.

## Cost projections

- **Free tier**: $0/mo as long as you stay within 750 instance-hours + the build-minute allowance. For a single shop this is sustainable indefinitely.
- **If you outgrow it**: $7/mo Starter plan removes the spin-down and gives more RAM. Same config, just flip the plan in `render.yaml` from `free` to `starter`.
