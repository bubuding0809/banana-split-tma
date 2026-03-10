# Banana Split CLI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an agent-first CLI (`@bananasplit/cli`) that wraps the Banana Split tRPC APIs, published to npm with binary name `banana`.

**Architecture:** Direct tRPC HTTP client in a standalone `apps/cli/` monorepo package. Each CLI command maps to one or more tRPC procedure calls. Scope resolution (chat-scoped API key auto-resolving `--chat-id`) is handled client-side via `apiKey.getScope`. Output is always JSON to stdout.

**Tech Stack:** Node.js `util.parseArgs` (no framework), `@trpc/client` 11.0.0 pinned, `superjson`, TypeScript ESM.

**Design doc:** `docs/plans/2026-03-10-cli-design.md`

---

### Task 1: Scaffold `apps/cli/` Package

**Files:**

- Create: `apps/cli/package.json`
- Create: `apps/cli/tsconfig.json`

**Step 1: Create package.json**

```json
{
  "name": "@bananasplit/cli",
  "version": "0.1.0",
  "description": "Agent-first CLI for Banana Split expense tracking API",
  "type": "module",
  "main": "dist/cli.js",
  "bin": {
    "banana": "./dist/cli.js"
  },
  "files": ["dist"],
  "publishConfig": {
    "access": "public"
  },
  "scripts": {
    "start": "node dist/cli.js",
    "dev": "tsx src/cli.ts",
    "build": "tsc",
    "check-types": "tsc --noEmit"
  },
  "dependencies": {
    "@dko/trpc": "workspace:*",
    "@trpc/client": "11.0.0",
    "superjson": "^2.2.2"
  },
  "devDependencies": {
    "@repo/typescript-config": "workspace:*",
    "@types/node": "^20.11.17",
    "tsx": "^4.7.1",
    "typescript": "5.8.2"
  }
}
```

**Step 2: Create tsconfig.json**

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

**Step 3: Install dependencies**

Run: `pnpm install`
Expected: Clean install, `apps/cli` appears in workspace.

**Step 4: Commit**

```bash
git add apps/cli/package.json apps/cli/tsconfig.json pnpm-lock.yaml
git commit -m "feat(cli): scaffold @bananasplit/cli package"
```

---

### Task 2: Create Core Utilities

**Files:**

- Create: `apps/cli/src/client.ts`
- Create: `apps/cli/src/config.ts`
- Create: `apps/cli/src/output.ts`

**Step 1: Create `src/client.ts`** — tRPC client factory

```typescript
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@dko/trpc";

export type TrpcClient = ReturnType<typeof createTrpcClient>;

export function createTrpcClient(apiKey: string, apiUrl: string) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: apiUrl,
        transformer: superjson,
        headers() {
          return { "x-api-key": apiKey };
        },
      }),
    ],
  });
}
```

Note: unlike the MCP server, apiUrl is passed as a parameter (resolved by config.ts) rather than read from env.ts.

**Step 2: Create `src/config.ts`** — Auth + URL resolution

```typescript
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CONFIG_PATH = join(homedir(), ".bananasplit.json");
const DEFAULT_API_URL = "https://banana-split-tma-lambda.vercel.app/api/trpc";

interface Config {
  apiKey?: string;
  apiUrl?: string;
}

function readConfigFile(): Config {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as Config;
  } catch {
    return {};
  }
}

export function writeConfigFile(config: Config): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

/** Resolve API key: --api-key flag > BANANA_SPLIT_API_KEY env > config file */
export function resolveApiKey(flagValue?: string): string | undefined {
  return (
    flagValue || process.env.BANANA_SPLIT_API_KEY || readConfigFile().apiKey
  );
}

/** Resolve API URL: --api-url flag > BANANA_SPLIT_API_URL env > config file > default */
export function resolveApiUrl(flagValue?: string): string {
  return (
    flagValue ||
    process.env.BANANA_SPLIT_API_URL ||
    readConfigFile().apiUrl ||
    DEFAULT_API_URL
  );
}
```

**Step 3: Create `src/output.ts`** — JSON output + error handling

