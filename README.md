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
