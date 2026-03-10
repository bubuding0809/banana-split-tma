# Chat-Scoped API Keys Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement chat-scoped API keys so each Telegram group gets its own API key restricting all API access to that group's data only.

**Architecture:** New `ChatApiKey` Prisma model stores hashed keys with chat associations. The `protectedProcedure` middleware gains 3-path auth (superadmin → chat-api-key → telegram). A new `apiKey` tRPC router provides generate/revoke/getScope procedures. The MCP server auto-detects scope on startup.

**Tech Stack:** Prisma (PostgreSQL), tRPC, Zod, Node.js crypto (SHA-256 + randomBytes), superjson

**Design Document:** `docs/plans/2026-03-09-chat-scoped-api-keys-design.md` — READ THIS for the full approved design including data model, middleware flow, and access control table.

**Important Notes:**

- Use `--no-verify` on all git commits (pre-existing type errors in `apps/web` unrelated to this work)
- The tRPC API uses superjson transformer
- `@trpc/client` must be pinned to `11.0.0` (not `^11.x`)
- Telegram bot commands are in a separate external repo — this repo only provides the tRPC procedures
- All procedures use `protectedProcedure` (not `publicProcedure`)

---

## Progress

| Task                                                         | Status      | Commit    | Notes                                                                                                                                      |
| ------------------------------------------------------------ | ----------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Task 1: ChatApiKey Prisma model & migration                  | ✅ Complete | `44aa4dc` | Fixed `onUpdate: Cascade` on chat relation (code quality review)                                                                           |
| Task 2: apiKey tRPC router (generate, revoke, getScope)      | ✅ Complete | `237828c` | Fixed handler input types to use `z.infer<typeof inputSchema>` (code quality review)                                                       |
| Task 3: Update protectedProcedure middleware for 3-path auth | ✅ Complete | `b26c319` | Added `crypto.timingSafeEqual` for superadmin key comparison (code quality review). Removed stale `as unknown as` cast from `getScope.ts`. |
| Task 4: Add chat-scope enforcement to procedures             | ⏭️ Next     | —         | ~50 procedure files need `assertChatScope` / `assertNotChatScoped`                                                                         |
| Task 5: Update MCP server for auto-scoping                   | ❌ Pending  | —         |                                                                                                                                            |
| Task 6: Build, test MCP against local dev                    | ❌ Pending  | —         |                                                                                                                                            |

**Branch:** `feat/mcp-server` — 4 commits ahead of `origin/feat/mcp-server` (not yet pushed)

## Discoveries

- **`onUpdate: Cascade`** is the codebase convention for all Chat foreign keys — added to `ChatApiKey.chat` relation.
- **`z.infer<typeof inputSchema>`** is the codebase convention for handler input types (not manually writing `{ chatId: bigint }`).
- **Forward dependencies between tasks are expected**: Task 2's `authType === "superadmin"` checks didn't work until Task 3 updated the middleware. The `getScope.ts` procedure used `ctx.session as unknown as { authType: string; chatId: bigint | null }` temporarily — Task 3 removed this cast.
- **`ctx.session` now has `authType: "superadmin" | "chat-api-key" | "telegram"`** and `chatId: bigint | null` (updated in Task 3).
- **`crypto.timingSafeEqual`** is used for superadmin key comparison (defense-in-depth, code quality review suggestion).
- **No `try/catch` wrapping in handlers** is acceptable — tRPC handles errors at the framework level.
- **Prisma migration for `onUpdate: Cascade`** is not needed — it's a Prisma-level annotation only; PostgreSQL defaults to CASCADE for updates.
- **`publicProcedure` is exported but never used** — all 58+ procedures use `protectedProcedure`.
- **Two `chatId` input patterns exist**: `z.number()` for queries, `z.number().transform(BigInt)` for mutations writing to DB.
- **Redundant `botToken` null check** exists inside the try block at `trpc.ts:142-144` (pre-existing dead code, left as-is since not in scope).
- **No unit test framework** exists in the trpc package for middleware — tracked as tech debt.

---

## Task 1: Add ChatApiKey Prisma Model & Run Migration

**Files:**

- Modify: `packages/database/prisma/schema.prisma` (add model at end of file, after `ExpenseSnapshot` model at line 147)

**Step 1: Add the ChatApiKey model to the Prisma schema**

Add to the end of `packages/database/prisma/schema.prisma`:

```prisma
model ChatApiKey {
  id          String    @id @default(uuid())
  keyHash     String    @unique
  keyPrefix   String
  chatId      BigInt
  chat        Chat      @relation(fields: [chatId], references: [id], onDelete: Cascade)
  createdById BigInt
  createdBy   User      @relation(fields: [createdById], references: [id])
  revokedAt   DateTime?
  createdAt   DateTime  @default(now())

  @@index([chatId])
}
```

Also add the reverse relation fields to the existing `Chat` and `User` models.

In the `Chat` model (after the `ExpenseSnapshot` field on line 33):

```prisma
  apiKeys                    ChatApiKey[]
```

In the `User` model (after the `ExpenseSnapshot` field on line 52):

```prisma
  createdApiKeys       ChatApiKey[]
```

**Step 2: Generate Prisma client**

Run from repo root:

```bash
pnpm turbo db:generate
```

Expected: Prisma client regenerated successfully. The `ChatApiKey` model should now be available on the Prisma client.

**Step 3: Create database migration**

Run from `packages/database`:

```bash
pnpm prisma migrate dev --name add-chat-api-key --skip-generate
```

Expected: Migration created in `packages/database/prisma/migrations/` directory. Migration SQL should contain `CREATE TABLE "ChatApiKey"` with all columns, a unique index on `keyHash`, and a regular index on `chatId`.