```typescript
/** Custom replacer: BigInt → string for JSON serialization */
function replacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

/** Print success result as JSON to stdout. Exit 0. */
export function success(data: unknown): never {
  console.log(JSON.stringify(data, replacer, 2));
  process.exit(0);
}

/** Print error as JSON to stderr. Exit 1. */
export function error(
  category:
    | "missing_option"
    | "invalid_option"
    | "auth_error"
    | "api_error"
    | "unknown_command",
  message: string,
  command?: string
): never {
  const obj: Record<string, string> = { error: category, message };
  if (command) obj.command = command;
  console.error(JSON.stringify(obj, null, 2));
  process.exit(1);
}

/** Wrap a command handler to catch tRPC/network errors and format them. */
export async function run(
  command: string,
  fn: () => Promise<unknown>
): Promise<never> {
  try {
    const result = await fn();
    return success(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error("api_error", message, command);
  }
}
```

**Step 4: Verify types compile**

Run: `npx tsc --noEmit` from `apps/cli/`
Expected: Clean (no errors). These files have no cross-dependencies yet besides `@dko/trpc`.

**Step 5: Commit**

```bash
git add apps/cli/src/client.ts apps/cli/src/config.ts apps/cli/src/output.ts
git commit -m "feat(cli): add core utilities (tRPC client, config, output)"
```

---

### Task 3: Create Command Type + Scope Resolution

**Files:**

- Create: `apps/cli/src/commands/types.ts`
- Create: `apps/cli/src/scope.ts`

**Step 1: Create `src/commands/types.ts`**

```typescript
import type { TrpcClient } from "../client.js";

export interface CommandOption {
  type: "string" | "boolean";
  description: string;
}

export interface Command {
  name: string;
  description: string;
  options: Record<string, CommandOption>;
  execute: (
    opts: Record<string, string | boolean | string[] | undefined>,
    trpc: TrpcClient
  ) => Promise<unknown>;
}
```

**Step 2: Create `src/scope.ts`** — Resolve chat ID from flag or scoped API key

```typescript
import type { TrpcClient } from "./client.js";

/**
 * Resolve chatId: use explicit value if provided, otherwise check API key scope.
 * Throws if no chatId available.
 */
export async function resolveChatId(
  trpc: TrpcClient,
  chatIdFlag?: string
): Promise<number> {
  if (chatIdFlag) {
    const parsed = Number(chatIdFlag);
    if (Number.isNaN(parsed)) throw new Error("--chat-id must be a number");
    return parsed;
  }

  const scope = await trpc.apiKey.getScope.query();
  if (scope.scoped && scope.chatId) return Number(scope.chatId);
  throw new Error("--chat-id is required (API key is not chat-scoped)");
}
```

**Step 3: Verify types**

Run: `npx tsc --noEmit` from `apps/cli/`

**Step 4: Commit**

```bash
git add apps/cli/src/commands/types.ts apps/cli/src/scope.ts
git commit -m "feat(cli): add command types and scope resolution"
```

---

### Task 4: Chat Commands

**Files:**

- Create: `apps/cli/src/commands/chat.ts`

**Step 1: Create `src/commands/chat.ts`**

All 5 chat commands. tRPC procedure names come from the MCP server's tool implementations:

