#!/bin/bash
# Stop all Tailscale Funnels

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Stopping Tailscale Funnels...${NC}"
tailscale funnel off
echo -e "${GREEN}Done!${NC}"
