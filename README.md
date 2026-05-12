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

## Tests

```bash
npm test
```