```typescript
import type { Command } from "./types.js";
import { resolveChatId } from "../scope.js";

export const chatCommands: Command[] = [
  {
    name: "list-chats",
    description: "List all expense-tracking chats/groups",
    options: {
      "exclude-types": {
        type: "string",
        description:
          "Comma-separated chat types to exclude (e.g. private,channel)",
      },
    },
    async execute(opts, trpc) {
      const excludeTypes = opts["exclude-types"]
        ? String(opts["exclude-types"]).split(",")
        : undefined;
      return trpc.chat.getAllChats.query({
        excludeTypes: excludeTypes as
          | ("private" | "group" | "supergroup" | "channel" | "sender")[]
          | undefined,
      });
    },
  },
  {
    name: "get-chat",
    description: "Get detailed info about a chat including members",
    options: {
      "chat-id": { type: "string", description: "The numeric chat ID" },
    },
    async execute(opts, trpc) {
      const chatId = await resolveChatId(
        trpc,
        opts["chat-id"] as string | undefined
      );
      return trpc.chat.getChat.query({ chatId });
    },
  },
  {
    name: "get-debts",
    description: "Get all outstanding debts in a chat",
    options: {
      "chat-id": { type: "string", description: "The numeric chat ID" },
      currencies: {
        type: "string",
        description:
          "Comma-separated currency codes to filter by (e.g. USD,SGD)",
      },
    },
    async execute(opts, trpc) {
      const chatId = await resolveChatId(
        trpc,
        opts["chat-id"] as string | undefined
      );
      const currencies = opts.currencies
        ? String(opts.currencies).split(",")
        : undefined;
      return trpc.chat.getBulkChatDebts.query({ chatId, currencies });
    },
  },
  {
    name: "get-simplified-debts",
    description: "Get optimized/simplified debt graph for a chat in a currency",
    options: {
      "chat-id": { type: "string", description: "The numeric chat ID" },
      currency: {
        type: "string",
        description: "3-letter currency code (e.g. USD)",
      },
    },
    async execute(opts, trpc) {
      const chatId = await resolveChatId(
        trpc,
        opts["chat-id"] as string | undefined
      );
      const currency = opts.currency as string;
      if (!currency) throw new Error("--currency is required");
      return trpc.chat.getSimplifiedDebts.query({ chatId, currency });
    },
  },
  {
    name: "update-chat-settings",
    description:
      "Update chat configuration (base currency, debt simplification)",
    options: {
      "chat-id": { type: "string", description: "The numeric chat ID" },
      "base-currency": {
        type: "string",
        description: "New base currency (3-letter code)",
      },
      "debt-simplification": {
        type: "string",
        description: "Enable/disable debt simplification (true/false)",
      },
    },
    async execute(opts, trpc) {
      const chatId = await resolveChatId(
        trpc,
        opts["chat-id"] as string | undefined
      );
      const update: Record<string, unknown> = { chatId };
      if (opts["base-currency"]) update.baseCurrency = opts["base-currency"];
      if (opts["debt-simplification"] !== undefined) {
        update.debtSimplificationEnabled =
          opts["debt-simplification"] === "true";
      }
      return trpc.chat.updateChat.mutate(
        update as Parameters<typeof trpc.chat.updateChat.mutate>[0]
      );
    },
  },
];
```

**Step 2: Verify types**

Run: `npx tsc --noEmit` from `apps/cli/`

**Step 3: Commit**

```bash
git add apps/cli/src/commands/chat.ts
git commit -m "feat(cli): add chat commands (list-chats, get-chat, get-debts, get-simplified-debts, update-chat-settings)"
```

---

### Task 5: Expense Commands

**Files:**

- Create: `apps/cli/src/commands/expense.ts`

**Step 1: Create `src/commands/expense.ts`**

All 5 expense commands. `get-totals` combines two tRPC calls (getTotalBorrowed + getTotalLent):

