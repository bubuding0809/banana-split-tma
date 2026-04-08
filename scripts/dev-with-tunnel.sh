#!/bin/bash

# Cleanup function to stop tunnels when this script exits
cleanup() {
  echo ""
  bash scripts/tunnel-stop.sh
}

# Trap exit signals (including Ctrl+C) to ensure cleanup runs
trap cleanup EXIT INT TERM

# Start tunnels
bash scripts/tunnel.sh

# Run the dev server in the foreground
# We don't use 'exec' here because we want the trap to fire after turbo exits
turbo dev --filter=!banana-split-mcp-server
