# MCP Remote Server Conversion — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert the MCP server from stdio to a remote HTTP server with Bearer token auth, matching Vercel/Supabase MCP patterns.

**Architecture:** Stateless HTTP server using Express + StreamableHTTPServerTransport. Each request extracts the Bearer token, creates a fresh McpServer with per-request tRPC client, handles the MCP request, and responds. No session state persisted.

**Tech Stack:** Express, @modelcontextprotocol/sdk (StreamableHTTPServerTransport), dotenv, tRPC client

**Design doc:** `docs/plans/2026-03-10-mcp-remote-server-design.md`

**Commit convention:** Use `--no-verify` on all commits (pre-existing type errors in `apps/web` unrelated to this scope).

---

### Task 1: Add Dependencies

**Files:**

- Modify: `apps/mcp/package.json`

**Step 1: Install express, @types/express, dotenv**

Run from repo root:

```bash
pnpm add express dotenv --filter banana-split-mcp-server
pnpm add -D @types/express --filter banana-split-mcp-server
```

**Step 2: Verify package.json updated**

Check `apps/mcp/package.json` has `express`, `dotenv` in dependencies and `@types/express` in devDependencies.

**Step 3: Commit**

```bash
git add apps/mcp/package.json pnpm-lock.yaml
git commit --no-verify -m "chore(mcp): add express and dotenv dependencies"
```

---

### Task 2: Create Environment Files

**Files:**