**Step 4: Verify by rebuilding the database package**

Run from repo root:

```bash
pnpm turbo build --filter=@dko/database
```

Expected: Build succeeds with no errors.

**Step 5: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/
git commit --no-verify -m "feat: add ChatApiKey prisma model for chat-scoped API keys"
```

---

## Task 2: Create apiKey tRPC Router (generate, revoke, getScope)

**Files:**

- Create: `packages/trpc/src/routers/apiKey/index.ts`
- Create: `packages/trpc/src/routers/apiKey/generate.ts`
- Create: `packages/trpc/src/routers/apiKey/revoke.ts`
- Create: `packages/trpc/src/routers/apiKey/getScope.ts`
- Modify: `packages/trpc/src/routers/index.ts` (add export)
- Modify: `packages/trpc/src/root.ts` (register router)

### Step 1: Create `packages/trpc/src/routers/apiKey/generate.ts`

This procedure generates a new chat-scoped API key. Superadmin-only.

```typescript
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import crypto from "node:crypto";
import { Db, protectedProcedure } from "../../trpc.js";

const inputSchema = z.object({
  chatId: z.number().transform((val) => BigInt(val)),
  createdById: z.number().transform((val) => BigInt(val)),
});

const outputSchema = z.object({
  rawKey: z.string(),
  keyPrefix: z.string(),
});

export const generateApiKeyHandler = async (
  input: { chatId: bigint; createdById: bigint },
  db: Db,
  authType: string
) => {
  // Only superadmin can generate keys
  if (authType !== "superadmin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only superadmin can generate API keys",
    });
  }

  // Verify chat exists
  const chat = await db.chat.findUnique({ where: { id: input.chatId } });
  if (!chat) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `Chat ${input.chatId} not found`,
    });
  }

  // Verify user exists
  const user = await db.user.findUnique({ where: { id: input.createdById } });
  if (!user) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `User ${input.createdById} not found`,
    });
  }

  // Revoke any existing active key for this chat
  await db.chatApiKey.updateMany({
    where: {
      chatId: input.chatId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });

  // Generate new key: bsk_ + 48 random bytes as base64url
  const randomBytes = crypto.randomBytes(48);
  const rawKey = `bsk_${randomBytes.toString("base64url")}`;
  const keyPrefix = rawKey.slice(0, 8);

  // Hash the key for storage
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

  // Store in database
  await db.chatApiKey.create({
    data: {
      keyHash,
      keyPrefix,
      chatId: input.chatId,
      createdById: input.createdById,
    },
  });

  return { rawKey, keyPrefix };
};

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    return generateApiKeyHandler(input, ctx.db, ctx.session.authType);
  });
```

### Step 2: Create `packages/trpc/src/routers/apiKey/revoke.ts`

```typescript
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, protectedProcedure } from "../../trpc.js";

const inputSchema = z.object({
  chatId: z.number().transform((val) => BigInt(val)),
});

const outputSchema = z.object({
  keyPrefix: z.string(),
  revoked: z.boolean(),
});

export const revokeApiKeyHandler = async (
  input: { chatId: bigint },
  db: Db,
  authType: string
) => {
  // Only superadmin can revoke keys
  if (authType !== "superadmin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only superadmin can revoke API keys",
    });
  }

  // Find active key for this chat
  const activeKey = await db.chatApiKey.findFirst({
    where: {
      chatId: input.chatId,
      revokedAt: null,
    },
  });

  if (!activeKey) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `No active API key found for chat ${input.chatId}`,
    });
  }

  // Revoke it
  await db.chatApiKey.update({
    where: { id: activeKey.id },
    data: { revokedAt: new Date() },
  });

  return { keyPrefix: activeKey.keyPrefix, revoked: true };
};

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    return revokeApiKeyHandler(input, ctx.db, ctx.session.authType);
  });
```

### Step 3: Create `packages/trpc/src/routers/apiKey/getScope.ts`

```typescript
import { z } from "zod";
import { protectedProcedure } from "../../trpc.js";

const outputSchema = z.union([
  z.object({
    scoped: z.literal(false),
  }),
  z.object({
    scoped: z.literal(true),
    chatId: z.number(),
    chatTitle: z.string(),
  }),
]);

export default protectedProcedure
  .output(outputSchema)
  .query(async ({ ctx }) => {
    const { authType, chatId } = ctx.session;

    if (authType !== "chat-api-key" || chatId === null) {
      return { scoped: false as const };
    }

    // Fetch chat title for the scoped chat
    const chat = await ctx.db.chat.findUnique({
      where: { id: chatId },
      select: { title: true },
    });

    return {
      scoped: true as const,
      chatId: Number(chatId),
      chatTitle: chat?.title ?? "Unknown Chat",
    };
  });
```

### Step 4: Create `packages/trpc/src/routers/apiKey/index.ts`

```typescript
import { createTRPCRouter } from "../../trpc.js";
import generate from "./generate.js";
import revoke from "./revoke.js";
import getScope from "./getScope.js";

