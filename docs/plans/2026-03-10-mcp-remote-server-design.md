# MCP Remote Server Conversion — Design

## Overview

Convert the MCP server from a local stdio process to a remote HTTP server, matching the pattern used by Vercel and Supabase MCP integrations (Bearer token auth via `Authorization` header).

## Current State

- MCP server runs as a local stdio process spawned by OpenCode
- Singleton tRPC client created at startup with a fixed `BANANA_SPLIT_API_KEY` env var
- Singleton scope cache for the API key's chat scope
- `opencode.json` uses `type: "local"` with `command` and `environment`

## Target State

- MCP server runs as a standalone HTTP process on `localhost:8082`
- Each request carries an `Authorization: Bearer <token>` header
- Per-request: extract token, create tRPC client, create McpServer, register tools, handle, respond
- `opencode.json` uses `type: "remote"` with `url` and `headers` (like Vercel/Supabase)

## Architecture

### Request Flow

```
[AI Client (OpenCode)]
    -- HTTP POST http://localhost:8082/mcp (Authorization: Bearer <token>) -->
        [MCP HTTP Server (apps/mcp, port 8082)]
            -- per-request: extract token, create tRPC client -->
            -- tRPC HTTP call with x-api-key header -->
                [Lambda API (apps/lambda, port 8081)]
                    -- Prisma --> [Database]
```

### Approach: Stateless — New McpServer Per Request

Each HTTP request creates a fresh `McpServer` + `StreamableHTTPServerTransport`. The Bearer token is extracted, a per-request tRPC client is created, and tools are registered with that client via closure.

**Why stateless:**

- Clean isolation — no shared mutable state between requests
- No scope cache leaking between sessions
- Simple to reason about
- Aligns with how `StreamableHTTPServerTransport` stateless mode is designed
- McpServer is lightweight — tool registration is just pushing callbacks into arrays

**Rejected alternatives:**

- AsyncLocalStorage: implicit coupling, harder to debug, scope cache needs per-session storage
- Stateful session map: unnecessary complexity for short-lived MCP sessions

### Transport

Using `StreamableHTTPServerTransport` from `@modelcontextprotocol/sdk` (modern, recommended by SDK). The deprecated `SSEServerTransport` was considered and rejected.

Stdio transport is fully removed (HTTP only).

## File Changes

| File               | Change                                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| `env.ts`           | Only require `BANANA_SPLIT_API_URL`. Drop `BANANA_SPLIT_API_KEY`.                                        |
| `client.ts`        | Singleton → factory: `createTrpcClient(apiKey)`. Export `TrpcClient` type.                               |
| `scope.ts`         | `getScope(trpcClient)` and `resolveChatId(trpcClient, chatId?)` — accept client param, no cache.         |
| `tools/*.ts`       | `register*Tools(server, trpcClient)` — accept client, stop importing singleton.                          |
| `index.ts`         | Express + `StreamableHTTPServerTransport` stateless. Extract Bearer token per-request.                   |
| `package.json`     | Add `express`, `@types/express`, `dotenv`. Update scripts.                                               |
| `.env.development` | `BANANA_SPLIT_API_URL=http://localhost:8081/api/trpc`, `MCP_PORT=8082`                                   |
| `.env.production`  | Production API URL + port (placeholder for now)                                                          |
| `opencode.json`    | `type: "remote"`, `url: "http://localhost:8082/mcp"`, `Authorization: Bearer {env:BANANA_SPLIT_API_KEY}` |
| `tools/utils.ts`   | No changes (toolHandler is pure)                                                                         |

## Auth & Error Handling

### Bearer Token Extraction

1. Parse `Authorization` header
2. Strip `Bearer ` prefix → that's the API key
3. If missing or malformed → respond `401 Unauthorized` before creating any MCP infrastructure
4. Token is passed to `createTrpcClient(token)` → used as `x-api-key` header on tRPC calls
5. Existing tRPC auth middleware validates the key — no new auth logic in MCP server

### Error Cases

| Scenario                  | Response                                      |
| ------------------------- | --------------------------------------------- |
| No `Authorization` header | HTTP 401                                      |
| Malformed Bearer token    | HTTP 401                                      |
| Invalid API key           | tRPC error → MCP tool returns `isError: true` |
| Expired/revoked key       | Same as invalid                               |

### Not Needed

- **No CORS** — localhost-to-localhost, no browser
- **No rate limiting** — tRPC backend handles auth
- **No Tailscale** — both OpenCode and MCP server are local; external access deferred to future standalone hosting

## opencode.json Configuration

```json
{
  "bananasplit": {
    "type": "remote",
    "url": "http://localhost:8082/mcp",
    "oauth": false,
    "headers": {
      "Authorization": "Bearer {env:BANANA_SPLIT_API_KEY}"
    }
  }
}
```

Matches the pattern of Vercel (`{env:VERCEL_TOKEN}`) and Supabase (`{env:SUPABASE_TOKEN}`) MCP configs.
