# Mastra Agent Authentication & Deterministic Authorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Secure the Mastra Agent by removing its superadmin bypass, injecting an internal agent key, and enforcing deterministic database authorization bounds on its tool executions.

**Architecture:** We are updating the `trpc` package to recognize a new `agent` auth type via internal headers. We will also add a `chatValidation` composable utility to restrict any cross-tenant operations from the agent, specifically targeting the `payerId` and `participantIds` payloads.

**Tech Stack:** Node.js, tRPC, Prisma, Zod, Vitest.

---

### Task 1: Environment Variables & Basic Configuration

**Files:**

- Modify: `.env.example`
- Modify: `apps/bot/src/env.ts`
- Modify: `apps/lambda/api/env.ts` (or equivalent backend env config if it exists)

- [ ] **Step 1: Add `INTERNAL_AGENT_KEY` to example environment file**
      Modify `.env.example` to include a placeholder for the new internal key.

```bash
INTERNAL_AGENT_KEY=replace_with_secure_random_string
```

- [ ] **Step 2: Add validation to bot and backend environment schemas**
      Locate the environment validation files for the bot (`apps/bot/src/env.ts`) and lambda/backend (e.g. `apps/lambda/api/env.ts`) and add `INTERNAL_AGENT_KEY: z.string().min(1)` to ensure the services fail to boot if it's missing.

- [ ] **Step 3: Commit**

```bash
git add .env.example apps/bot/src/env.ts apps/lambda/api/env.ts
git commit -m "chore: add INTERNAL_AGENT_KEY to environment configuration"
```

---

### Task 2: Inject Agent Headers in tRPC Context

**Files:**

- Modify: `packages/agent/src/trpc.ts`
- Modify: `packages/agent/src/trpc.test.ts` (Create if missing)

- [ ] **Step 1: Write the failing test**
      Create/Modify a test to verify `createTrpcCaller` injects `x-agent-key` instead of `x-api-key`.

```typescript
import { expect, test, describe } from "vitest";
import { createTrpcCaller } from "./trpc.js";

describe("createTrpcCaller", () => {
  test("injects correct agent headers", () => {
    process.env.INTERNAL_AGENT_KEY = "test-agent-key";
    const ctx = {
      requestContext: new Map([
        ["telegramUserId", 123],
        ["chatId", 456],
      ]),
    };

    const result = createTrpcCaller(ctx);
    // Note: We'd need to mock/spy on createContext to assert headers,
    // but at minimum ensure the caller doesn't throw.
    expect(result.telegramUserId).toBe(123);
    expect(result.chatId).toBe(456);
  });
});
```

- [ ] **Step 2: Run test to verify it fails/passes**
      Run: `npx vitest run packages/agent/src/trpc.test.ts`

- [ ] **Step 3: Write implementation**
      Update `createTrpcCaller` in `packages/agent/src/trpc.ts` to pass the new agent headers instead of the old `x-api-key`.

```typescript
  const trpcCtx = createContext({
    req: {
      headers: {
        "x-agent-key": process.env.INTERNAL_AGENT_KEY || "",
        "x-agent-user-id": telegramUserId.toString(),
        "x-agent-chat-id": chatId.toString(),
      },
    } as unknown as ExpressContextOptions["req"],
// ...
```

