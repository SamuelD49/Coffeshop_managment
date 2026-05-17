#!/usr/bin/env bash
# Share the locally-running app with someone on the internet via a Cloudflare
# Tunnel. Prints a public https://*.trycloudflare.com URL you can text the
# client. No signup, no DNS, no firewall. Stops when you Ctrl+C.
#
# Usage:
#   npm run demo:share              # tunnels to http://localhost:3000
#   PORT=4000 npm run demo:share    # tunnels to a different local port
#
# Prerequisites:
#   1. The app is already running locally — open a second terminal and start it:
#        npm run dev      (development)
#        npm start        (production build)
#   2. `cloudflared` is installed. On macOS:  brew install cloudflared
#      Other platforms: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

set -e

PORT="${PORT:-3000}"
APP_URL="http://localhost:${PORT}"

# Friendly check: is cloudflared installed?
if ! command -v cloudflared >/dev/null 2>&1; then
  echo ""
  echo "  ⚠  cloudflared is not installed."
  echo ""
  echo "  Install it once with:"
  echo "      brew install cloudflared        (macOS)"
  echo "      sudo apt install cloudflared    (Debian/Ubuntu)"
  echo ""
  echo "  Other platforms:"
  echo "      https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
  echo ""
  exit 1
fi

# Friendly check: is the app actually running on that port?
if ! curl -s -o /dev/null -m 2 "${APP_URL}"; then
  echo ""
  echo "  ⚠  Nothing answering at ${APP_URL}."
  echo ""
  echo "  Open another terminal and start the app first:"
  echo "      npm run dev        (development, auto-reload)"
  echo "      npm start          (production build from dist/)"
  echo ""
  echo "  Then re-run:  npm run demo:share"
  echo ""
  exit 1
fi

echo ""
echo "  ☕  Opening a public doorway to ${APP_URL}…"
echo ""
echo "      • Look for a line like:    https://something-something.trycloudflare.com"
echo "      • Send that URL to the client — they open it in any browser."
echo "      • Login:                   owner / demo123"
echo "      • Stop sharing:            Ctrl+C in this terminal"
echo ""
echo "  Heads-up: anyone with the link can reach the app. Don't share it on"
echo "  social media, and consider changing the demo password before sharing."
echo ""

exec cloudflared tunnel --url "${APP_URL}"