export const apiKeyRouter = createTRPCRouter({
  generate,
  revoke,
  getScope,
});
```

### Step 5: Register the router

Modify `packages/trpc/src/routers/index.ts` — add this line at the end:

```typescript
export { apiKeyRouter } from "./apiKey/index.js";
```

Modify `packages/trpc/src/root.ts` — add `apiKeyRouter` to imports and the router definition:

Update the import to include `apiKeyRouter`:

```typescript
import {
  aiRouter,
  apiKeyRouter,
  awsRouter,
  chatRouter,
  currencyRouter,
  expenseRouter,
  expenseShareRouter,
  settlementRouter,
  snapshotRouter,
  telegramRouter,
  userRouter,
} from "./routers/index.js";
```

Update the router definition to include `apiKey`:

```typescript
export const appRouter = createTRPCRouter({
  ai: aiRouter,
  apiKey: apiKeyRouter,
  aws: awsRouter,
  chat: chatRouter,
  user: userRouter,
  telegram: telegramRouter,
  expense: expenseRouter,
  expenseShare: expenseShareRouter,
  settlement: settlementRouter,
  currency: currencyRouter,
  snapshot: snapshotRouter,
});
```

### Step 6: Verify types compile

Run from repo root:

```bash
pnpm turbo check-types --filter=@dko/trpc
```

Expected: Type check passes. (Note: `apps/web` has pre-existing type errors — ignore those. Only `@dko/trpc` must pass.)

### Step 7: Commit

```bash
git add packages/trpc/src/routers/apiKey/ packages/trpc/src/routers/index.ts packages/trpc/src/root.ts
git commit --no-verify -m "feat: add apiKey tRPC router with generate, revoke, and getScope procedures"
```

---

## Task 3: Update protectedProcedure Middleware for 3-Path Auth

**Files:**

- Modify: `packages/trpc/src/trpc.ts` (lines 74-158, the `protectedProcedure` definition)

### Step 1: Update the protectedProcedure middleware

Replace the entire `protectedProcedure` export (lines 74-158 of `packages/trpc/src/trpc.ts`) with this updated version that adds the chat-api-key auth path:

```typescript
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  const req = ctx.request as CreateExpressContextOptions["req"];
  const { headers } = req;
  const apiKey = headers["x-api-key"];
  const authorization = headers["authorization"];

  let user: TelegramUser | null = null;
  let authType: "superadmin" | "chat-api-key" | "telegram" = "superadmin";
  let chatId: bigint | null = null;

  // Check for API key authentication
  if (apiKey) {
    const validApiKey = process.env.API_KEY;

    // Path 1: Superadmin key (existing env-based API key)
    if (validApiKey && apiKey === validApiKey) {
      authType = "superadmin";
    }
    // Path 2: Chat-scoped key (hashed lookup in DB)
    else {
      const crypto = await import("node:crypto");
      const keyHash = crypto
        .createHash("sha256")
        .update(apiKey as string)
        .digest("hex");

      const chatApiKey = await ctx.db.chatApiKey.findUnique({
        where: { keyHash },
      });

      if (!chatApiKey || chatApiKey.revokedAt !== null) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid API key",
        });
      }

      authType = "chat-api-key";
      chatId = chatApiKey.chatId;
    }
  }
  // Check for Telegram authentication
  else if (authorization) {
    const parts = authorization.split(" ");
    if (parts.length !== 2 || parts[0] !== "tma") {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Invalid authorization format. Expected: 'tma <initData>'",
      });
    }

    const initData = parts[1];
    if (!initData) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Missing initData in authorization header",
      });
    }
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    if (!botToken) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Bot token not configured",
      });
    }

    try {
      if (!botToken) {
        throw new Error("Bot token is required but not available");
      }
      validateInitData(initData, botToken);

      user = parseInitData(initData).user ?? null;
      authType = "telegram";
    } catch (error) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Invalid Telegram authentication",
      });
    }
  }
  // No authentication provided
  else {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message:
        "Authentication required. Provide either X-Api-Key header or Authorization header with Telegram initData",
    });
  }

  if (authType === "telegram") {
    console.info(
      `Authenticated user: ${user?.id} (${user?.username || "no username"})`
    );
  }

  return next({
    ctx: {
      session: {
        user,
        authType,
        chatId,
      },
    },
  });
});
```

Key changes from the original:

1. `authType` type changed from `"api-key" | "telegram"` to `"superadmin" | "chat-api-key" | "telegram"`
2. Added `chatId: bigint | null` to session
3. When API key doesn't match env `API_KEY`, hashes it and looks up in `ChatApiKey` table
4. Dynamic `import("node:crypto")` to avoid top-level import issues (or use static import if preferred — see note below)

**Note on crypto import:** If the trpc package's tsconfig targets Node.js and `node:crypto` is available, you can use a static import at the top of the file instead:

```typescript
import crypto from "node:crypto";
```

Add this to the top of the file alongside the other imports. Then in the middleware, use `crypto.createHash(...)` directly without the dynamic import.

### Step 2: Verify types compile

Run:

```bash
pnpm turbo check-types --filter=@dko/trpc
```

Expected: Type check passes. The `ctx.session` type now includes `chatId: bigint | null` and `authType` with the three union members.

### Step 3: Commit

```bash
git add packages/trpc/src/trpc.ts
git commit --no-verify -m "feat: add 3-path auth to protectedProcedure (superadmin, chat-api-key, telegram)"
```

---

## Task 4: Add Chat-Scope Enforcement to Procedures

**Files:**

- Create: `packages/trpc/src/middleware/chatScope.ts`
- Modify: All procedures that accept `chatId` as input (see list below)
- Modify: `chat/getAllChats.ts` (block for chat-scoped keys)
- Modify: All `telegram/*` procedures (block for chat-scoped keys)

This is the most impactful task. We need to enforce that chat-scoped API keys can only access data belonging to their associated chat.

### Step 1: Create the chat-scope enforcement utility

Create `packages/trpc/src/middleware/chatScope.ts`:

```typescript
import { TRPCError } from "@trpc/server";

interface SessionWithScope {
  authType: "superadmin" | "chat-api-key" | "telegram";
  chatId: bigint | null;
}

/**
 * Asserts that a chat-scoped API key is authorized to access the given chatId.
 * - Superadmin and telegram auth: always allowed (no restriction).
 * - Chat-api-key auth: input chatId must match session chatId exactly.
 *
 * Call this at the START of any procedure handler that accepts chatId as input.
 */