- Create: `apps/mcp/.env.development`
- Create: `apps/mcp/.env.production`
- Modify: `apps/mcp/.gitignore` (create if doesn't exist)

**Step 1: Create `.env.development`**

```
BANANA_SPLIT_API_URL=http://localhost:8081/api/trpc
MCP_PORT=8082
```

**Step 2: Create `.env.production`**

```
BANANA_SPLIT_API_URL=https://api.bananasplit.app/api/trpc
MCP_PORT=8082
```

**Step 3: Ensure .env files are NOT gitignored**

These env files contain no secrets (API keys come from the Bearer header), so they can be committed. Verify they are not in any `.gitignore`.

**Step 4: Commit**

```bash
git add apps/mcp/.env.development apps/mcp/.env.production
git commit --no-verify -m "chore(mcp): add environment config files for dev and prod"
```

---

### Task 3: Refactor `env.ts` — Drop API Key Requirement

**Files:**

- Modify: `apps/mcp/src/env.ts`

**Step 1: Update env.ts**

Replace the entire file with:

```typescript
import dotenv from "dotenv";
import path from "node:path";

// Load environment-specific .env file
const envFile =
  process.env.NODE_ENV === "production"
    ? ".env.production"
    : ".env.development";

dotenv.config({ path: path.resolve(import.meta.dirname, "..", envFile) });

const apiUrl = process.env.BANANA_SPLIT_API_URL;
const port = process.env.MCP_PORT ? parseInt(process.env.MCP_PORT, 10) : 8082;

if (!apiUrl) {
  console.error(
    "ERROR: BANANA_SPLIT_API_URL environment variable is required.\n" +
      "Set it in .env.development or .env.production"
  );
  process.exit(1);
}

export const env = {
  apiUrl,
  port,
} as const;
```

Key changes:

- Loads dotenv with environment-specific file
- `BANANA_SPLIT_API_KEY` removed (comes from Authorization header now)
- Added `port` from `MCP_PORT` env var (default 8082)

**Step 2: Verify types**

Run: `pnpm check-types --filter banana-split-mcp-server`

This WILL fail because `client.ts` and other files still reference `env.apiKey`. That's expected — we fix them in the next tasks.

**Step 3: Commit**

```bash
git add apps/mcp/src/env.ts
git commit --no-verify -m "refactor(mcp): remove api key from env, add dotenv with env-specific files"
```

---

### Task 4: Refactor `client.ts` — Singleton to Factory

**Files:**

- Modify: `apps/mcp/src/client.ts`

**Step 1: Rewrite client.ts**

Replace the entire file with:

```typescript
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { env } from "./env.js";
import type { AppRouter } from "@dko/trpc";

/** The tRPC client type for dependency injection into tools. */
export type TrpcClient = ReturnType<typeof createTrpcClient>;

/** Creates a tRPC client authenticated with the given API key. */
export function createTrpcClient(apiKey: string) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: env.apiUrl,
        transformer: superjson,
        headers() {
          return {
            "x-api-key": apiKey,
          };
        },
      }),
    ],
  });
}
```

Key changes:

- Export `TrpcClient` type for use in tool signatures
- Export `createTrpcClient(apiKey)` factory instead of singleton `trpc`
- `apiKey` parameter instead of reading from `env.apiKey`

**Step 2: Commit**

```bash
git add apps/mcp/src/client.ts
git commit --no-verify -m "refactor(mcp): convert tRPC client from singleton to factory"
```

---

### Task 5: Refactor `scope.ts` — Accept Client Parameter

**Files:**

- Modify: `apps/mcp/src/scope.ts`

**Step 1: Rewrite scope.ts**

Replace the entire file with:

```typescript
import type { TrpcClient } from "./client.js";

interface Scope {
  scoped: boolean;
  chatId: number | null;
  chatTitle: string | null;
}

/**
 * Fetches the API key scope from the backend.
 * Chat-scoped keys return { scoped: true, chatId, chatTitle }.
 * Superadmin keys return { scoped: false, chatId: null, chatTitle: null }.
 */
export async function getScope(trpc: TrpcClient): Promise<Scope> {
  try {
    const result = await trpc.apiKey.getScope.query();

    if (result.scoped) {
      return {
        scoped: true,
        chatId: result.chatId,
        chatTitle: result.chatTitle,
      };
    } else {
      return {
        scoped: false,
        chatId: null,
        chatTitle: null,
      };
    }
  } catch {
    console.error(
      "Warning: Could not determine API key scope. Assuming unscoped (superadmin)."
    );
    return { scoped: false, chatId: null, chatTitle: null };
  }
}

/**
 * Resolves the chat_id for a tool call.
 * If scoped, returns the scoped chatId (ignoring any user-provided value).
 * If unscoped, returns the user-provided chatId or throws.
 */
export async function resolveChatId(
  trpc: TrpcClient,
  userProvidedChatId?: number
): Promise<number> {
  const scope = await getScope(trpc);

  if (scope.scoped && scope.chatId !== null) {
    return scope.chatId;
  }

  if (userProvidedChatId === undefined) {
    throw new Error(
      "chat_id is required. This API key is not scoped to a specific chat."
    );
  }

  return userProvidedChatId;
}
```

Key changes:

- Removed singleton cache (`cachedScope`)
- `getScope()` and `resolveChatId()` take `trpc: TrpcClient` as first parameter
- No module-level imports of the client

**Step 2: Commit**

```bash
git add apps/mcp/src/scope.ts
git commit --no-verify -m "refactor(mcp): scope functions accept tRPC client parameter"
```

---

### Task 6: Refactor Tool Files — Accept Client Parameter

**Files:**

- Modify: `apps/mcp/src/tools/chat.ts`
- Modify: `apps/mcp/src/tools/expense.ts`
- Modify: `apps/mcp/src/tools/settlement.ts`
- Modify: `apps/mcp/src/tools/currency.ts`
- Modify: `apps/mcp/src/tools/snapshot.ts`

For each file, apply the same pattern:

1. Remove `import { trpc } from "../client.js";`
2. Add `import type { TrpcClient } from "../client.js";`
3. Change function signature from `register*Tools(server: McpServer)` to `register*Tools(server: McpServer, trpc: TrpcClient)`
4. For files using scope: change `resolveChatId(chat_id)` → `resolveChatId(trpc, chat_id)` and `getScope()` → `getScope(trpc)`

**Step 1: Update `chat.ts`**

```typescript
// Line 1-6: Change imports
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TrpcClient } from "../client.js";
import { toolHandler } from "./utils.js";
import { getScope, resolveChatId } from "../scope.js";

// Line 7: Change signature
export function registerChatTools(server: McpServer, trpc: TrpcClient) {
```

Then in every handler:

- `getScope()` → `getScope(trpc)` (line 35)
- `resolveChatId(chat_id)` → `resolveChatId(trpc, chat_id)` (lines 94, 146, 206, 273)

**Step 2: Update `expense.ts`**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TrpcClient } from "../client.js";
import { toolHandler } from "./utils.js";
import { resolveChatId } from "../scope.js";

