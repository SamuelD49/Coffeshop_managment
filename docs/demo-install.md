# Demo install (for a developer setting up a customer machine)

One command from this directory gets the app running with realistic seed data on a clean Mac or Linux box. The customer can open `http://localhost:3000`, log in, and start poking around immediately.

## Prereqs the customer machine needs

- **Node.js 18+** (we use 20 LTS in dev). On macOS: `brew install node`. On Ubuntu: `sudo apt install nodejs npm`.
- A **terminal** to run one command.

That's it. No global packages, no Postgres, no Docker.

## The one command

From the project root:

```bash
npm run install:demo
```

What that runs (via `bin/install-demo.sh`):

1. Verifies Node 18+ is present
2. Creates `.env` with a random `SESSION_SECRET` if it doesn't exist
3. `npm install`
4. `npm run build` (TypeScript → `dist/`)
5. `npm run css:build` (Tailwind → `public/css/app.css`)
6. **Seeds demo data** — wipes any existing `data/shop.db` and replaces it with fresh realistic content (see below)
7. `npm start` — starts the production server

The shell stays in the foreground running the server. Hit `Ctrl+C` to stop. Re-running `npm run install:demo` is safe — it asks before wiping an existing DB.

## What gets seeded

- **Shop**: "Buna Counter", currency Br (ETB)
- **3 users**:
  - `owner` — Solomon Tesfaye, Owner role, full access
  - `almaz` — Almaz Bekele, Barista
  - `hanna` — Hanna Mekonnen, Cashier
  - **All passwords: `demo123`**
- **27 menu items** matching the original paper Daily Sales Income form (Macchiato, Latte, Cappuccino, Iced caramel, Roasted coffee 1 kg, …) with a mix of auto + chosen token colours
- **14 days of sales sessions** (2 per day, one per cashier, mostly closed with one open today)
- **30 days of purchases** (beans, milk, sugar, cups, cleaning supplies, flour)
- **10+ petty cash movements** including a starting float and a top-up
- **One approved payroll run** for last month — Almaz got a 500 birr bonus, Hanna got a 150 birr penalty, both have realistic pension + tax math applied

So the customer can immediately:

- See the dashboard with real 7-day sales charts and trending items
- Click through to a closed sales entry and look at the buna jar visuals
- Open the open sales entry as `hanna` and drop tokens to add line items
- Open the menu, toggle a colour, watch the change ripple through
- Open the payroll run, see the snapshot rates, bonus, penalty, approve/reopen
- Look at reports with monthly bar charts populated

## Demo script (suggested flow, 5 minutes)

1. Log in as `owner` / `demo123`. Walk through the dashboard — point out the last-7-days chart, the trending items.
2. Click **Sales** → open today's record. Open another tab, log in as `almaz` to show the cashier-side view (same record, can only edit if it's their own + open).
3. Back as owner: visit **Menu** → edit a product → pick a colour → save. Open Sales entry to see the new colour on the button + jar.
4. Visit **Employees** → click into a profile to show the tabs (Personal, Documents, Guarantors, Employment, Payroll history).
5. Visit **Payroll** → open last month's approved run → click **Reopen** → bump a `Days` number → watch the gross/pension/net recompute live → re-approve. Then **Print** to show the print sheet with their signature (saved in Settings).
6. Visit **Reports** → flip between the four tabs → download a CSV.
7. Visit **Settings** → show the signature pad, the backups list, the payroll rate defaults.

## What if the customer's Node is too old?

`install-demo.sh` errors out cleanly with the install command for both macOS and Ubuntu. Quick fix:

```bash
# macOS
brew install node
# or use nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm install --lts && nvm use --lts
```

## What if the demo machine has no internet?

`npm install` needs internet for the first install. Once installed, the app works offline. If the customer machine is offline at install time, bring a pre-built bundle:

```bash
# On a machine with internet:
npm install
npm run build
npm run css:build
tar czf coffeeshop-demo.tar.gz . --exclude=node_modules/.cache --exclude=data
```

Ship `coffeeshop-demo.tar.gz` to the customer machine, extract, then:

```bash
npm install --offline    # uses the bundled node_modules in the tarball
npm run seed:demo
npm start
```

(Yes, the tarball includes `node_modules` — that's the point. ~250 MB.)

## Removing the demo, returning to a clean slate

```bash
rm -rf data
npm run seed:demo      # fresh demo data
# or
npm run dev            # blank slate, fires /setup on first visit
```

`data/` is gitignored so you can delete it any time without affecting source.