export function assertChatScope(
  session: SessionWithScope,
  inputChatId: bigint | number
): void {
  if (session.authType !== "chat-api-key") {
    return; // Superadmin and telegram are unrestricted
  }

  const inputAsBigInt =
    typeof inputChatId === "number" ? BigInt(inputChatId) : inputChatId;

  if (session.chatId !== inputAsBigInt) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This API key does not have access to the requested chat",
    });
  }
}

/**
 * Asserts that the current request is NOT from a chat-scoped API key.
 * Use this for procedures that should be blocked entirely for chat-scoped keys
 * (e.g., getAllChats, telegram.* procedures).
 */
export function assertNotChatScoped(session: SessionWithScope): void {
  if (session.authType === "chat-api-key") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This operation is not available with a chat-scoped API key",
    });
  }
}
```

### Step 2: Add scope enforcement to chat procedures

Each procedure that accepts `chatId` needs to call `assertChatScope` at the start of its handler or in the procedure definition. The exact integration depends on the procedure pattern:

**Pattern A — Procedures where the handler is called from the procedure definition (most procedures):**

Add the scope check in the procedure's `.query()` / `.mutation()` callback, before calling the handler.

**Pattern B — Procedures that need to block chat-scoped keys entirely:**

Add `assertNotChatScoped` at the start of the procedure callback.

Here are ALL the procedures that need modification and the exact changes:

#### Chat procedures with `chatId` input (Pattern A — add `assertChatScope`):

For each of these files, add the import and scope check. Example for `packages/trpc/src/routers/chat/getChat.ts`:

Current (line 32-36):

```typescript
export default protectedProcedure
  .input(inputSchema)
  .query(async ({ input, ctx }) => {
    return getChatHandler(input, ctx.db);
  });
```

Updated:

```typescript
import { assertChatScope } from "../../middleware/chatScope.js";

// ... existing code unchanged ...

export default protectedProcedure
  .input(inputSchema)
  .query(async ({ input, ctx }) => {
    assertChatScope(ctx.session, input.chatId);
    return getChatHandler(input, ctx.db);
  });
```

Apply this same pattern to ALL of these files (each takes `chatId` in input):

**`packages/trpc/src/routers/chat/` procedures:**

- `getChat.ts` — `input.chatId` is `z.number()`
- `updateChat.ts` — `input.chatId`
- `addMember.ts` — `input.chatId`
- `removeMember.ts` — `input.chatId`
- `getMembers.ts` — `input.chatId`
- `hasMember.ts` — `input.chatId`
- `getDebtors.ts` — `input.chatId`
- `getDebtorsMultiCurrency.ts` — `input.chatId`
- `getCreditors.ts` — `input.chatId`
- `getCreditorsMultiCurrency.ts` — `input.chatId`
- `getSimplifiedDebts.ts` — `input.chatId`
- `getSimplifiedDebtsMultiCurrency.ts` — `input.chatId`
- `getBulkChatDebts.ts` — `input.chatId`

**`packages/trpc/src/routers/expense/` procedures:**

- `createExpense.ts` — `input.chatId` (transformed to BigInt via `.transform()`)
- `updateExpense.ts` — `input.chatId` (transformed to BigInt)
- `getAllExpensesByChat.ts` — `input.chatId`
- `getExpenseByChat.ts` — `input.chatId`
- `convertCurrencyBulk.ts` — `input.chatId`

**`packages/trpc/src/routers/expenseShare/` procedures:**

- `getNetShare.ts` — `input.chatId`
- `getTotalBorrowed.ts` — `input.chatId`
- `getTotalLent.ts` — `input.chatId`

**`packages/trpc/src/routers/settlement/` procedures:**

- `createSettlement.ts` — `input.chatId` (transformed to BigInt)
- `getSettlementByChat.ts` — `input.chatId`
- `getAllSettlementsByChat.ts` — `input.chatId`
- `deleteSettlement.ts` — needs special handling (see below)
- `settleAllDebts.ts` — `input.chatId` (transformed to BigInt)

**`packages/trpc/src/routers/snapshot/` procedures:**

- `createSnapshot.ts` — `input.chatId`
- `getSnapshots.ts` — `input.chatId`
- `updateSnapshot.ts` — `input.chatId`
- `deleteSnapshot.ts` — needs special handling (see below)

**`packages/trpc/src/routers/aws/` procedures:**

- `getChatSchedule.ts` — `input.chatId`
- `createGroupReminderSchedule.ts` — `input.chatId`
- `updateGroupReminderSchedule.ts` — `input.chatId`
- `deleteGroupReminderSchedule.ts` — `input.chatId`
- `createRecurringSchedule.ts` — `input.chatId`

**Special cases — procedures that take an entity ID but no direct `chatId`:**

For `expense/getExpenseDetails.ts` (takes `expenseId`), `expense/deleteExpense.ts` (takes `expenseId`), `settlement/deleteSettlement.ts` (takes `settlementId`), `snapshot/getSnapshotDetails.ts` (takes `snapshotId`), `snapshot/deleteSnapshot.ts` (takes `snapshotId`):

These procedures load the entity first, then you check `entity.chatId` against the session scope. Add the check after the entity is loaded in the handler:

```typescript
import { assertChatScope } from "../../middleware/chatScope.js";

