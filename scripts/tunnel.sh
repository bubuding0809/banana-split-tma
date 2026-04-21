#!/bin/bash
# Start Tailscale Funnel for local development

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Resolve the Tailscale CLI: prefer the one on PATH, fall back to the Mac App
# Store binary. (A bare symlink to the Mac app binary doesn't work — it fails
# the bundle-identifier check — so we keep the real path handy.)
MAC_APP_TAILSCALE="/Applications/Tailscale.app/Contents/MacOS/Tailscale"
TAILSCALE=""
if command -v tailscale &> /dev/null && tailscale version &> /dev/null; then
  TAILSCALE="tailscale"
elif [ -x "$MAC_APP_TAILSCALE" ] && "$MAC_APP_TAILSCALE" version &> /dev/null; then
  TAILSCALE="$MAC_APP_TAILSCALE"
else
  echo -e "${RED}Error: Tailscale is not installed (or its CLI is broken).${NC}"
  echo -e "Install via the Mac App Store, or: ${BLUE}brew install tailscale${NC}"
  exit 1
fi

# Check if Tailscale is running
if ! "$TAILSCALE" status &> /dev/null; then
  echo -e "${YELLOW}Error: Tailscale not running. Run 'tailscale up' first.${NC}"
  exit 1
fi

# Get machine name for URLs
MACHINE_NAME=$("$TAILSCALE" status --json | jq -r '.Self.DNSName' | sed 's/\.$//')

if [ -z "$MACHINE_NAME" ] || [ "$MACHINE_NAME" = "null" ]; then
  echo -e "${RED}Error: Could not get Tailscale DNS name.${NC}"
  echo -e "Make sure Tailscale is running: ${BLUE}tailscale up${NC}"
  exit 1
fi

echo -e "${BLUE}Starting Tailscale Funnel...${NC}"
echo -e "Machine: ${MACHINE_NAME}\n"

# Start backend funnel on port 10000 (maps to localhost:8081).
# Tailscale Funnel only exposes three public ports externally: 443, 8443, 10000.
# Using 8081 works on-tailnet (desktop/laptop) but phones on cellular or other
# networks can't reach it — their API calls hang forever. 10000 is reachable
# from any network.
echo -e "Starting backend tunnel (10000 -> localhost:8081)..."
"$TAILSCALE" funnel --bg --https=10000 http://localhost:8081

# Start frontend funnel on port 8443 (maps to localhost:5173)
echo -e "Starting frontend tunnel (5173 -> 8443)..."
"$TAILSCALE" funnel --bg --https=8443 http://localhost:5173

# Display URLs
BACKEND_URL="https://${MACHINE_NAME}:10000"
FRONTEND_URL="https://${MACHINE_NAME}:8443"

echo -e "\n${GREEN}Tunnels Ready!${NC}"
echo -e "Frontend: ${FRONTEND_URL}"
echo -e "Backend:  ${BACKEND_URL}"
echo -e "API:      ${BACKEND_URL}/api/trpc"
echo -e "\n${YELLOW}These URLs are persistent - they won't change on restart!${NC}"
echo -e "\nTo stop tunnels: ${BLUE}pnpm tunnel:stop${NC}"
