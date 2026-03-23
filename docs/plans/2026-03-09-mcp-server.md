# Banana Split MCP Server Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a local MCP server that exposes Banana Split's tRPC API as read-only tools for personal AI assistant use.

**Architecture:** TypeScript MCP server in `apps/mcp/` using `@modelcontextprotocol/sdk` v1.x with stdio transport. Connects to the deployed tRPC API via HTTP using `@trpc/client` with superjson transformer. Authenticated via API key (`X-Api-Key` header). Read-only tools initially, structured for easy extension to write operations.

**Tech Stack:** `@modelcontextprotocol/sdk` (v1.x), `@trpc/client`, `superjson`, `zod`, TypeScript, tsx

---

### Task 1: Scaffold project structure

**Files:**

- Create: `apps/mcp/package.json`
- Create: `apps/mcp/tsconfig.json`
- Create: `apps/mcp/src/index.ts` (stub)

**Step 1: Create `apps/mcp/package.json`**

```json
{
  "name": "banana-split-mcp-server",
  "version": "1.0.0",
  "description": "MCP server for Banana Split expense tracking API",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "start": "node dist/index.js",
    "dev": "tsx src/index.ts",
    "build": "tsc",
    "check-types": "tsc --noEmit"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.1",
    "@trpc/client": "^11.1.2",
    "superjson": "^2.2.2",
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "@repo/typescript-config": "workspace:*",
    "@types/node": "^20.11.17",
    "tsx": "^4.7.1",
    "typescript": "5.8.2"
  }
}
```

**Step 2: Create `apps/mcp/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: Create `apps/mcp/src/index.ts` stub**

```typescript
#!/usr/bin/env node
console.error("banana-split-mcp-server stub");
```

**Step 4: Install dependencies**

Run: `pnpm install` (from repo root)

**Step 5: Verify build**

Run: `pnpm --filter banana-split-mcp-server build`
Expected: Compiles successfully, creates `apps/mcp/dist/index.js`

**Step 6: Commit**

```bash
git add apps/mcp/
git commit -m "feat(mcp): scaffold MCP server project structure"
```

---

### Task 2: Implement tRPC HTTP client

**Files:**

- Create: `apps/mcp/src/client.ts`
- Create: `apps/mcp/src/env.ts`

**Step 1: Create `apps/mcp/src/env.ts`**

Environment configuration with validation:

```typescript
const apiUrl = process.env.BANANA_SPLIT_API_URL;
const apiKey = process.env.BANANA_SPLIT_API_KEY;

if (!apiUrl) {
  console.error(
    "ERROR: BANANA_SPLIT_API_URL environment variable is required.\n" +
      "Set it to your API's tRPC endpoint, e.g. https://your-api.com/api/trpc"
  );
  process.exit(1);
}

if (!apiKey) {
  console.error(
    "ERROR: BANANA_SPLIT_API_KEY environment variable is required.\n" +
      "Set it to your API key for the Banana Split API."
  );
  process.exit(1);
}

export const env = {
  apiUrl,
  apiKey,
} as const;
```

**Step 2: Create `apps/mcp/src/client.ts`**

tRPC HTTP client with superjson transformer and API key auth:

```typescript
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { env } from "./env.js";

