#!/bin/bash
# Start Tailscale Funnel for local development

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check if Tailscale is installed
if ! command -v tailscale &> /dev/null; then
  echo -e "${RED}Error: Tailscale is not installed.${NC}"
  echo -e "Install with: ${BLUE}brew install tailscale${NC}"
  exit 1
fi

# Check if Tailscale is running
if ! tailscale status &> /dev/null; then
  echo -e "${YELLOW}Error: Tailscale not running. Run 'tailscale up' first.${NC}"
  exit 1
fi

# Get machine name for URLs
MACHINE_NAME=$(tailscale status --json | jq -r '.Self.DNSName' | sed 's/\.$//')

if [ -z "$MACHINE_NAME" ] || [ "$MACHINE_NAME" = "null" ]; then
  echo -e "${RED}Error: Could not get Tailscale DNS name.${NC}"
  echo -e "Make sure Tailscale is running: ${BLUE}tailscale up${NC}"
  exit 1
fi

echo -e "${BLUE}Starting Tailscale Funnel...${NC}"
echo -e "Machine: ${MACHINE_NAME}\n"

# Start backend funnel on port 8081 (maps to localhost:8081)
echo -e "Starting backend tunnel (8081 -> 8081)..."
tailscale funnel --bg --https=8081 http://localhost:8081

# Start frontend funnel on port 8443 (maps to localhost:5173)
echo -e "Starting frontend tunnel (5173 -> 8443)..."
tailscale funnel --bg --https=8443 http://localhost:5173

# Display URLs
BACKEND_URL="https://${MACHINE_NAME}:8081"
FRONTEND_URL="https://${MACHINE_NAME}:8443"

echo -e "\n${GREEN}Tunnels Ready!${NC}"
echo -e "Frontend: ${FRONTEND_URL}"
echo -e "Backend:  ${BACKEND_URL}"
echo -e "API:      ${BACKEND_URL}/api/trpc"
echo -e "\n${YELLOW}These URLs are persistent - they won't change on restart!${NC}"
echo -e "\nTo stop tunnels: ${BLUE}pnpm tunnel:stop${NC}"
