#!/bin/bash
# Stop all Tailscale Funnels

# Note: no `set -e` — cleanup is best-effort. `funnel off` errors with
# "handler does not exist" when the funnel is already gone (or was never
# started on that port), which is fine during Ctrl-C teardown.

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

# Resolve the Tailscale CLI (see scripts/tunnel.sh for why the fallback exists)
MAC_APP_TAILSCALE="/Applications/Tailscale.app/Contents/MacOS/Tailscale"
if command -v tailscale &> /dev/null && tailscale version &> /dev/null; then
  TAILSCALE="tailscale"
elif [ -x "$MAC_APP_TAILSCALE" ]; then
  TAILSCALE="$MAC_APP_TAILSCALE"
else
  echo "Tailscale CLI not found — nothing to stop."
  exit 0
fi

echo -e "${BLUE}Stopping Tailscale Funnels...${NC}"
# Stop each funnel we started in scripts/tunnel.sh. Silence stderr so the
# "handler does not exist" message doesn't leak out on repeated teardown.
"$TAILSCALE" funnel --https=8081 off 2>/dev/null || true
"$TAILSCALE" funnel --https=8443 off 2>/dev/null || true
echo -e "${GREEN}Done!${NC}"
