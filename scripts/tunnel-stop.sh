#!/bin/bash
# Stop all Tailscale Funnels

set -e

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
"$TAILSCALE" funnel off
echo -e "${GREEN}Done!${NC}"
