#!/usr/bin/env bash
# One-shot install + seed + start for a customer demo machine.
#
# What it does:
#   1. Checks Node 18+ is installed (errors out with a helpful message if not)
#   2. Creates .env with a random SESSION_SECRET if one doesn't exist
#   3. Runs npm install (production deps only would skip vitest, but we want
#      it available so the developer can run tests if asked — full install)
#   4. Builds the TS to dist/ and the Tailwind CSS to public/css/app.css
#   5. Wipes any existing DB and seeds realistic demo data
#   6. Starts the production server (npm start)
#
# Usage from the project root:
#   ./bin/install-demo.sh
#
# Idempotent: re-running it asks before wiping the DB.

set -euo pipefail

# ─── 1. Prereq check ────────────────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required."
  echo "On macOS:   brew install node     (or download from https://nodejs.org)"
  echo "On Ubuntu:  sudo apt install nodejs npm"
  exit 1
fi

NODE_MAJOR=$(node -v | sed 's/^v//;s/\..*//')
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Node 18+ required. You have $(node -v)."
  echo "Update from https://nodejs.org or with nvm:  nvm install --lts && nvm use --lts"
  exit 1
fi

# ─── 2. Find project root + chdir ────────────────────────────────────────────
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# ─── 3. .env ────────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  echo "→ creating .env"
  cp .env.example .env
  SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  if [ "$(uname)" = "Darwin" ]; then
    sed -i '' "s|^SESSION_SECRET=.*|SESSION_SECRET=$SECRET|" .env
  else
    sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$SECRET|" .env
  fi
fi

# ─── 4. Install dependencies ─────────────────────────────────────────────────
echo "→ npm install"
npm install --no-audit --no-fund

# ─── 5. Build ───────────────────────────────────────────────────────────────
echo "→ build (typescript + tailwind)"
npm run build
npm run css:build

# ─── 6. Seed ────────────────────────────────────────────────────────────────
mkdir -p data
if [ -f data/shop.db ]; then
  read -r -p "→ existing data/shop.db found. Replace with demo data? [y/N] " yn
  if [[ "$yn" =~ ^[Yy] ]]; then
    npm run seed:demo
  else
    echo "  keeping existing database."
  fi
else
  echo "→ seed demo data"
  npm run seed:demo
fi

# ─── 7. Start ───────────────────────────────────────────────────────────────
cat <<EOF

══════════════════════════════════════════════════════════════════════
 Demo ready.

 Login credentials (all use password: demo123):
   • Owner    →  owner
   • Cashier  →  almaz
   • Cashier  →  hanna

 Tip: log in as the owner first to see the full nav,
      then open another browser window as a cashier to see the
      employee-side flow.
══════════════════════════════════════════════════════════════════════

EOF

exec npm start
