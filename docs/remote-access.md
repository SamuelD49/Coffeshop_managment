# Remote access to the shop app

The app runs on a PC at the shop. By default it's reachable only on the shop's local network — that's by design (offline-tolerant, no monthly hosting cost, no public exposure). This doc covers three ways to also reach it from elsewhere (your home, your phone over cellular, a relative's house).

| Option | Cost | Setup time | Internet at shop? | Recommended for |
|---|---|---|---|---|
| **A. Tailscale** (recommended) | Free | ~5 min | No (only when you want remote access) | Single shop, single owner |
| **B. Cloudflare Tunnel** | Free | ~20 min | Yes (constant) | Want a public URL like `myshop.example.com` |
| **C. Move to cloud** (Plan 7) | $0–25 / month | Days | Yes (constant) | Multiple locations, customer-facing features |

Tailscale wins for one shop because it doesn't change the app at all, doesn't expose anything publicly, and the shop can keep working offline. The other two are listed in case you outgrow it.

---

## A. Tailscale — recommended

Tailscale creates a private encrypted network ("tailnet") between your devices. The shop PC and your phone/laptop join the same tailnet and get stable addresses they can reach each other on — even when one is at home and the other is at the shop. No port forwarding, no public DNS, no exposing the app to the open internet.

### One-time setup on the shop PC (Mac)

```bash
# 1. Install Tailscale
brew install --cask tailscale
# Then launch the Tailscale app once from Applications. Sign in with Google / GitHub / email.

# (Or via CLI on Linux/Windows:  https://tailscale.com/download)

# 2. Confirm the shop PC has a tailnet IP and a hostname
tailscale ip -4         # → 100.x.y.z
tailscale status        # shows the hostname and other devices on the tailnet
```

Note the hostname — it'll be something like `samuels-mac` by default. You can rename it in the Tailscale admin: <https://login.tailscale.com/admin/machines>. A name like `shop-pc` is friendlier.

### One-time setup on every device that needs to reach the shop

- **iPhone / iPad** — install the Tailscale app from the App Store. Sign in with the same account.
- **Android** — Tailscale app on Play Store. Same account.
- **Other laptop** — `brew install --cask tailscale` or download from <https://tailscale.com/download>.

Each device shows up in your tailnet automatically once it's signed in.

### Day-to-day use

Once Tailscale is running on both ends, open this URL from your phone or laptop:

```
http://shop-pc:3000
```

(Replacing `shop-pc` with whatever you named the shop machine.) Tailscale's "MagicDNS" makes those hostnames resolve from any tailnet device automatically — no need to remember the 100.x.y.z address.

If MagicDNS isn't enabled, use the IP form: `http://100.x.y.z:3000`. Enable MagicDNS in the admin console (Settings → DNS) for nicer URLs.

### What the shop PC needs to be doing

- Tailscale needs to be **running**. On macOS it auto-starts on login by default.
- The app server needs to be **running** — see the next section, "Auto-start the app on boot".
- The shop PC needs to be **awake**. If the Mac sleeps overnight, the app sleeps with it. Easiest fix: System Settings → Battery → Options → "Prevent automatic sleeping on power adapter when the display is off".

### Security notes

- Traffic is end-to-end encrypted by Tailscale (WireGuard underneath).
- No port is exposed to the public internet. The router doesn't need any changes.
- The app's own auth (bcrypt sessions, CSRF, owner gates) still applies.
- Tailscale's free tier covers 100 devices and 3 users — plenty for one shop.

---

## B. Cloudflare Tunnel (alternative)

Gives you a public URL like `myshop.example.com` that anyone with a browser can hit. You'd want this if:

- You want a stable web address you can share or print on receipts.
- You want to access the app from a device that *can't* run Tailscale (e.g., a tax accountant's machine).

Trade-offs vs. Tailscale:

- Requires owning a domain and adding it to Cloudflare (free tier).
- Requires the shop's internet to be up — the tunnel goes through Cloudflare's edge.
- Anyone who learns the URL will see your login page (still protected by the app's auth, but visible). Add Cloudflare Access on top if you want extra gating.

Setup: <https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/create-local-tunnel/>. Briefly: install `cloudflared` on the shop PC, run `cloudflared tunnel login`, create a tunnel, point a DNS record at it, run `cloudflared tunnel run` pointing at `http://localhost:3000`. Wrap in launchd or systemd to auto-start.

---

## C. Move to actual cloud hosting (Plan 7)

The deferred Supabase migration. Real cost (free tier exists, paid tier ~$25/mo for small data). Real ops responsibility (backups, uptime monitoring). Real audit-trail upgrade (every action logged to Supabase, replicated).

This is documented in [the design spec](superpowers/specs/2026-05-12-coffee-shop-management-design.md#v2--supabase-migration-plan) under §v2. Out of scope for now — only pick this when you outgrow the single-shop model.

---

## Auto-start the app on boot (macOS launchd)

So you don't have to manually open Terminal and run `npm run dev` every time the Mac reboots.

### 1. Build the production bundle once

```bash
cd /Users/sam/Desktop/Coffeshop_managment
npm run css:build
npm run build          # produces ./dist/server.js
```

### 2. Install the launchd plist

Copy [`ops/com.coffeeshop.app.plist`](../ops/com.coffeeshop.app.plist) (in this repo) to `~/Library/LaunchAgents/`, then load it:

```bash
mkdir -p ~/Library/LaunchAgents
cp ops/com.coffeeshop.app.plist ~/Library/LaunchAgents/
launchctl load -w ~/Library/LaunchAgents/com.coffeeshop.app.plist
```

The plist is configured to:

- Run at user login (so the app starts whenever the Mac signs in).
- Restart automatically if the process crashes.
- Write stdout to `data/logs/app.log` and stderr to `data/logs/app.err.log`.
- Use the absolute project path — edit the `<string>` values inside the plist if the project moves.

### 3. Verify

```bash
launchctl list | grep coffeeshop          # should show the agent
curl http://localhost:3000/health         # should return {"ok":true}
tail -f data/logs/app.log                 # live log
```

### 4. Updating the app

After pulling new code:

```bash
npm install                                # if dependencies changed
npm run build && npm run css:build
launchctl kickstart -k gui/$(id -u)/com.coffeeshop.app   # restart the agent cleanly
```

### 5. Removing the auto-start

```bash
launchctl unload -w ~/Library/LaunchAgents/com.coffeeshop.app.plist
rm ~/Library/LaunchAgents/com.coffeeshop.app.plist
```

---

## Operational checklist for "I want to check sales from home"

1. ✅ App auto-starts on the shop PC at boot (launchd plist installed).
2. ✅ Tailscale running on the shop PC (auto-starts at login).
3. ✅ Shop PC doesn't sleep when display turns off (System Settings → Battery → Options).
4. ✅ Tailscale running on your phone / laptop.
5. ✅ You know the shop PC's tailnet hostname (e.g., `shop-pc`).

Then from anywhere with internet: `http://shop-pc:3000` → login → review sales / payroll / petty cash / reports.