```typescript
import type { Command } from "./types.js";
import { resolveChatId } from "../scope.js";

export const expenseCommands: Command[] = [
  {
    name: "list-expenses",
    description: "List all expenses in a chat",
    options: {
      "chat-id": { type: "string", description: "The numeric chat ID" },
      currency: { type: "string", description: "Filter by currency code" },
    },
    async execute(opts, trpc) {
      const chatId = await resolveChatId(
        trpc,
        opts["chat-id"] as string | undefined
      );
      return trpc.expense.getExpenseByChat.query({
        chatId,
        currency: opts.currency as string | undefined,
      });
    },
  },
  {
    name: "get-expense",
    description: "Get full details of a specific expense",
    options: {
      "expense-id": { type: "string", description: "The expense UUID" },
    },
    async execute(opts, trpc) {
      const expenseId = opts["expense-id"] as string;
      if (!expenseId) throw new Error("--expense-id is required");
      return trpc.expense.getExpenseDetails.query({ expenseId });
    },
  },
  {
    name: "create-expense",
    description: "Create a new expense with split calculation",
    options: {
      "chat-id": { type: "string", description: "The numeric chat ID" },
      "payer-id": { type: "string", description: "User ID who paid" },
      "creator-id": {
        type: "string",
        description: "User ID creating the expense (defaults to payer)",
      },
      amount: { type: "string", description: "Total expense amount" },
      description: {
        type: "string",
        description: "Short description (max 60 chars)",
      },
      "split-mode": {
        type: "string",
        description: "EQUAL, EXACT, PERCENTAGE, or SHARES",
      },
      "participant-ids": {
        type: "string",
        description: "Comma-separated user IDs",
      },
      currency: { type: "string", description: "3-letter currency code" },
      "custom-splits": {
        type: "string",
        description: 'JSON array: [{"userId":123,"amount":30}]',
      },
    },
    async execute(opts, trpc) {
      const chatId = await resolveChatId(
        trpc,
        opts["chat-id"] as string | undefined
      );
      const payerId = Number(opts["payer-id"]);
      if (!opts["payer-id"] || Number.isNaN(payerId))
        throw new Error("--payer-id is required and must be a number");
      const amount = Number(opts.amount);
      if (!opts.amount || Number.isNaN(amount))
        throw new Error("--amount is required and must be a number");
      const description = opts.description as string;
      if (!description) throw new Error("--description is required");
      const splitMode = opts["split-mode"] as string;
      if (!splitMode) throw new Error("--split-mode is required");
      const participantIdsRaw = opts["participant-ids"] as string;
      if (!participantIdsRaw) throw new Error("--participant-ids is required");
      const participantIds = participantIdsRaw.split(",").map(Number);
      const creatorId = opts["creator-id"]
        ? Number(opts["creator-id"])
        : payerId;

      const input: Record<string, unknown> = {
        chatId,
        creatorId,
        payerId,
        description,
        amount,
        splitMode,
        participantIds,
        sendNotification: true,
      };
      if (opts.currency) input.currency = opts.currency;
      if (opts["custom-splits"]) {
        input.customSplits = JSON.parse(opts["custom-splits"] as string);
      }

      return trpc.expense.createExpense.mutate(
        input as Parameters<typeof trpc.expense.createExpense.mutate>[0]
      );
    },
  },
  {
    name: "get-net-share",
    description: "Get net balance between two users in a chat",
    options: {
      "chat-id": { type: "string", description: "The numeric chat ID" },
      "main-user-id": { type: "string", description: "Perspective user ID" },
      "target-user-id": { type: "string", description: "Other user ID" },
      currency: { type: "string", description: "3-letter currency code" },
    },
    async execute(opts, trpc) {
      const chatId = await resolveChatId(
        trpc,
        opts["chat-id"] as string | undefined
      );
      const mainUserId = Number(opts["main-user-id"]);
      if (!opts["main-user-id"] || Number.isNaN(mainUserId))
        throw new Error("--main-user-id is required");
      const targetUserId = Number(opts["target-user-id"]);
      if (!opts["target-user-id"] || Number.isNaN(targetUserId))
        throw new Error("--target-user-id is required");
      const currency = opts.currency as string;
      if (!currency) throw new Error("--currency is required");
      return trpc.expenseShare.getNetShare.query({
        mainUserId,
        targetUserId,
        chatId,
        currency,
      });
    },
  },
  {
    name: "get-totals",
    description: "Get total borrowed and lent for a user in a chat",
    options: {
      "chat-id": { type: "string", description: "The numeric chat ID" },
      "user-id": { type: "string", description: "The user ID" },
    },
    async execute(opts, trpc) {
      const chatId = await resolveChatId(
        trpc,
        opts["chat-id"] as string | undefined
      );
      const userId = Number(opts["user-id"]);
      if (!opts["user-id"] || Number.isNaN(userId))
        throw new Error("--user-id is required");
      const [borrowed, lent] = await Promise.all([
        trpc.expenseShare.getTotalBorrowed.query({ userId, chatId }),
        trpc.expenseShare.getTotalLent.query({ userId, chatId }),
      ]);
      return { borrowed, lent };
    },
  },
];
```

**Step 2: Verify types**