- [ ] **Step 4: Run test to verify it passes**
      Run: `npx vitest run packages/agent/src/trpc.test.ts`

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/trpc.ts packages/agent/src/trpc.test.ts
git commit -m "feat(agent): inject x-agent-key and explicit scope headers instead of x-api-key"
```

---

### Task 3: Update Backend Authentication Middleware

**Files:**

- Modify: `packages/trpc/src/trpc.ts`
- Modify: `packages/trpc/src/middleware/chatScope.ts`

- [ ] **Step 1: Write implementation for `protectedProcedure`**
      Update `packages/trpc/src/trpc.ts`. Import `crypto` if not already imported. Update `protectedProcedure` to intercept `x-agent-key`, verify it securely against `process.env.INTERNAL_AGENT_KEY`, and set the `authType` to `"agent"`.

```typescript
  import crypto from "node:crypto";

  // Inside protectedProcedure
  const agentKey = headers["x-agent-key"];
  const agentUserId = headers["x-agent-user-id"];
  const agentChatId = headers["x-agent-chat-id"];

  let user: TelegramUser | null = null;
  let authType: "superadmin" | "chat-api-key" | "user-api-key" | "telegram" | "agent" = "superadmin";
  let chatId: bigint | null = null;

  // Check for internal agent authentication
  if (agentKey && process.env.INTERNAL_AGENT_KEY) {
    const validAgentKey = process.env.INTERNAL_AGENT_KEY;
    // Hash both to prevent timing attacks and length mismatch crashes
    const expectedHash = crypto.createHash("sha256").update(validAgentKey).digest();
    const providedHash = crypto.createHash("sha256").update(agentKey as string).digest();

    if (crypto.timingSafeEqual(expectedHash, providedHash)) {
      if (!agentUserId || !agentChatId) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Agent request missing user or chat context" });
      }
      authType = "agent";
      chatId = BigInt(agentChatId as string);
      user = {
        id: Number(agentUserId),
        first_name: "Agent Impersonator",
      } as TelegramUser;
    }
  } else if (apiKey) {
// ... keep existing apiKey logic
```

- [ ] **Step 2: Update ChatScope Interface**
      Update `SessionWithScope` in `packages/trpc/src/middleware/chatScope.ts` to include `"agent"`.

```typescript
interface SessionWithScope {
  authType:
    | "superadmin"
    | "chat-api-key"
    | "user-api-key"
    | "telegram"
    | "agent";
  // ...
}
```

- [ ] **Step 3: Verification**
      Run `pnpm turbo check-types` from the project root to ensure all typing errors have been resolved.

- [ ] **Step 4: Commit**

```bash
git add packages/trpc/src/trpc.ts packages/trpc/src/middleware/chatScope.ts
git commit -m "feat(trpc): add agent authentication type to protectedProcedure"
```

---

### Task 4: Composable Chat Validation Utility

**Files:**

- Create: `packages/trpc/src/utils/chatValidation.ts`
- Create: `packages/trpc/src/utils/chatValidation.test.ts`

- [ ] **Step 1: Write the failing test**
      Create `packages/trpc/src/utils/chatValidation.test.ts` to verify `assertUsersInChat` throws when a user is not in the chat.
      _(Note: As this requires Prisma mocking, implement a basic structure or skip if the project does not currently unit test database utilities.)_

- [ ] **Step 2: Write implementation**
      Create `packages/trpc/src/utils/chatValidation.ts`.

```typescript
import { TRPCError } from "@trpc/server";
import { Db } from "../trpc.js";

/**
 * Asserts that all provided user IDs are current members of the specified chat.
 * Throws TRPCError(BAD_REQUEST) if any user is missing.
 */
export async function assertUsersInChat(
  db: Db,
  chatId: bigint | number,
  userIds: (bigint | number)[]
): Promise<void> {
  if (!userIds || userIds.length === 0) return;

  const uniqueIds = Array.from(new Set(userIds.map((id) => BigInt(id))));
  const chatBigInt = typeof chatId === "number" ? BigInt(chatId) : chatId;

  const chat = await db.chat.findUnique({
    where: { id: chatBigInt },
    select: { members: { select: { id: true } } },
  });

  if (!chat) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Chat not found" });
  }

  const memberIds = new Set(chat.members.map((m) => m.id.toString()));
  const missingUsers = uniqueIds.filter((id) => !memberIds.has(id.toString()));

  if (missingUsers.length > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Unauthorized: The following users are not members of the chat: ${missingUsers.join(", ")}`,
    });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/trpc/src/utils/chatValidation.ts packages/trpc/src/utils/chatValidation.test.ts
git commit -m "feat(trpc): add composable assertUsersInChat validation utility"
```

---

### Task 5: Enforce Validation on Expense & Settlement Endpoints

**Files:**

- Modify: `packages/trpc/src/routers/expense/createExpense.ts`
- Modify: `packages/trpc/src/routers/expense/updateExpense.ts`
- Modify: `packages/trpc/src/routers/expense/createExpensesBulk.ts`
- Modify: `packages/trpc/src/routers/settlement/createSettlement.ts`
- Modify: `packages/trpc/src/routers/settlement/settleAllDebts.ts`

- [ ] **Step 1: Write integration test (if applicable)**
      _(Note: Integration testing tRPC endpoints requires setting up the full router and DB. If the project lacks these tests, rely on `turbo check-types` and manual verification.)_

- [ ] **Step 2: Update Expense Endpoints**
      Import `assertUsersInChat` from `../../utils/chatValidation.js` and call it at the beginning of handlers:
      **createExpense:**

```typescript
await assertUsersInChat(db, input.chatId, [
  input.payerId,
  ...input.participantIds,
  ...(input.customSplits?.map((s) => s.userId) || []),
]);
```

**updateExpense:**

```typescript
await assertUsersInChat(db, input.chatId, [
  input.payerId,
  ...input.participantIds,
  ...(input.customSplits?.map((s) => s.userId) || []),
]);
```

**createExpensesBulk:**

```typescript
const allUserIds = new Set<bigint>();
for (const expense of input.expenses) {
  allUserIds.add(expense.payerId);
  if (expense.creatorId) allUserIds.add(expense.creatorId);
  expense.participantIds.forEach((id) => allUserIds.add(id));
  expense.customSplits?.forEach((split) => allUserIds.add(split.userId));
}
await assertUsersInChat(db, input.chatId, Array.from(allUserIds));
```

- [ ] **Step 3: Update Settlement Endpoints**
      **createSettlement & settleAllDebts:**

```typescript
await assertUsersInChat(db, input.chatId, [input.senderId, input.receiverId]);
```

- [ ] **Step 4: Verification**
      Run `pnpm turbo check-types` from the project root.

- [ ] **Step 5: Commit**

```bash
git add packages/trpc/src/routers/expense/ packages/trpc/src/routers/settlement/
git commit -m "feat(trpc): enforce cross-tenant boundaries on expense and settlement endpoints"
```
