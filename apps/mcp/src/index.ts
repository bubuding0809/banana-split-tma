#!/usr/bin/env node

import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerChatTools } from "./tools/chat.js";
import { registerCurrencyTools } from "./tools/currency.js";
import { registerExpenseTools } from "./tools/expense.js";
import { registerSettlementTools } from "./tools/settlement.js";
import { registerSnapshotTools } from "./tools/snapshot.js";
import { createTrpcClient } from "./client.js";

// env.ts validates required vars and loads dotenv — import triggers validation
import { env } from "./env.js";

/**
 * Extracts the Bearer token from the Authorization header.
 * Returns null if the header is missing or malformed.
 */
function extractBearerToken(req: express.Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.slice(7).trim();
  return token.length > 0 ? token : null;
}

/**
 * Creates a fresh McpServer with all tools registered,
 * using a tRPC client authenticated with the given API key.
 */
function createMcpServerForRequest(apiKey: string): McpServer {
  const trpc = createTrpcClient(apiKey);
  const server = new McpServer({
    name: "banana-split-mcp-server",
    version: "1.0.0",
  });

  registerChatTools(server, trpc);
  registerCurrencyTools(server, trpc);
  registerExpenseTools(server, trpc);
  registerSettlementTools(server, trpc);
  registerSnapshotTools(server, trpc);

  return server;
}

const app = express();
app.use(express.json());

// Handle all MCP requests (POST, GET, DELETE) on /mcp
app.all("/mcp", async (req, res) => {
  const apiKey = extractBearerToken(req);
  if (!apiKey) {
    res.status(401).json({
      error: "Unauthorized",
      message:
        "Missing or malformed Authorization header. Expected: Bearer <api-key>",
    });
    return;
  }

  const server = createMcpServerForRequest(apiKey);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP request error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  } finally {
    await transport.close();
    await server.close();
  }
});

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "banana-split-mcp-server" });
});

app.listen(env.port, () => {
  console.log(
    `Banana Split MCP server listening on http://localhost:${env.port}/mcp`
  );
});