Run: `npx tsc --noEmit` from `apps/cli/`

**Step 3: Commit**

```bash
git add apps/cli/src/commands/expense.ts
git commit -m "feat(cli): add expense commands (list, get, create, net-share, totals)"
```

---

### Task 6: Settlement Commands

**Files:**

- Create: `apps/cli/src/commands/settlement.ts`

**Step 1: Create `src/commands/settlement.ts`**

`create-settlement` requires looking up chat members to get creditor/debtor names for the notification:

```typescript
import type { Command } from "./types.js";
import { resolveChatId } from "../scope.js";

export const settlementCommands: Command[] = [
  {
    name: "list-settlements",
    description: "List all debt settlements in a chat",
    options: {
      "chat-id": { type: "string", description: "The numeric chat ID" },
      currency: { type: "string", description: "Filter by currency code" },
    },
    async execute(opts, trpc) {
      const chatId = await resolveChatId(
        trpc,
        opts["chat-id"] as string | undefined
      );
      return trpc.settlement.getSettlementByChat.query({
        chatId,
        currency: opts.currency as string | undefined,
      });
    },
  },
  {
    name: "create-settlement",
    description: "Record a debt settlement between two users",
    options: {
      "chat-id": { type: "string", description: "The numeric chat ID" },
      "sender-id": { type: "string", description: "User ID paying the debt" },
      "receiver-id": {
        type: "string",
        description: "User ID receiving payment",
      },
      amount: { type: "string", description: "Amount being paid" },
      currency: { type: "string", description: "3-letter currency code" },
      description: { type: "string", description: "Optional note" },
    },
    async execute(opts, trpc) {
      const chatId = await resolveChatId(
        trpc,
        opts["chat-id"] as string | undefined
      );
      const senderId = Number(opts["sender-id"]);
      if (!opts["sender-id"] || Number.isNaN(senderId))
        throw new Error("--sender-id is required");
      const receiverId = Number(opts["receiver-id"]);
      if (!opts["receiver-id"] || Number.isNaN(receiverId))
        throw new Error("--receiver-id is required");
      const amount = Number(opts.amount);
      if (!opts.amount || Number.isNaN(amount))
        throw new Error("--amount is required");

      // Look up member names for notification
      const chat = await trpc.chat.getChat.query({ chatId });
      const members = chat.members ?? [];
      const creditor = members.find((m) => Number(m.userId) === receiverId);
      const debtor = members.find((m) => Number(m.userId) === senderId);

      const input: Record<string, unknown> = {
        chatId,
        senderId,
        receiverId,
        amount,
        creditorName: creditor?.name ?? "Unknown",
        creditorUsername: creditor?.username ?? undefined,
        debtorName: debtor?.name ?? "Unknown",
        sendNotification: true,
      };
      if (opts.currency) input.currency = opts.currency;
      if (opts.description) input.description = opts.description;

      return trpc.settlement.createSettlement.mutate(
        input as Parameters<typeof trpc.settlement.createSettlement.mutate>[0]
      );
    },
  },
];
```

**Step 2: Verify types**

Run: `npx tsc --noEmit` from `apps/cli/`

**Step 3: Commit**

```bash
git add apps/cli/src/commands/settlement.ts
git commit -m "feat(cli): add settlement commands (list, create)"
```

---

### Task 7: Snapshot + Currency Commands

**Files:**

- Create: `apps/cli/src/commands/snapshot.ts`
- Create: `apps/cli/src/commands/currency.ts`

**Step 1: Create `src/commands/snapshot.ts`**

```typescript
import type { Command } from "./types.js";
import { resolveChatId } from "../scope.js";

export const snapshotCommands: Command[] = [
  {
    name: "list-snapshots",
    description: "List all expense snapshots in a chat",
    options: {
      "chat-id": { type: "string", description: "The numeric chat ID" },
    },
    async execute(opts, trpc) {
      const chatId = await resolveChatId(
        trpc,
        opts["chat-id"] as string | undefined
      );
      return trpc.snapshot.getByChat.query({ chatId });
    },
  },
  {
    name: "get-snapshot",
    description: "Get full details of a snapshot including expenses",
    options: {
      "snapshot-id": { type: "string", description: "The snapshot UUID" },
    },
    async execute(opts, trpc) {
      const snapshotId = opts["snapshot-id"] as string;
      if (!snapshotId) throw new Error("--snapshot-id is required");
      return trpc.snapshot.getDetails.query({ snapshotId });
    },
  },
];
```