// In the handler, after loading the entity:
const expense = await db.expense.findUnique({ where: { id: input.expenseId } });
if (!expense) {
  throw new TRPCError({ code: "NOT_FOUND", message: "..." });
}
assertChatScope(session, expense.chatId);
// ... continue with existing logic
```

For these procedures, the handler function signature needs to accept the session. Update the procedure definition to pass `ctx.session`:

```typescript
export default protectedProcedure
  .input(inputSchema)
  .mutation(async ({ input, ctx }) => {
    return deleteExpenseHandler(input, ctx.db, ctx.teleBot, ctx.session);
  });
```

### Step 3: Block chat-scoped keys from cross-chat procedures (Pattern B)

**`packages/trpc/src/routers/chat/getAllChats.ts`:**

```typescript
import { assertNotChatScoped } from "../../middleware/chatScope.js";

// Update the procedure (line 51-66):
export default protectedProcedure
  .meta({
    /* existing meta */
  })
  .input(inputSchema)
  .output(outputSchema)
  .query(async ({ input, ctx }) => {
    assertNotChatScoped(ctx.session);
    return getAllChatsHandler(input, ctx.db);
  });
```

**`packages/trpc/src/routers/chat/createChat.ts`** — block for chat-scoped keys:

```typescript
import { assertNotChatScoped } from "../../middleware/chatScope.js";
// Add assertNotChatScoped(ctx.session) before the handler call
```

**`packages/trpc/src/routers/chat/migrateChat.ts`** — block for chat-scoped keys:

```typescript
import { assertNotChatScoped } from "../../middleware/chatScope.js";
// Add assertNotChatScoped(ctx.session) before the handler call
```

**All `packages/trpc/src/routers/telegram/` procedures** — block entirely for chat-scoped keys. Each procedure file in the telegram router should get:

```typescript
import { assertNotChatScoped } from "../../middleware/chatScope.js";
// Add assertNotChatScoped(ctx.session) at the start of the procedure callback
```

Telegram procedure files to modify:

- `sendExpenseNotificationMessage.ts`
- `editExpenseNotificationMessage.ts`
- `deleteExpenseNotificationMessage.ts`
- `sendMessage.ts`
- `sendDebtReminderMessage.ts`
- `sendGroupReminderMessage.ts`
- `sendSettlementNotificationMessage.ts`
- `getChat.ts`
- `getChatMember.ts`
- `getUserProfilePhotoUrl.ts`

**`packages/trpc/src/routers/user/` procedures** — block `createUser` and `updateUser` for chat-scoped keys. `getUser` can remain accessible (users need to look up member names).

**`packages/trpc/src/routers/ai/` procedures** — block for chat-scoped keys (AI classification is internal):

```typescript
import { assertNotChatScoped } from "../../middleware/chatScope.js";
```

**Procedures that remain unrestricted (no changes needed):**

- `currency/getCurrentRate.ts` — global, no chat association
- `currency/getSupportedCurrencies.ts` — global
- `currency/getMultipleRates.ts` — global
- `currency/refreshRates.ts` — global (though should probably be superadmin-only, that's a separate concern)
- `currency/getCurrenciesWithBalance.ts` — has `chatId`, so add `assertChatScope`
- `apiKey/getScope.ts` — accessible by any valid key (already implemented in Task 2)

### Step 4: Verify types compile

Run:

```bash
pnpm turbo check-types --filter=@dko/trpc
```

Expected: Type check passes.

### Step 5: Commit

```bash
git add packages/trpc/src/middleware/ packages/trpc/src/routers/
git commit --no-verify -m "feat: enforce chat-scope on all procedures via assertChatScope/assertNotChatScoped"
```

---

## Task 5: Update MCP Server for Auto-Scoping

**Files:**

- Modify: `apps/mcp/src/index.ts`
- Create: `apps/mcp/src/scope.ts`
- Modify: `apps/mcp/src/tools/chat.ts`
- Modify: `apps/mcp/src/tools/expense.ts`
- Modify: `apps/mcp/src/tools/settlement.ts`
- Modify: `apps/mcp/src/tools/snapshot.ts`
- Modify: `apps/mcp/src/tools/currency.ts` (no changes needed, but verify)

### Step 1: Create the scope module

Create `apps/mcp/src/scope.ts`:

```typescript
import { trpc } from "./client.js";

interface Scope {
  scoped: boolean;
  chatId: number | null;
  chatTitle: string | null;
}

let cachedScope: Scope | null = null;

/**
 * Fetches and caches the API key scope.
 * Chat-scoped keys return { scoped: true, chatId, chatTitle }.
 * Superadmin keys return { scoped: false, chatId: null, chatTitle: null }.
 */
export async function getScope(): Promise<Scope> {
  if (cachedScope) return cachedScope;

  try {
    const result = await trpc.apiKey.getScope.query();

    if (result.scoped) {
      cachedScope = {
        scoped: true,
        chatId: result.chatId,
        chatTitle: result.chatTitle,
      };
    } else {
      cachedScope = {
        scoped: false,
        chatId: null,
        chatTitle: null,
      };
    }
  } catch {
    // If getScope fails (e.g., old API without the endpoint), assume unscoped
    console.error(
      "Warning: Could not determine API key scope. Assuming unscoped (superadmin)."
    );
    cachedScope = { scoped: false, chatId: null, chatTitle: null };
  }

  return cachedScope;
}

/**
 * Resolves the chat_id for a tool call.
 * If scoped, returns the scoped chatId (ignoring any user-provided value).
 * If unscoped, returns the user-provided chatId or throws.
 */