// Import the AppRouter type from the trpc package for type safety.
// Since we're in the same monorepo, we can import the type directly.
import type { AppRouter } from "@dko/trpc";

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: env.apiUrl,
      transformer: superjson,
      headers() {
        return {
          "x-api-key": env.apiKey,
        };
      },
    }),
  ],
});
```

**Step 3: Add `@dko/trpc` as dependency**

Add to `apps/mcp/package.json` dependencies:

```json
"@dko/trpc": "workspace:*"
```

Then run: `pnpm install`

**Step 4: Verify build**

Run: `pnpm --filter banana-split-mcp-server check-types`
Expected: No type errors

**Step 5: Commit**

```bash
git add apps/mcp/
git commit -m "feat(mcp): add tRPC HTTP client with API key auth"
```

---

### Task 3: Implement MCP server core with first tool

**Files:**

- Modify: `apps/mcp/src/index.ts`
- Create: `apps/mcp/src/tools/chat.ts`

**Step 1: Create `apps/mcp/src/tools/chat.ts`** with the first tool

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { trpc } from "../client.js";

export function registerChatTools(server: McpServer) {
  server.registerTool(
    "banana_list_chats",
    {
      title: "List Chats",
      description:
        "List all expense-tracking chats/groups in Banana Split. " +
        "Returns chat ID, title, type, base currency, and timestamps. " +
        "Use this to discover available chats before querying expenses or debts.",
      inputSchema: {
        exclude_types: z
          .array(
            z.enum(["private", "group", "supergroup", "channel", "sender"])
          )
          .optional()
          .describe(
            "Chat types to exclude from results. e.g. ['private'] to only see groups."
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ exclude_types }) => {
      try {
        const chats = await trpc.chat.getAllChats.query({
          excludeTypes: exclude_types,
        });
        const text =
          chats.length === 0
            ? "No chats found."
            : chats
                .map(
                  (c) =>
                    `- **${c.title}** (ID: ${c.id}, type: ${c.type}, currency: ${c.baseCurrency})`
                )
                .join("\n");
        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error listing chats: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  server.registerTool(
    "banana_get_chat",
    {
      title: "Get Chat Details",
      description:
        "Get detailed information about a specific chat/group, including its members. " +
        "Returns chat title, type, base currency, member list with names/usernames, " +
        "and whether debt simplification is enabled.",
      inputSchema: {
        chat_id: z
          .number()
          .describe(
            "The numeric chat ID. Use banana_list_chats to find chat IDs."
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ chat_id }) => {
      try {
        const chat = await trpc.chat.getChat.query({ chatId: chat_id });
        const members = chat.members
          .map(
            (m: {
              id: number;
              firstName?: string | null;
              lastName?: string | null;
              username?: string | null;
            }) =>
              `  - ${m.firstName || ""} ${m.lastName || ""}`.trim() +
              (m.username ? ` (@${m.username})` : "") +
              ` [ID: ${m.id}]`
          )
          .join("\n");
        const text =
          `**${chat.title}** (ID: ${chat.id})\n` +
          `Type: ${chat.type}\n` +
          `Base Currency: ${chat.baseCurrency}\n` +
          `Debt Simplification: ${chat.debtSimplificationEnabled ? "Enabled" : "Disabled"}\n` +
          `Members (${chat.members.length}):\n${members}`;
        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error getting chat: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  server.registerTool(
    "banana_get_chat_debts",
    {
      title: "Get Chat Debts",
      description:
        "Get all outstanding debts in a chat. Shows who owes whom and how much, " +
        "optionally filtered by currencies. Returns debtor ID, creditor ID, amount, and currency.",
      inputSchema: {
        chat_id: z.number().describe("The numeric chat ID."),
        currencies: z
          .array(z.string().length(3))
          .optional()
          .describe(
            "Optional filter: only show debts in these currencies (3-letter codes, e.g. ['USD', 'SGD'])."
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ chat_id, currencies }) => {
      try {
        const result = await trpc.chat.getBulkChatDebts.query({
          chatId: chat_id,
          currencies,
        });
        if (result.debts.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No outstanding debts in this chat.",
              },
            ],
          };
        }
        const text = result.debts
          .map(
            (d) =>
              `- User ${d.debtorId} owes User ${d.creditorId}: ${d.amount} ${d.currency}`
          )
          .join("\n");
        return {
          content: [
            { type: "text" as const, text: `**Outstanding Debts:**\n${text}` },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error getting debts: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  server.registerTool(
    "banana_get_simplified_debts",
    {
      title: "Get Simplified Debts",
      description:
        "Get optimized/simplified debt graph for a chat in a specific currency. " +
        "Reduces the number of transactions needed to settle all debts. " +
        "Returns simplified debts, transaction reduction stats, and member info.",
      inputSchema: {
        chat_id: z.number().describe("The numeric chat ID."),
        currency: z
          .string()
          .length(3)
          .describe("3-letter currency code (e.g. 'USD', 'SGD')."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ chat_id, currency }) => {
      try {
        const result = await trpc.chat.getSimplifiedDebts.query({
          chatId: chat_id,
          currency,
        });
        const memberMap = new Map(
          result.chatMembers.map((m) => [
            m.id,
            m.username || m.firstName || `User ${m.id}`,
          ])
        );
        const debts = result.simplifiedDebts
          .map(
            (d) =>
              `- ${memberMap.get(d.fromUserId) || d.fromUserId} -> ${memberMap.get(d.toUserId) || d.toUserId}: ${d.amount} ${currency}`
          )
          .join("\n");
        const stats = result.transactionReduction;
        const text =
          `**Simplified Debts (${currency}):**\n${debts || "No debts."}\n\n` +
          `**Transaction Reduction:** ${stats.original} -> ${stats.simplified} ` +
          `(${stats.reductionPercentage.toFixed(0)}% reduction)`;
        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error getting simplified debts: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
```