**Step 2: Create `src/commands/currency.ts`**

```typescript
import type { Command } from "./types.js";

export const currencyCommands: Command[] = [
  {
    name: "get-exchange-rate",
    description: "Get exchange rate between two currencies",
    options: {
      "base-currency": {
        type: "string",
        description: "Source currency code (e.g. USD)",
      },
      "target-currency": {
        type: "string",
        description: "Target currency code (e.g. SGD)",
      },
    },
    async execute(opts, trpc) {
      const baseCurrency = opts["base-currency"] as string;
      if (!baseCurrency) throw new Error("--base-currency is required");
      const targetCurrency = opts["target-currency"] as string;
      if (!targetCurrency) throw new Error("--target-currency is required");
      return trpc.currency.getCurrentRate.query({
        baseCurrency,
        targetCurrency,
      });
    },
  },
];
```

**Step 3: Verify types**

Run: `npx tsc --noEmit` from `apps/cli/`

**Step 4: Commit**

```bash
git add apps/cli/src/commands/snapshot.ts apps/cli/src/commands/currency.ts
git commit -m "feat(cli): add snapshot and currency commands"
```

---

### Task 8: CLI Entry Point

**Files:**

- Create: `apps/cli/src/cli.ts`

**Step 1: Create `src/cli.ts`**

This is the main entry point. It parses the command name, resolves auth, builds the tRPC client, collects all commands, finds the matching one, parses its options with `util.parseArgs`, and executes it.

```typescript
#!/usr/bin/env node
import { parseArgs } from "node:util";
import { createTrpcClient } from "./client.js";
import { resolveApiKey, resolveApiUrl, writeConfigFile } from "./config.js";
import { error, run } from "./output.js";
import { chatCommands } from "./commands/chat.js";
import { expenseCommands } from "./commands/expense.js";
import { settlementCommands } from "./commands/settlement.js";
import { snapshotCommands } from "./commands/snapshot.js";
import { currencyCommands } from "./commands/currency.js";
import type { Command, CommandOption } from "./commands/types.js";

const ALL_COMMANDS: Command[] = [
  ...chatCommands,
  ...expenseCommands,
  ...settlementCommands,
  ...snapshotCommands,
  ...currencyCommands,
];

/** Global options parsed before command dispatch */
const GLOBAL_OPTIONS = {
  "api-key": {
    type: "string" as const,
    description: "API key for authentication",
  },
  "api-url": { type: "string" as const, description: "tRPC API URL" },
};

function printHelp(): void {
  const lines = [
    { command: "help", description: "Show this help message" },
    {
      command: "login",
      description: "Save API key and URL to ~/.bananasplit.json",
    },
    ...ALL_COMMANDS.map((c) => ({
      command: c.name,
      description: c.description,
    })),
  ];

  const help = {
    usage: "banana <command> [options]",
    globalOptions: {
      "--api-key": "API key (overrides env and config file)",
      "--api-url": "tRPC API URL (overrides env and config file)",
    },
    commands: Object.fromEntries(lines.map((l) => [l.command, l.description])),
    commandDetails: Object.fromEntries(
      ALL_COMMANDS.map((c) => [
        c.name,
        Object.fromEntries(
          Object.entries(c.options).map(([k, v]) => [`--${k}`, v.description])
        ),
      ])
    ),
  };
  console.log(JSON.stringify(help, null, 2));
}

function handleLogin(args: string[]): never {
  const { values } = parseArgs({
    args,
    options: {
      "api-key": { type: "string" },
      "api-url": { type: "string" },
    },
    strict: false,
  });
  const apiKey = values["api-key"] as string | undefined;
  if (!apiKey) error("missing_option", "--api-key is required", "login");
  const config: Record<string, string> = { apiKey };
  if (values["api-url"]) config.apiUrl = values["api-url"] as string;
  writeConfigFile(config);
  console.log(
    JSON.stringify({ ok: true, message: "Config saved to ~/.bananasplit.json" })
  );
  process.exit(0);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const commandName = args[0];

  if (!commandName || commandName === "help" || commandName === "--help") {
    printHelp();
    process.exit(0);
  }

  if (commandName === "login") {
    handleLogin(args.slice(1));
  }

  // Parse global options from all args to extract --api-key and --api-url
  const { values: globalValues } = parseArgs({
    args: args.slice(1),
    options: {
      "api-key": { type: "string" },
      "api-url": { type: "string" },
    },
    strict: false,
  });

  const command = ALL_COMMANDS.find((c) => c.name === commandName);
  if (!command) {
    error(
      "unknown_command",
      `Unknown command: ${commandName}. Run 'banana help' for available commands.`
    );
  }

  // Resolve auth
  const apiKey = resolveApiKey(globalValues["api-key"] as string | undefined);
  if (!apiKey) {
    error(
      "auth_error",
      "No API key found. Set --api-key, BANANA_SPLIT_API_KEY env var, or run 'banana login'."
    );
  }
  const apiUrl = resolveApiUrl(globalValues["api-url"] as string | undefined);

  // Parse command-specific options
  const parseArgsOptions: Record<string, { type: "string" | "boolean" }> = {
    "api-key": { type: "string" },
    "api-url": { type: "string" },
  };
  for (const [name, opt] of Object.entries(command.options)) {
    parseArgsOptions[name] = { type: opt.type };
  }
  const { values: cmdValues } = parseArgs({
    args: args.slice(1),
    options: parseArgsOptions,
    strict: false,
  });

  // Remove global options from command values
  delete cmdValues["api-key"];
  delete cmdValues["api-url"];

  const trpc = createTrpcClient(apiKey, apiUrl);
  await run(command.name, () => command.execute(cmdValues, trpc));
}

main().catch((err) => {
  error("api_error", err instanceof Error ? err.message : String(err));
});
```