export async function resolveChatId(
  userProvidedChatId?: number
): Promise<number> {
  const scope = await getScope();

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

### Step 2: Update MCP server startup to log scope

Modify `apps/mcp/src/index.ts`:

```typescript
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
```

### Step 3: Update chat tools for auto-scoping

Modify `apps/mcp/src/tools/chat.ts`:

- `banana_list_chats`: If scoped, return only the scoped chat info instead of calling `getAllChats`
- `banana_get_chat`: Make `chat_id` optional when scoped
- `banana_get_chat_debts`: Make `chat_id` optional when scoped
- `banana_get_simplified_debts`: Make `chat_id` optional when scoped

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { trpc } from "../client.js";
import { toolHandler } from "./utils.js";
import { getScope, resolveChatId } from "../scope.js";

export function registerChatTools(server: McpServer) {
  server.registerTool(
    "banana_list_chats",
    {
      title: "List Chats",
      description:
        "List all expense-tracking chats/groups in Banana Split. " +
        "Returns chat ID, title, type, base currency, and timestamps. " +
        "Use this to discover available chats before querying expenses or debts. " +
        "If using a chat-scoped API key, returns only the scoped chat.",
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
    toolHandler("banana_list_chats", async ({ exclude_types }) => {
      const scope = await getScope();

      if (scope.scoped && scope.chatId !== null) {
        // For scoped keys, return the scoped chat info directly
        const chat = await trpc.chat.getChat.query({ chatId: scope.chatId });
        const text = `- **${chat.title}** (ID: ${chat.id}, type: ${chat.type}, currency: ${chat.baseCurrency})`;
        return {
          content: [
            {
              type: "text" as const,
              text: `This API key is scoped to a single chat:\n${text}`,
            },
          ],
        };
      }

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
    })
  );

  server.registerTool(
    "banana_get_chat",
    {
      title: "Get Chat Details",
      description:
        "Get detailed information about a specific chat/group, including its members. " +
        "Returns chat title, type, base currency, member list with names/usernames, " +
        "and whether debt simplification is enabled. " +
        "chat_id is optional if using a chat-scoped API key.",
      inputSchema: {
        chat_id: z
          .number()
          .optional()
          .describe(
            "The numeric chat ID. Optional if using a chat-scoped API key."
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    toolHandler("banana_get_chat", async ({ chat_id }) => {
      const resolvedChatId = await resolveChatId(chat_id);
      const chat = await trpc.chat.getChat.query({ chatId: resolvedChatId });
      const members = chat.members
        .map(
          (m) =>
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
    })
  );

  server.registerTool(
    "banana_get_chat_debts",
    {
      title: "Get Chat Debts",
      description:
        "Get all outstanding debts in a chat. Shows who owes whom and how much, " +
        "optionally filtered by currencies. Returns debtor ID, creditor ID, amount, and currency. " +
        "chat_id is optional if using a chat-scoped API key.",
      inputSchema: {
        chat_id: z
          .number()
          .optional()
          .describe(
            "The numeric chat ID. Optional if using a chat-scoped API key."
          ),
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
    toolHandler("banana_get_chat_debts", async ({ chat_id, currencies }) => {
      const resolvedChatId = await resolveChatId(chat_id);
      const result = await trpc.chat.getBulkChatDebts.query({
        chatId: resolvedChatId,
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
    })
  );

  server.registerTool(
    "banana_get_simplified_debts",
    {
      title: "Get Simplified Debts",
      description:
        "Get optimized/simplified debt graph for a chat in a specific currency. " +
        "Reduces the number of transactions needed to settle all debts. " +
        "Returns simplified debts, transaction reduction stats, and member info. " +
        "chat_id is optional if using a chat-scoped API key.",
      inputSchema: {
        chat_id: z
          .number()
          .optional()
          .describe(
            "The numeric chat ID. Optional if using a chat-scoped API key."
          ),
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
    toolHandler(
      "banana_get_simplified_debts",
      async ({ chat_id, currency }) => {
        const resolvedChatId = await resolveChatId(chat_id);
        const result = await trpc.chat.getSimplifiedDebts.query({
          chatId: resolvedChatId,
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
      }
    )
  );
}
```

### Step 4: Update expense tools for auto-scoping

Modify `apps/mcp/src/tools/expense.ts` — make `chat_id` optional in `banana_list_expenses`, `banana_get_net_share`, and `banana_get_totals`. Use `resolveChatId()`.

For `banana_get_expense`, no change needed (it takes `expense_id`, and the backend enforces scope via the entity's chatId).

Key changes for each tool:

```typescript
import { resolveChatId } from "../scope.js";

// In inputSchema: chat_id: z.number().optional().describe("...")
// In handler: const resolvedChatId = await resolveChatId(chat_id);
// Then use resolvedChatId instead of chat_id
```

Full updated file:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { trpc } from "../client.js";
import { toolHandler } from "./utils.js";
import { resolveChatId } from "../scope.js";

export function registerExpenseTools(server: McpServer) {
  server.registerTool(
    "banana_list_expenses",
    {
      title: "List Expenses",
      description:
        "List all expenses in a chat, optionally filtered by currency. " +
        "Returns expense description, amount, currency, payer, date, and split details. " +
        "chat_id is optional if using a chat-scoped API key.",
      inputSchema: {
        chat_id: z
          .number()
          .optional()
          .describe(
            "The numeric chat ID. Optional if using a chat-scoped API key."
          ),
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
    toolHandler("banana_list_expenses", async ({ chat_id, currency }) => {
      const resolvedChatId = await resolveChatId(chat_id);
      const expenses = await trpc.expense.getExpenseByChat.query({
        chatId: resolvedChatId,
        currency,
      });
      if (expenses.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No expenses found." }],
        };
      }
      const text = expenses
        .map((e) => {
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
    })
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
    toolHandler("banana_get_expense", async ({ expense_id }) => {
      const expense = await trpc.expense.getExpenseDetails.query({
        expenseId: expense_id,
      });
      if (!expense || !(expense as any).id) {
        return {
          content: [{ type: "text" as const, text: "Expense not found." }],
        };
      }
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
    })
  );

  server.registerTool(
    "banana_get_net_share",
    {
      title: "Get Net Share Between Users",
      description:
        "Get the net balance between two users in a specific chat and currency. " +
        "Positive means mainUser is owed money by targetUser, negative means mainUser owes. " +
        "chat_id is optional if using a chat-scoped API key.",
      inputSchema: {
        main_user_id: z
          .number()
          .describe("The user whose perspective to calculate from."),
        target_user_id: z
          .number()
          .describe("The other user in the balance calculation."),
        chat_id: z
          .number()
          .optional()
          .describe("The chat ID. Optional if using a chat-scoped API key."),
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
    toolHandler(
      "banana_get_net_share",
      async ({ main_user_id, target_user_id, chat_id, currency }) => {
        const resolvedChatId = await resolveChatId(chat_id);
        const netShare = await trpc.expenseShare.getNetShare.query({
          mainUserId: main_user_id,
          targetUserId: target_user_id,
          chatId: resolvedChatId,
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
      }
    )
  );

  server.registerTool(
    "banana_get_totals",
    {
      title: "Get Total Borrowed and Lent",
      description:
        "Get the total amount a user has borrowed and lent in a specific chat. " +
        "Returns aggregate totals as numbers (not broken down by currency). " +
        "chat_id is optional if using a chat-scoped API key.",
      inputSchema: {
        user_id: z.number().describe("The user ID to check totals for."),
        chat_id: z
          .number()
          .optional()
          .describe("The chat ID. Optional if using a chat-scoped API key."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    toolHandler("banana_get_totals", async ({ user_id, chat_id }) => {
      const resolvedChatId = await resolveChatId(chat_id);
      const [totalBorrowed, totalLent] = await Promise.all([
        trpc.expenseShare.getTotalBorrowed.query({
          userId: user_id,
          chatId: resolvedChatId,
        }),
        trpc.expenseShare.getTotalLent.query({
          userId: user_id,
          chatId: resolvedChatId,
        }),
      ]);
      return {
        content: [
          {
            type: "text" as const,
            text:
              `**User ${user_id} Totals in Chat ${resolvedChatId}:**\n` +
              `Total Borrowed: ${totalBorrowed}\n` +
              `Total Lent: ${totalLent}`,
          },
        ],
      };
    })
  );
}
```

### Step 5: Update settlement tools for auto-scoping

Modify `apps/mcp/src/tools/settlement.ts` — make `chat_id` optional:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { trpc } from "../client.js";
import { toolHandler } from "./utils.js";
import { resolveChatId } from "../scope.js";

export function registerSettlementTools(server: McpServer) {
  server.registerTool(
    "banana_list_settlements",
    {
      title: "List Settlements",
      description:
        "List all debt settlements in a chat, optionally filtered by currency. " +
        "Shows who paid whom, amount, currency, and date. " +
        "chat_id is optional if using a chat-scoped API key.",
      inputSchema: {
        chat_id: z
          .number()
          .optional()
          .describe(
            "The numeric chat ID. Optional if using a chat-scoped API key."
          ),
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
    toolHandler("banana_list_settlements", async ({ chat_id, currency }) => {
      const resolvedChatId = await resolveChatId(chat_id);
      const settlements = await trpc.settlement.getSettlementByChat.query({
        chatId: resolvedChatId,
        currency,
      });
      if (settlements.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No settlements found." }],
        };
      }
      const text = settlements
        .map((s) => {
          const date = s.date
            ? new Date(s.date).toLocaleDateString()
            : "Unknown date";
          return `- User ${s.senderId} paid User ${s.receiverId}: ${s.amount} ${s.currency} (${date}) [ID: ${s.id}]`;
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
    })
  );
}
```

### Step 6: Update snapshot tools for auto-scoping

Modify `apps/mcp/src/tools/snapshot.ts` — make `chat_id` optional in `banana_list_snapshots`. `banana_get_snapshot` takes `snapshot_id`, so no change needed (backend enforces scope):

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { trpc } from "../client.js";
import { toolHandler } from "./utils.js";
import { resolveChatId } from "../scope.js";

export function registerSnapshotTools(server: McpServer) {
  server.registerTool(
    "banana_list_snapshots",
    {
      title: "List Snapshots",
      description:
        "List all expense snapshots in a chat. Snapshots group expenses together " +
        "for a time period or event. Returns snapshot title, creator, and expense count. " +
        "chat_id is optional if using a chat-scoped API key.",
      inputSchema: {
        chat_id: z
          .number()
          .optional()
          .describe(
            "The numeric chat ID. Optional if using a chat-scoped API key."
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    toolHandler("banana_list_snapshots", async ({ chat_id }) => {
      const resolvedChatId = await resolveChatId(chat_id);
      const snapshots = await trpc.snapshot.getByChat.query({
        chatId: resolvedChatId,
      });
      if (snapshots.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No snapshots found." }],
        };
      }
      const text = snapshots
        .map((s) => {
          const expenseCount = s.expenses?.length ?? 0;
          return `- **${s.title || "Untitled"}** by ${s.creator?.firstName || "Unknown"} (${expenseCount} expenses) [ID: ${s.id}]`;
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
    })
  );

  server.registerTool(
    "banana_get_snapshot",
    {
      title: "Get Snapshot Details",
      description:
        "Get full details of a specific snapshot including all expenses within it, " +
        "their amounts, payers, and split details.",
      inputSchema: {
        snapshot_id: z.string().describe("The snapshot UUID."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    toolHandler("banana_get_snapshot", async ({ snapshot_id }) => {
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
        `**Snapshot: ${s.title || "Untitled"}**\n` +
        `Chat: ${s.chat?.title || s.chatId}\n` +
        `Created by: ${s.creator?.firstName || "Unknown"}\n` +
        `Expenses (${s.expenses?.length || 0}):\n${expenses || "  None"}`;
      return {
        content: [{ type: "text" as const, text }],
      };
    })
  );
}
```

### Step 7: Verify currency tools (no changes needed)

`apps/mcp/src/tools/currency.ts` — no changes needed. `banana_get_exchange_rate` is global and has no `chat_id` parameter.

### Step 8: Build and type-check the MCP server

Run:

```bash
pnpm turbo build --filter=banana-split-mcp-server
```

Expected: Build succeeds.

Run:

```bash
pnpm turbo check-types --filter=banana-split-mcp-server
```

Expected: Type check passes.

### Step 9: Commit

```bash
git add apps/mcp/src/
git commit --no-verify -m "feat: add auto-scoping to MCP server with chat-scoped API key support"
```

---

## Task 6: Build, Deploy Migration, and End-to-End Test

**Files:** No new files. This task is verification only.

### Step 1: Full build of all affected packages

Run from repo root:

```bash
pnpm turbo build --filter=@dko/database --filter=@dko/trpc --filter=banana-split-mcp-server
```

Expected: All three packages build successfully.

### Step 2: Type check all affected packages

Run:

```bash
pnpm turbo check-types --filter=@dko/database --filter=@dko/trpc --filter=banana-split-mcp-server
```

Expected: All pass. (Do NOT run `check-types` on `apps/web` — it has pre-existing errors.)

### Step 3: Deploy database migration (if targeting production)

Run from `packages/database`:

```bash
pnpm db:deploy
```

Expected: Migration applied successfully. The `ChatApiKey` table is created in production.

### Step 4: Test MCP server startup with superadmin key

Run:

```bash
BANANA_SPLIT_API_URL="https://banana-split-tma-lambda.vercel.app/api/trpc" \
BANANA_SPLIT_API_KEY="<superadmin-key>" \
node apps/mcp/dist/index.js
```

Expected: Server starts and logs `Banana Split MCP server running via stdio (superadmin — unrestricted)`.

### Step 5: Test with MCP Inspector

Run:

```bash
BANANA_SPLIT_API_URL="https://banana-split-tma-lambda.vercel.app/api/trpc" \
BANANA_SPLIT_API_KEY="<superadmin-key>" \
npx @modelcontextprotocol/inspector node apps/mcp/dist/index.js
```

Test the following:

1. `banana_list_chats` — should return all chats (superadmin, no scope restriction)
2. `banana_get_chat` with a valid `chat_id` — should return chat details
3. `banana_get_chat` without `chat_id` — should error "chat_id is required" (superadmin key is unscoped)

### Step 6: Final commit (if any fixups)

```bash
git add -A
git commit --no-verify -m "fix: address test findings from end-to-end verification"
```

This step is only needed if Steps 1-5 reveal any issues.

---

## Summary of All Files Modified/Created

### Created:

- `packages/trpc/src/routers/apiKey/index.ts`
- `packages/trpc/src/routers/apiKey/generate.ts`
- `packages/trpc/src/routers/apiKey/revoke.ts`
- `packages/trpc/src/routers/apiKey/getScope.ts`
- `packages/trpc/src/middleware/chatScope.ts`
- `apps/mcp/src/scope.ts`
- `packages/database/prisma/migrations/<timestamp>_add_chat_api_key/migration.sql` (auto-generated)

### Modified:

- `packages/database/prisma/schema.prisma` — added `ChatApiKey` model + reverse relations
- `packages/trpc/src/trpc.ts` — 3-path auth in `protectedProcedure`
- `packages/trpc/src/root.ts` — registered `apiKey` router
- `packages/trpc/src/routers/index.ts` — exported `apiKeyRouter`
- `packages/trpc/src/routers/chat/*.ts` — added scope enforcement (~15 files)
- `packages/trpc/src/routers/expense/*.ts` — added scope enforcement (~7 files)
- `packages/trpc/src/routers/expenseShare/*.ts` — added scope enforcement (3 files)
- `packages/trpc/src/routers/settlement/*.ts` — added scope enforcement (~5 files)
- `packages/trpc/src/routers/snapshot/*.ts` — added scope enforcement (~5 files)
- `packages/trpc/src/routers/telegram/*.ts` — blocked for chat-scoped keys (~10 files)
- `packages/trpc/src/routers/ai/*.ts` — blocked for chat-scoped keys
- `packages/trpc/src/routers/aws/*.ts` — added scope enforcement (~5 files)
- `packages/trpc/src/routers/user/*.ts` — blocked createUser/updateUser for chat-scoped keys
- `apps/mcp/src/index.ts` — scope detection on startup
- `apps/mcp/src/tools/chat.ts` — auto-scoping, optional `chat_id`
- `apps/mcp/src/tools/expense.ts` — auto-scoping, optional `chat_id`
- `apps/mcp/src/tools/settlement.ts` — auto-scoping, optional `chat_id`
- `apps/mcp/src/tools/snapshot.ts` — auto-scoping, optional `chat_id`