**Step 2: Implement `apps/mcp/src/index.ts`**

```typescript
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
```

**Step 3: Verify build**

Run: `pnpm --filter banana-split-mcp-server check-types`
Expected: No type errors

**Step 4: Commit**

```bash
git add apps/mcp/
git commit -m "feat(mcp): implement MCP server core and chat tools"
```

---

### Task 4: Implement expense tools

**Files:**

- Create: `apps/mcp/src/tools/expense.ts`
- Modify: `apps/mcp/src/index.ts` (register expense tools)

**Step 1: Create `apps/mcp/src/tools/expense.ts`**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { trpc } from "../client.js";

export function registerExpenseTools(server: McpServer) {
  server.registerTool(
    "banana_list_expenses",
    {
      title: "List Expenses",
      description:
        "List all expenses in a chat, optionally filtered by currency. " +
        "Returns expense description, amount, currency, payer, date, and split details. " +
        "Ordered by date descending.",
      inputSchema: {
        chat_id: z.number().describe("The numeric chat ID."),
        currency: z
          .string()
          .length(3)
          .optional()
          .describe("Optional: filter by 3-letter currency code (e.g. 'USD')."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ chat_id, currency }) => {
      try {
        const expenses = currency
          ? await trpc.expense.getExpenseByChat.query({
              chatId: chat_id,
              currency,
            })
          : await trpc.expense.getAllExpensesByChat.query({ chatId: chat_id });
        if (expenses.length === 0) {
          return {
            content: [{ type: "text" as const, text: "No expenses found." }],
          };
        }
        const text = expenses
          .map((e: any) => {
            const date = e.date
              ? new Date(e.date).toLocaleDateString()
              : "Unknown date";
            return (
              `- **${e.description || "Untitled"}** - ${e.amount} ${e.currency} ` +
              `(paid by User ${e.payerId}, ${date}) [ID: ${e.id}]`
            );
          })
          .join("\n");
        return {
          content: [
            {
              type: "text" as const,
              text: `**Expenses (${expenses.length}):**\n${text}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error listing expenses: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  server.registerTool(
    "banana_get_expense",
    {
      title: "Get Expense Details",
      description:
        "Get full details of a specific expense including all split/share information, " +
        "participants, payer, creator, and the chat it belongs to.",
      inputSchema: {
        expense_id: z
          .string()
          .describe("The expense UUID. Use banana_list_expenses to find IDs."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ expense_id }) => {
      try {
        const expense = await trpc.expense.getExpenseDetails.query({
          expenseId: expense_id,
        });
        const e = expense as any;
        const shares = (e.shares || [])
          .map(
            (s: any) =>
              `  - User ${s.userId}: ${s.amount} ${e.currency} (${s.splitMode || "equal"})`
          )
          .join("\n");
        const text =
          `**${e.description || "Untitled Expense"}**\n` +
          `Amount: ${e.amount} ${e.currency}\n` +
          `Date: ${e.date ? new Date(e.date).toLocaleDateString() : "Unknown"}\n` +
          `Paid by: User ${e.payerId}\n` +
          `Created by: User ${e.creatorId}\n` +
          `Chat: ${e.chat?.title || e.chatId}\n` +
          `Split Mode: ${e.splitMode || "equal"}\n` +
          `Category: ${e.category || "None"}\n` +
          `Shares:\n${shares || "  None"}`;
        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error getting expense: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  server.registerTool(
    "banana_get_net_share",
    {
      title: "Get Net Share Between Users",
      description:
        "Get the net balance between two users in a specific chat and currency. " +
        "Positive means mainUser is owed money by targetUser, negative means mainUser owes.",
      inputSchema: {
        main_user_id: z
          .number()
          .describe("The user whose perspective to calculate from."),
        target_user_id: z
          .number()
          .describe("The other user in the balance calculation."),
        chat_id: z.number().describe("The chat ID to calculate within."),
        currency: z
          .string()
          .length(3)
          .describe("3-letter currency code (e.g. 'USD')."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ main_user_id, target_user_id, chat_id, currency }) => {
      try {
        const netShare = await trpc.expenseShare.getNetShare.query({
          mainUserId: main_user_id,
          targetUserId: target_user_id,
          chatId: chat_id,
          currency,
        });
        const direction =
          netShare > 0
            ? `User ${target_user_id} owes User ${main_user_id}`
            : netShare < 0
              ? `User ${main_user_id} owes User ${target_user_id}`
              : "Users are settled up";
        return {
          content: [
            {
              type: "text" as const,
              text: `**Net Share:** ${Math.abs(netShare)} ${currency}\n${direction}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error getting net share: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  server.registerTool(
    "banana_get_totals",
    {
      title: "Get Total Borrowed and Lent",
      description:
        "Get the total amount a user has borrowed and lent in a specific chat across all currencies.",
      inputSchema: {
        user_id: z.number().describe("The user ID to check totals for."),
        chat_id: z.number().describe("The chat ID."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ user_id, chat_id }) => {
      try {
        const [totalBorrowed, totalLent] = await Promise.all([
          trpc.expenseShare.getTotalBorrowed.query({
            userId: user_id,
            chatId: chat_id,
          }),
          trpc.expenseShare.getTotalLent.query({
            userId: user_id,
            chatId: chat_id,
          }),
        ]);
        return {
          content: [
            {
              type: "text" as const,
              text:
                `**User ${user_id} Totals in Chat ${chat_id}:**\n` +
                `Total Borrowed: ${totalBorrowed}\n` +
                `Total Lent: ${totalLent}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error getting totals: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
```

**Step 2: Register expense tools in `apps/mcp/src/index.ts`**

Add import and registration:

```typescript
import { registerExpenseTools } from "./tools/expense.js";
// ... after registerChatTools(server);
registerExpenseTools(server);
```

**Step 3: Verify build**

Run: `pnpm --filter banana-split-mcp-server check-types`
Expected: No type errors

**Step 4: Commit**

```bash
git add apps/mcp/
git commit -m "feat(mcp): add expense and expense share tools"
```

---

### Task 5: Implement settlement, snapshot, and currency tools

**Files:**

- Create: `apps/mcp/src/tools/settlement.ts`
- Create: `apps/mcp/src/tools/snapshot.ts`
- Create: `apps/mcp/src/tools/currency.ts`
- Modify: `apps/mcp/src/index.ts` (register all tools)

**Step 1: Create `apps/mcp/src/tools/settlement.ts`**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { trpc } from "../client.js";

export function registerSettlementTools(server: McpServer) {
  server.registerTool(
    "banana_list_settlements",
    {
      title: "List Settlements",
      description:
        "List all debt settlements in a chat, optionally filtered by currency. " +
        "Shows who paid whom, amount, currency, and date.",
      inputSchema: {
        chat_id: z.number().describe("The numeric chat ID."),
        currency: z
          .string()
          .length(3)
          .optional()
          .describe("Optional: filter by 3-letter currency code."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ chat_id, currency }) => {
      try {
        const settlements = currency
          ? await trpc.settlement.getSettlementByChat.query({
              chatId: chat_id,
              currency,
            })
          : await trpc.settlement.getAllSettlementsByChat.query({
              chatId: chat_id,
            });
        if (settlements.length === 0) {
          return {
            content: [{ type: "text" as const, text: "No settlements found." }],
          };
        }
        const text = settlements
          .map((s: any) => {
            const date = s.createdAt
              ? new Date(s.createdAt).toLocaleDateString()
              : "Unknown date";
            return `- User ${s.payerId} paid User ${s.payeeId}: ${s.amount} ${s.currency} (${date}) [ID: ${s.id}]`;
          })
          .join("\n");
        return {
          content: [
            {
              type: "text" as const,
              text: `**Settlements (${settlements.length}):**\n${text}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error listing settlements: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
```

**Step 2: Create `apps/mcp/src/tools/snapshot.ts`**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { trpc } from "../client.js";

export function registerSnapshotTools(server: McpServer) {
  server.registerTool(
    "banana_list_snapshots",
    {
      title: "List Snapshots",
      description:
        "List all expense snapshots in a chat. Snapshots group expenses together " +
        "for a time period or event. Returns snapshot name, creator, and expense count.",
      inputSchema: {
        chat_id: z.number().describe("The numeric chat ID."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ chat_id }) => {
      try {
        const snapshots = await trpc.snapshot.getByChat.query({
          chatId: chat_id,
        });
        if (snapshots.length === 0) {
          return {
            content: [{ type: "text" as const, text: "No snapshots found." }],
          };
        }
        const text = snapshots
          .map((s: any) => {
            const expenseCount = s.expenses?.length ?? 0;
            return `- **${s.name || "Untitled"}** by ${s.creator?.firstName || "Unknown"} (${expenseCount} expenses) [ID: ${s.id}]`;
          })
          .join("\n");
        return {
          content: [
            {
              type: "text" as const,
              text: `**Snapshots (${snapshots.length}):**\n${text}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error listing snapshots: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  server.registerTool(
    "banana_get_snapshot",
    {
      title: "Get Snapshot Details",
      description:
        "Get full details of a specific snapshot including all expenses within it, " +
        "their amounts, payers, and split details.",
      inputSchema: {
        snapshot_id: z.string().uuid().describe("The snapshot UUID."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ snapshot_id }) => {
      try {
        const snapshot = await trpc.snapshot.getDetails.query({
          snapshotId: snapshot_id,
        });
        const s = snapshot as any;
        const expenses = (s.expenses || [])
          .map(
            (e: any) =>
              `  - ${e.description || "Untitled"}: ${e.amount} ${e.currency} (paid by ${e.payer?.firstName || e.payerId})`
          )
          .join("\n");
        const text =
          `**Snapshot: ${s.name || "Untitled"}**\n` +
          `Chat: ${s.chat?.title || s.chatId}\n` +
          `Created by: ${s.creator?.firstName || "Unknown"}\n` +
          `Expenses (${s.expenses?.length || 0}):\n${expenses || "  None"}`;
        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error getting snapshot: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
```

**Step 3: Create `apps/mcp/src/tools/currency.ts`**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { trpc } from "../client.js";

export function registerCurrencyTools(server: McpServer) {
  server.registerTool(
    "banana_get_exchange_rate",
    {
      title: "Get Exchange Rate",
      description:
        "Get the current exchange rate between two currencies. " +
        "Uses a 3-tier fallback: direct rate, cross-rate via USD, or refreshed rate.",
      inputSchema: {
        base_currency: z
          .string()
          .length(3)
          .describe("The source currency code (e.g. 'USD')."),
        target_currency: z
          .string()
          .length(3)
          .describe("The target currency code (e.g. 'SGD')."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ base_currency, target_currency }) => {
      try {
        const result = await trpc.currency.getCurrentRate.query({
          baseCurrency: base_currency,
          targetCurrency: target_currency,
        });
        const text =
          `**Exchange Rate:**\n` +
          `1 ${result.baseCurrency} = ${result.rate} ${result.targetCurrency}\n` +
          `Method: ${result.calculationMethod}\n` +
          `Last Updated: ${new Date(result.lastUpdated).toLocaleString()}`;
        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error getting exchange rate: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
```

**Step 4: Update `apps/mcp/src/index.ts`** - register all tools

```typescript
#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerChatTools } from "./tools/chat.js";
import { registerExpenseTools } from "./tools/expense.js";
import { registerSettlementTools } from "./tools/settlement.js";
import { registerSnapshotTools } from "./tools/snapshot.js";
import { registerCurrencyTools } from "./tools/currency.js";

// env.ts validates and exits if vars are missing
import "./env.js";

const server = new McpServer({
  name: "banana-split-mcp-server",
  version: "1.0.0",
});

// Register all tool groups
registerChatTools(server);
registerExpenseTools(server);
registerSettlementTools(server);
registerSnapshotTools(server);
registerCurrencyTools(server);

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
```

**Step 5: Verify build**

Run: `pnpm --filter banana-split-mcp-server check-types`
Expected: No type errors

Run: `pnpm --filter banana-split-mcp-server build`
Expected: Compiles to `dist/`

**Step 6: Commit**

```bash
git add apps/mcp/
git commit -m "feat(mcp): add settlement, snapshot, and currency tools"
```

---

### Task 6: Build, test, and document

**Files:**

- Verify: `apps/mcp/dist/index.js` exists and runs

**Step 1: Full build**

Run: `pnpm --filter banana-split-mcp-server build`
Expected: Clean compilation

**Step 2: Test server starts**

Run: `BANANA_SPLIT_API_URL=http://localhost:8081/api/trpc BANANA_SPLIT_API_KEY=test node apps/mcp/dist/index.js`
Expected: Prints "Banana Split MCP server running via stdio" to stderr, then waits for stdin

**Step 3: Test with MCP Inspector (optional manual test)**

Run: `npx @modelcontextprotocol/inspector`
Configure with the server command and env vars.
Verify all 12 tools appear and their schemas look correct.

**Step 4: Commit final state**

```bash
git add apps/mcp/
git commit -m "feat(mcp): finalize MCP server build and verify"
```

---

## Usage

Add to your Claude/Cursor MCP config:

```json
{
  "mcpServers": {
    "banana-split": {
      "command": "node",
      "args": ["/path/to/banana-split-tma/apps/mcp/dist/index.js"],
      "env": {
        "BANANA_SPLIT_API_KEY": "your-api-key",
        "BANANA_SPLIT_API_URL": "https://your-api.com/api/trpc"
      }
    }
  }
}
```

Or for development with tsx (no build step):

```json
{
  "mcpServers": {
    "banana-split": {
      "command": "npx",
      "args": ["tsx", "/path/to/banana-split-tma/apps/mcp/src/index.ts"],
      "env": {
        "BANANA_SPLIT_API_KEY": "your-api-key",
        "BANANA_SPLIT_API_URL": "http://localhost:8081/api/trpc"
      }
    }
  }
}
```

## Tool Summary (12 tools)

| Tool                          | Procedure                                                    | Description                              |
| ----------------------------- | ------------------------------------------------------------ | ---------------------------------------- |
| `banana_list_chats`           | `chat.getAllChats`                                           | List all expense-tracking groups         |
| `banana_get_chat`             | `chat.getChat`                                               | Get chat details and members             |
| `banana_get_chat_debts`       | `chat.getBulkChatDebts`                                      | Get who owes whom in a chat              |
| `banana_get_simplified_debts` | `chat.getSimplifiedDebts`                                    | Get optimized debt graph                 |
| `banana_list_expenses`        | `expense.getAllExpensesByChat` / `expense.getExpenseByChat`  | List expenses (optional currency filter) |
| `banana_get_expense`          | `expense.getExpenseDetails`                                  | Get expense with full split details      |
| `banana_get_net_share`        | `expenseShare.getNetShare`                                   | Net balance between two users            |
| `banana_get_totals`           | `expenseShare.getTotalBorrowed` + `getTotalLent`             | Total borrowed/lent for a user           |
| `banana_list_settlements`     | `settlement.getAllSettlementsByChat` / `getSettlementByChat` | List settlements                         |
| `banana_list_snapshots`       | `snapshot.getByChat`                                         | List expense snapshots                   |
| `banana_get_snapshot`         | `snapshot.getDetails`                                        | Get snapshot with all expenses           |
| `banana_get_exchange_rate`    | `currency.getCurrentRate`                                    | Get currency exchange rate               |