**Step 2: Verify types**

Run: `npx tsc --noEmit` from `apps/cli/`

**Step 3: Commit**

```bash
git add apps/cli/src/cli.ts
git commit -m "feat(cli): add CLI entry point with arg parsing, help, and login"
```

---

### Task 9: Build, Type-Check, and Smoke Test

**Step 1: Run type checks across monorepo**

Run: `npx turbo run check-types`
Expected: All packages pass, including `@bananasplit/cli`.

**Step 2: Build the CLI**

Run: `npx turbo run build --filter=@bananasplit/cli`
Expected: `apps/cli/dist/` contains compiled JS files.

**Step 3: Smoke test help command**

Run: `node apps/cli/dist/cli.js help`
Expected: JSON output listing all 15 commands with descriptions and options.

**Step 4: Smoke test auth error**

Run: `node apps/cli/dist/cli.js list-chats`
Expected: JSON error to stderr with `auth_error` (assuming no env/config set).

**Step 5: Smoke test with API key** (requires valid key)

Run: `BANANA_SPLIT_API_KEY=<key> node apps/cli/dist/cli.js list-chats`
Expected: JSON array of chats on stdout.

**Step 6: Fix any type errors or runtime issues found**

Iterate until build + smoke tests pass.

**Step 7: Commit any fixes**

```bash
git add -A apps/cli/
git commit -m "fix(cli): address type/runtime issues from smoke testing"
```

---

### Task 10: Final Verification and Cleanup

**Step 1: Ensure shebang is in place**

Verify `apps/cli/src/cli.ts` starts with `#!/usr/bin/env node`. After `tsc` compilation, the shebang should carry over to `dist/cli.js`. If not, add a build post-step.

**Step 2: Test npx execution**

Run from repo root: `npx tsx apps/cli/src/cli.ts help`
Expected: Same JSON help output.

**Step 3: Full monorepo type check**

Run: `npx turbo run check-types`
Expected: All packages pass.

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(cli): complete @bananasplit/cli v0.1.0"
```