export function registerExpenseTools(server: McpServer, trpc: TrpcClient) {
```

Then: `resolveChatId(chat_id)` → `resolveChatId(trpc, chat_id)` in all handlers.

**Step 3: Update `settlement.ts`**

Same pattern. Change imports, signature, and `resolveChatId` calls.

**Step 4: Update `currency.ts`**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TrpcClient } from "../client.js";
import { toolHandler } from "./utils.js";

export function registerCurrencyTools(server: McpServer, trpc: TrpcClient) {
```

No `resolveChatId` calls — just update the `trpc.*` calls which already work via closure.

**Step 5: Update `snapshot.ts`**

Same pattern as expense/settlement.

**Step 6: Verify types compile**

Run: `pnpm check-types --filter banana-split-mcp-server`

This will still fail because `index.ts` hasn't been updated yet. But the tool files themselves should have no type errors against the new signatures.

**Step 7: Commit**

```bash
git add apps/mcp/src/tools/
git commit --no-verify -m "refactor(mcp): tool registration functions accept tRPC client parameter"
```

---

### Task 7: Rewrite `index.ts` — Express + StreamableHTTP

**Files:**

- Modify: `apps/mcp/src/index.ts`

**Step 1: Rewrite index.ts**

Replace the entire file with:

```typescript
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

  try {
    const server = createMcpServerForRequest(apiKey);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    await transport.close();
    await server.close();
  } catch (error) {
    console.error("MCP request error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
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
```

**Step 2: Verify types compile**

Run: `pnpm check-types --filter banana-split-mcp-server`

Expected: PASS (all files now use the new signatures).

**Step 3: Commit**

```bash
git add apps/mcp/src/index.ts
git commit --no-verify -m "feat(mcp): convert to remote HTTP server with StreamableHTTP transport"
```

---

### Task 8: Update `package.json` Scripts

**Files:**

- Modify: `apps/mcp/package.json`

**Step 1: Update scripts**

Change the `scripts` section:

```json
{
  "scripts": {
    "start": "NODE_ENV=production node dist/index.js",
    "dev": "NODE_ENV=development tsx src/index.ts",
    "test:e2e:basic": "tsx tests/e2e-basic.ts",
    "test:e2e:comprehensive": "tsx tests/e2e-comprehensive.ts",
    "build": "tsc",
    "check-types": "tsc --noEmit"
  }
}
```

Key change: `NODE_ENV` prefix so dotenv loads the correct `.env.*` file.

**Step 2: Commit**

```bash
git add apps/mcp/package.json
git commit --no-verify -m "chore(mcp): update scripts with NODE_ENV for env file loading"
```

---

### Task 9: Update `opencode.json`

**Files:**

- Modify: `opencode.json` (repo root)

**Step 1: Update bananasplit config**

Change the `bananasplit` section from local to remote:

```json
"bananasplit": {
  "type": "remote",
  "url": "http://localhost:8082/mcp",
  "oauth": false,
  "headers": {
    "Authorization": "Bearer {env:BANANA_SPLIT_API_KEY}"
  }
}
```

**Step 2: Commit**

```bash
git add opencode.json
git commit --no-verify -m "chore: update opencode.json to use remote MCP server with bearer auth"
```

---

### Task 10: Build, Run, and Smoke Test

**Step 1: Build the MCP server**

Run: `pnpm build --filter banana-split-mcp-server`

Expected: PASS — TypeScript compiles to `apps/mcp/dist/`.

**Step 2: Start the MCP server**

Run: `pnpm dev --filter banana-split-mcp-server`

Expected: Console output `Banana Split MCP server listening on http://localhost:8082/mcp`

**Step 3: Test health endpoint**

```bash
curl http://localhost:8082/health
```

Expected: `{"status":"ok","service":"banana-split-mcp-server"}`

**Step 4: Test 401 without auth**

```bash
curl -X POST http://localhost:8082/mcp -H "Content-Type: application/json" -d '{}'
```

Expected: `{"error":"Unauthorized","message":"Missing or malformed Authorization header..."}`

**Step 5: Test MCP request with Bearer token**

(Requires the Lambda API to be running on port 8081)

```bash
curl -X POST http://localhost:8082/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $BANANA_SPLIT_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}'
```

Expected: JSON-RPC response with server capabilities.

**Step 6: Commit any fixes if needed**
