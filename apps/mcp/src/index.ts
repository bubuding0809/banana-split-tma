#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerChatTools } from "./tools/chat.js";

// env.ts validates and exits if vars are missing - import triggers validation
import "./env.js";

const server = new McpServer({
  name: "banana-split-mcp-server",
  version: "1.0.0",
});

// Register all tool groups
registerChatTools(server);

// Start stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Banana Split MCP server running via stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
