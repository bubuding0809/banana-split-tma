#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerChatTools } from "./tools/chat.js";
import { registerCurrencyTools } from "./tools/currency.js";
import { registerExpenseTools } from "./tools/expense.js";
import { registerSettlementTools } from "./tools/settlement.js";
import { registerSnapshotTools } from "./tools/snapshot.js";
import { getScope } from "./scope.js";

// env.ts validates and exits if vars are missing - import triggers validation
import "./env.js";

const server = new McpServer({
  name: "banana-split-mcp-server",
  version: "1.0.0",
});

// Register all tool groups
registerChatTools(server);
registerCurrencyTools(server);
registerExpenseTools(server);
registerSettlementTools(server);
registerSnapshotTools(server);

// Start stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Detect scope after connection (non-blocking — scope is lazy-cached on first tool call)
  const scope = await getScope();
  if (scope.scoped) {
    console.error(
      `Banana Split MCP server running via stdio (scoped to chat: "${scope.chatTitle}" [${scope.chatId}])`
    );
  } else {
    console.error(
      "Banana Split MCP server running via stdio (superadmin — unrestricted)"
    );
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
