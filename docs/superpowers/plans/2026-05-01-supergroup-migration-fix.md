# Supergroup Migration Reliability Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bot's broken in-memory race-condition guard for Telegram group→supergroup migrations with a self-correcting design that tolerates dropped events, cross-instance webhook routing, and concurrent migration triggers.

**Architecture:** Add a symmetric `migrate_from_chat_id` listener so either Telegram side can trigger migration. Make `migrateChat` idempotent under a Postgres advisory lock and extend the race-branch to cover all chat-scoped tables with an "old wins" merge policy. Add a `Chat.migratedFromChatId` column so welcome and migration messages don't duplicate.

**Tech Stack:** Prisma, Postgres (Supabase), grammy, tRPC, vitest, Vercel Functions, AWS EventBridge Scheduler.

**Spec:** `docs/superpowers/specs/2026-05-01-supergroup-migration-fix-design.md`

**Branch:** `fix/supergroup-migration-reliability` (already created with the spec commit).

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/database/prisma/schema.prisma` | Add `migratedFromChatId BigInt?` to Chat model |
| `packages/database/prisma/migrations/<timestamp>_add_migrated_from_chat_id/migration.sql` | Additive column migration |
| `packages/trpc/src/routers/chat/migrateChat.ts` | Idempotent migrate with advisory lock; extended race-branch; `{migrated: boolean}` return |
| `packages/trpc/src/routers/chat/migrateChat.test.ts` | New: unit tests for all branches |
| `packages/trpc/src/routers/chat/createChat.ts` | Make upsert-safe (catch unique-conflict, return existing) |
| `packages/trpc/src/routers/chat/createChat.test.ts` | New: unit test for conflict-handling |
| `packages/trpc/src/routers/chat/getChat.ts` | Expose `migratedFromChatId` in output |
| `packages/trpc/src/routers/aws/createGroupReminderSchedule.ts` | Make idempotent (no-op if exists) |
| `apps/bot/src/features/bot_events.ts` | Drop in-memory guard; add `migrate_from_chat_id` handler; extract shared `runMigration` helper; conditional welcome / migration messages; remove silent catch |

---

## Task 1: Add `migratedFromChatId` column to Chat schema

**Files:**
- Modify: `packages/database/prisma/schema.prisma:25-47`
- Create: `packages/database/prisma/migrations/<timestamp>_add_migrated_from_chat_id/migration.sql`

- [ ] **Step 1: Add the field to the Chat model**

Edit `packages/database/prisma/schema.prisma` and add the field after `timezone` (line 36):

```prisma
model Chat {
  id                        BigInt                     @id
  title                     String
  photo                     String                     @default("https://xelene.me/telegram.gif")
  type                      ChatType
  threadId                  BigInt?
  baseCurrency              String                     @default("SGD")
  debtSimplificationEnabled Boolean                    @default(false)
  notifyOnExpense           Boolean                    @default(true)
  notifyOnExpenseUpdate     Boolean                    @default(true)
  notifyOnSettlement        Boolean                    @default(true)
  timezone                  String?
  migratedFromChatId        BigInt?
  recurringExpenses         RecurringExpenseTemplate[]
  members                   User[]
  expenses                  Expense[]
  transfers                 Settlement[]
  createdAt                 DateTime                   @default(now())
  updatedAt                 DateTime                   @updatedAt
  ExpenseSnapshot           ExpenseSnapshot[]
  apiKeys                   ChatApiKey[]
  chatCategories            ChatCategory[]
  categoryOrderings         ChatCategoryOrdering[]
}
```

- [ ] **Step 2: Generate the Prisma migration**

Run from repo root:
```bash
cd packages/database && npx prisma migrate dev --name add_migrated_from_chat_id
```

Expected: a new directory under `packages/database/prisma/migrations/` containing `migration.sql` with `ALTER TABLE "Chat" ADD COLUMN "migratedFromChatId" BIGINT;`. Prisma client regenerates.

- [ ] **Step 3: Verify column exists locally**

```bash
cd packages/database && npx prisma db execute --stdin <<< 'SELECT column_name FROM information_schema.columns WHERE table_name = '"'"'Chat'"'"' AND column_name = '"'"'migratedFromChatId'"'"';'
```

Expected: one row returned with the column name.

- [ ] **Step 4: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/
git commit -m "feat(db): add Chat.migratedFromChatId to track migration source"
```

---

## Task 2: Expose `migratedFromChatId` in getChat output

**Files:**
- Modify: `packages/trpc/src/routers/chat/getChat.ts:21-33`

- [ ] **Step 1: Convert the BigInt to a number/null in the return shape**

Edit `getChat.ts` lines 21-33:

```ts
  return {
    ...chat,
    id: Number(chat.id),
    threadId: chat?.threadId ? Number(chat.threadId) : undefined,
    migratedFromChatId: chat?.migratedFromChatId ? Number(chat.migratedFromChatId) : null,
    debtSimplificationEnabled: chat?.debtSimplificationEnabled ?? false,
    notifyOnExpense: chat?.notifyOnExpense ?? true,
    notifyOnSettlement: chat?.notifyOnSettlement ?? true,
    members:
      chat?.members.map((m) => ({
        ...m,
        id: Number(m.id),
      })) ?? [],
  };
```

- [ ] **Step 2: Type-check**

```bash
cd packages/trpc && pnpm check-types
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/trpc/src/routers/chat/getChat.ts
git commit -m "feat(trpc): expose Chat.migratedFromChatId via getChat"
```

---

## Task 3: Update `migrateChat` output schema with `migrated: boolean`

**Files:**
- Modify: `packages/trpc/src/routers/chat/migrateChat.ts:18-27`
- Create: `packages/trpc/src/routers/chat/migrateChat.test.ts`

- [ ] **Step 1: Write a failing test for the new return shape**

Create `packages/trpc/src/routers/chat/migrateChat.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { migrateChatHandler } from "./migrateChat.js";

function makeTxMock(state: { oldChat: any; newChat: any }) {
  return {
    $executeRaw: async () => 1,
    chat: {
      findUnique: async ({ where }: any) => {
        if (where.id === 1n) return state.oldChat;
        if (where.id === 2n) return state.newChat;
        return null;
      },
      delete: async () => state.oldChat,
      update: async () => state.newChat,
    },
    expense: { count: async () => 0, updateMany: async () => ({ count: 0 }) },
    settlement: { count: async () => 0, updateMany: async () => ({ count: 0 }) },
    expenseSnapshot: { count: async () => 0, updateMany: async () => ({ count: 0 }) },
    recurringExpenseTemplate: { updateMany: async () => ({ count: 0 }) },
    chatApiKey: { updateMany: async () => ({ count: 0 }) },
    chatCategory: { deleteMany: async () => ({ count: 0 }), updateMany: async () => ({ count: 0 }) },
    chatCategoryOrdering: { deleteMany: async () => ({ count: 0 }), updateMany: async () => ({ count: 0 }) },
  };
}

function makeDb(state: { oldChat: any; newChat: any }) {
  return {
    chat: {
      findUnique: async ({ where }: any) => {
        if (where.id === 1n) return state.oldChat;
        if (where.id === 2n) return state.newChat;
        return null;
      },
    },
    $transaction: async (cb: any) => cb(makeTxMock(state)),
  } as any;
}

describe("migrateChatHandler", () => {
  it("returns migrated:true when running Branch B (new chat doesn't exist)", async () => {
    const db = makeDb({ oldChat: { id: 1n, members: [] }, newChat: null });
    const result = await migrateChatHandler({ oldChatId: 1n, newChatId: 2n }, db);
    expect(result.migrated).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

```bash
cd packages/trpc && npx vitest run src/routers/chat/migrateChat.test.ts
```

Expected: FAIL — `migrated` is undefined on the current return shape.

- [ ] **Step 3: Update the output schema and Branch B return**

Edit `packages/trpc/src/routers/chat/migrateChat.ts`:

Replace lines 18-27 (`outputSchema`):

```ts
export const outputSchema = z.object({
  status: z.number(),
  message: z.string(),
  migrated: z.boolean(),
  migratedRecords: z.object({
    expenses: z.number(),
    settlements: z.number(),
    snapshots: z.number(),
    schedules: z.number(),
  }),
});
```

In the race-branch return (currently lines 108-112), add `migrated: true`:

```ts
return {
  status: 200,
  message: `Successfully merged existing chat ${oldChatId} into new chat ${newChatId}`,
  migrated: true,
  migratedRecords: migrationResult,
};
```

In the Branch B return (currently lines 205-209), add `migrated: true`:

```ts
return {
  status: 200,
  message: "Chat migrated successfully",
  migrated: true,
  migratedRecords: migrationResult,
};
```

- [ ] **Step 4: Run the test, expect pass**

```bash
cd packages/trpc && npx vitest run src/routers/chat/migrateChat.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/trpc/src/routers/chat/migrateChat.ts packages/trpc/src/routers/chat/migrateChat.test.ts
git commit -m "feat(trpc): add migrated boolean to migrateChat output"
```

---

## Task 4: Idempotent no-op when old chat doesn't exist

**Files:**
- Modify: `packages/trpc/src/routers/chat/migrateChat.ts:36-49`
- Modify: `packages/trpc/src/routers/chat/migrateChat.test.ts`

- [ ] **Step 1: Write a failing test**

Append to `migrateChat.test.ts`:

```ts
  it("returns migrated:false when old chat doesn't exist (idempotent)", async () => {
    const db = makeDb({ oldChat: null, newChat: { id: 2n } });
    const result = await migrateChatHandler({ oldChatId: 1n, newChatId: 2n }, db);
    expect(result.migrated).toBe(false);
    expect(result.migratedRecords).toEqual({ expenses: 0, settlements: 0, snapshots: 0, schedules: 0 });
  });
```

- [ ] **Step 2: Run the test, expect failure**

```bash
cd packages/trpc && npx vitest run src/routers/chat/migrateChat.test.ts
```

Expected: FAIL — current handler throws `NOT_FOUND` when old chat is missing.

- [ ] **Step 3: Replace the NOT_FOUND throw with idempotent return**

Edit `migrateChat.ts` lines 36-49 (the `if (!existingChat)` block). Replace:

```ts
    if (!existingChat) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Chat with ID ${oldChatId} not found`,
      });
    }
```

With:

```ts
    if (!existingChat) {
      return {
        status: 200,
        message: `Chat ${oldChatId} not found — already migrated`,
        migrated: false,
        migratedRecords: { expenses: 0, settlements: 0, snapshots: 0, schedules: 0 },
      };
    }
```

- [ ] **Step 4: Run the test, expect pass**

```bash
cd packages/trpc && npx vitest run src/routers/chat/migrateChat.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/trpc/src/routers/chat/migrateChat.ts packages/trpc/src/routers/chat/migrateChat.test.ts
git commit -m "feat(trpc): migrateChat is idempotent when old chat is missing"
```

---

## Task 5: Move idempotent existence check + advisory lock into transaction

**Files:**
- Modify: `packages/trpc/src/routers/chat/migrateChat.ts:36-139`
- Modify: `packages/trpc/src/routers/chat/migrateChat.test.ts`

We currently check `db.chat.findUnique` for old then for new outside the transaction. Inside the transaction, we want: acquire advisory lock → re-read state → branch.

- [ ] **Step 1: Write a failing test that asserts the lock SQL is issued**

Append to `migrateChat.test.ts`:

```ts
  it("acquires a transaction-scoped advisory lock on newChatId", async () => {
    const calls: string[] = [];
    const txMock = {
      ...makeTxMock({ oldChat: null, newChat: null }),
      $executeRaw: async (strings: TemplateStringsArray, ...values: any[]) => {
        calls.push(strings.join("?") + " :: " + values.join(","));
        return 1;
      },
    };
    const db = {
      chat: { findUnique: async () => null },
      $transaction: async (cb: any) => cb(txMock),
    } as any;
    await migrateChatHandler({ oldChatId: 1n, newChatId: 2n }, db);
    expect(calls.some((c) => c.includes("pg_advisory_xact_lock") && c.includes("2"))).toBe(true);
  });
```

- [ ] **Step 2: Run the test, expect failure**

```bash
cd packages/trpc && npx vitest run src/routers/chat/migrateChat.test.ts
```

Expected: FAIL — no advisory-lock call is issued today.

- [ ] **Step 3: Restructure the handler around a single transaction with the lock + re-read**

Replace lines 36-139 of `migrateChat.ts` (the body from `// Validate that the old chat exists` through the end of Branch B's transaction) with:

```ts
    const migrationResult = await db.$transaction(async (tx) => {
      // Serialize concurrent migrate calls for the same target chat.
      // Auto-released on commit/rollback.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${newChatId}::bigint)`;

      // Re-read state inside the lock.
      const oldChat = await tx.chat.findUnique({
        where: { id: oldChatId },
        include: { members: true },
      });

      if (!oldChat) {
        return {
          migrated: false as const,
          counts: { expenses: 0, settlements: 0, snapshots: 0, schedules: 0 },
        };
      }

      const newChat = await tx.chat.findUnique({ where: { id: newChatId } });

      if (newChat) {
        // Race-branch: explicit merge with "old wins" policy.
        const expenseCount = await tx.expense.count({ where: { chatId: oldChatId } });
        const settlementCount = await tx.settlement.count({ where: { chatId: oldChatId } });
        const snapshotCount = await tx.expenseSnapshot.count({ where: { chatId: oldChatId } });

        await tx.expense.updateMany({ where: { chatId: oldChatId }, data: { chatId: newChatId } });
        await tx.settlement.updateMany({ where: { chatId: oldChatId }, data: { chatId: newChatId } });
        await tx.expenseSnapshot.updateMany({ where: { chatId: oldChatId }, data: { chatId: newChatId } });

        // Connect old members to new chat.
        if (oldChat.members.length > 0) {
          const userIds = oldChat.members.map((m) => ({ id: m.id }));
          await tx.chat.update({
            where: { id: newChatId },
            data: { members: { connect: userIds } },
          });
        }

        // Mark migration source on the new chat row.
        await tx.chat.update({
          where: { id: newChatId },
          data: { migratedFromChatId: oldChatId },
        });

        // Delete old chat (cascades to _ChatToUser).
        await tx.chat.delete({ where: { id: oldChatId } });

        return {
          migrated: true as const,
          counts: { expenses: expenseCount, settlements: settlementCount, snapshots: snapshotCount, schedules: 0 },
        };
      }

      // Branch B: raw SQL UPDATE, cascade does the FK work.
      const expenseCount = await tx.expense.count({ where: { chatId: oldChatId } });
      const settlementCount = await tx.settlement.count({ where: { chatId: oldChatId } });
      const snapshotCount = await tx.expenseSnapshot.count({ where: { chatId: oldChatId } });

      await tx.$executeRaw`UPDATE "Chat" SET id = ${newChatId} WHERE id = ${oldChatId}`;
      await tx.chat.update({
        where: { id: newChatId },
        data: { migratedFromChatId: oldChatId },
      });

      return {
        migrated: true as const,
        counts: { expenses: expenseCount, settlements: settlementCount, snapshots: snapshotCount, schedules: 0 },
      };
    });

    if (!migrationResult.migrated) {
      return {
        status: 200,
        message: `Chat ${oldChatId} not found — already migrated`,
        migrated: false,
        migratedRecords: migrationResult.counts,
      };
    }
```

Then for the AWS schedule handling block (currently lines 141-203), keep the existing logic but only run it when `migrationResult.migrated === true`. The final return for the migrated case becomes:

```ts
    migrationResult.counts.schedules = schedulesHandled;

    return {
      status: 200,
      message: "Chat migrated successfully",
      migrated: true,
      migratedRecords: migrationResult.counts,
    };
```

Remove the now-redundant outer `findUnique` calls (the old lines 36-54) and the standalone race-branch and Branch B blocks they wrapped.

- [ ] **Step 4: Run all migrateChat tests, expect pass**

```bash
cd packages/trpc && npx vitest run src/routers/chat/migrateChat.test.ts
```

Expected: PASS for all three tests.

- [ ] **Step 5: Commit**

```bash
git add packages/trpc/src/routers/chat/migrateChat.ts packages/trpc/src/routers/chat/migrateChat.test.ts
git commit -m "feat(trpc): migrateChat acquires advisory lock and re-reads inside transaction"
```

---

## Task 6: Race-branch — move RecurringExpenseTemplate and ChatApiKey

**Files:**
- Modify: `packages/trpc/src/routers/chat/migrateChat.ts` (race-branch within the transaction)
- Modify: `packages/trpc/src/routers/chat/migrateChat.test.ts`

- [ ] **Step 1: Write a failing test**

Append to `migrateChat.test.ts`:

```ts
  it("race-branch moves RecurringExpenseTemplate and ChatApiKey rows", async () => {
    const moves: Record<string, { from: bigint; to: bigint } | null> = {
      recurringExpenseTemplate: null,
      chatApiKey: null,
    };
    const tx = {
      ...makeTxMock({ oldChat: { id: 1n, members: [] }, newChat: { id: 2n } }),
      recurringExpenseTemplate: {
        updateMany: async ({ where, data }: any) => {
          moves.recurringExpenseTemplate = { from: where.chatId, to: data.chatId };
          return { count: 0 };
        },
      },
      chatApiKey: {
        updateMany: async ({ where, data }: any) => {
          moves.chatApiKey = { from: where.chatId, to: data.chatId };
          return { count: 0 };
        },
      },
    };
    const db = {
      $transaction: async (cb: any) => cb(tx),
    } as any;
    await migrateChatHandler({ oldChatId: 1n, newChatId: 2n }, db);
    expect(moves.recurringExpenseTemplate).toEqual({ from: 1n, to: 2n });
    expect(moves.chatApiKey).toEqual({ from: 1n, to: 2n });
  });
```

- [ ] **Step 2: Run the test, expect failure**

```bash
cd packages/trpc && npx vitest run src/routers/chat/migrateChat.test.ts
```

Expected: FAIL — current race-branch never touches these tables.

- [ ] **Step 3: Add the two updateMany calls to the race-branch**

In the race-branch block of the transaction (after the existing `expenseSnapshot.updateMany` call), add:

```ts
        await tx.recurringExpenseTemplate.updateMany({ where: { chatId: oldChatId }, data: { chatId: newChatId } });
        await tx.chatApiKey.updateMany({ where: { chatId: oldChatId }, data: { chatId: newChatId } });
```

- [ ] **Step 4: Run the test, expect pass**

```bash
cd packages/trpc && npx vitest run src/routers/chat/migrateChat.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/trpc/src/routers/chat/migrateChat.ts packages/trpc/src/routers/chat/migrateChat.test.ts
git commit -m "feat(trpc): race-branch moves recurring templates and api keys"
```

---

## Task 7: Race-branch — replace categories and ordering with old-wins

**Files:**
- Modify: `packages/trpc/src/routers/chat/migrateChat.ts` (race-branch)
- Modify: `packages/trpc/src/routers/chat/migrateChat.test.ts`

- [ ] **Step 1: Write a failing test**

Append:

```ts
  it("race-branch replaces new chat's categories+ordering with old chat's", async () => {
    const ops: string[] = [];
    const tx = {
      ...makeTxMock({ oldChat: { id: 1n, members: [] }, newChat: { id: 2n } }),
      chatCategory: {
        deleteMany: async ({ where }: any) => {
          ops.push(`category.deleteMany(chatId=${where.chatId})`);
          return { count: 0 };
        },
        updateMany: async ({ where, data }: any) => {
          ops.push(`category.updateMany(${where.chatId}->${data.chatId})`);
          return { count: 0 };
        },
      },
      chatCategoryOrdering: {
        deleteMany: async ({ where }: any) => {
          ops.push(`ordering.deleteMany(chatId=${where.chatId})`);
          return { count: 0 };
        },
        updateMany: async ({ where, data }: any) => {
          ops.push(`ordering.updateMany(${where.chatId}->${data.chatId})`);
          return { count: 0 };
        },
      },
    };
    const db = { $transaction: async (cb: any) => cb(tx) } as any;
    await migrateChatHandler({ oldChatId: 1n, newChatId: 2n }, db);
    expect(ops).toContain("category.deleteMany(chatId=2)");
    expect(ops).toContain("category.updateMany(1->2)");
    expect(ops).toContain("ordering.deleteMany(chatId=2)");
    expect(ops).toContain("ordering.updateMany(1->2)");
    // Delete must come before move for both.
    expect(ops.indexOf("category.deleteMany(chatId=2)")).toBeLessThan(ops.indexOf("category.updateMany(1->2)"));
    expect(ops.indexOf("ordering.deleteMany(chatId=2)")).toBeLessThan(ops.indexOf("ordering.updateMany(1->2)"));
  });
```

- [ ] **Step 2: Run the test, expect failure**

```bash
cd packages/trpc && npx vitest run src/routers/chat/migrateChat.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Add delete-then-move for categories and ordering in race-branch**

In the race-branch, after the recurring/apiKey updateMany calls and before the member-connect block, add:

```ts
        // "Old wins" merge: discard whatever defaults landed on the new chat,
        // then move the user-customized rows from the old chat.
        await tx.chatCategory.deleteMany({ where: { chatId: newChatId } });
        await tx.chatCategory.updateMany({ where: { chatId: oldChatId }, data: { chatId: newChatId } });

        await tx.chatCategoryOrdering.deleteMany({ where: { chatId: newChatId } });
        await tx.chatCategoryOrdering.updateMany({ where: { chatId: oldChatId }, data: { chatId: newChatId } });
```

- [ ] **Step 4: Run the test, expect pass**

```bash
cd packages/trpc && npx vitest run src/routers/chat/migrateChat.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/trpc/src/routers/chat/migrateChat.ts packages/trpc/src/routers/chat/migrateChat.test.ts
git commit -m "feat(trpc): race-branch replaces new chat's categories+ordering with old-wins"
```

---

## Task 8: Race-branch — AWS schedule reconciliation

**Files:**
- Modify: `packages/trpc/src/routers/chat/migrateChat.ts` (after-transaction block)

The existing AWS-schedule block at the bottom of the handler runs only after the non-race Branch B in the original code. After Task 5, the schedule block runs for both branches when `migrationResult.migrated === true`. This task makes the block delete a default schedule on the new chat (if one was already created by `createChat`'s finally block) before recreating it from the old chat's settings.

- [ ] **Step 1: Locate the AWS schedule block** (now after the `if (!migrationResult.migrated) return …` early-return added in Task 5)

- [ ] **Step 2: Add a defensive delete of any default schedule already on newChatId**

Inside the existing `try { … }` that handles the schedule, after `getGroupReminderSchedule(schedulerClient, Number(oldChatId))` and before `await deleteGroupReminderSchedule(schedulerClient, Number(oldChatId));`, add:

```ts
          // The new chat may already have a default schedule attached by
          // createChat's finally block. Remove it before we rewrite from
          // the old chat's customized settings.
          try {
            await deleteGroupReminderSchedule(schedulerClient, Number(newChatId));
          } catch (e) {
            // No-op: missing schedule is fine.
          }
```

- [ ] **Step 3: Type-check**

```bash
cd packages/trpc && pnpm check-types
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/trpc/src/routers/chat/migrateChat.ts
git commit -m "feat(trpc): race-branch removes default AWS schedule before applying old's"
```

---

## Task 9: Make `createChat` upsert-safe (return existing on conflict)

**Files:**
- Modify: `packages/trpc/src/routers/chat/createChat.ts:36-77`
- Create: `packages/trpc/src/routers/chat/createChat.test.ts`

- [ ] **Step 1: Write a failing test**

Create `packages/trpc/src/routers/chat/createChat.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createChatHandler } from "./createChat.js";

describe("createChatHandler", () => {
  it("returns the existing chat when one already exists with the same id", async () => {
    const existing = {
      id: 42n,
      title: "existing",
      photo: "p",
      type: "group",
      threadId: null,
      baseCurrency: "SGD",
      debtSimplificationEnabled: false,
      notifyOnExpense: true,
      notifyOnExpenseUpdate: true,
      notifyOnSettlement: true,
      timezone: null,
      migratedFromChatId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const db = {
      chat: {
        findUnique: async () => existing,
        create: async () => { throw new Error("should not be called"); },
      },
    } as any;
    const result = await createChatHandler(
      { chatId: 42n, chatTitle: "ignored", chatType: "group", chatPhoto: null },
      db
    );
    expect(result.id).toBe(42n);
    expect(result.title).toBe("existing");
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

```bash
cd packages/trpc && npx vitest run src/routers/chat/createChat.test.ts
```

Expected: FAIL — current handler throws CONFLICT instead of returning the existing row.

- [ ] **Step 3: Replace the CONFLICT throw with returning the existing row**

In `createChat.ts`, locate the existing `existingChat` check (lines ~38-46):

```ts
    const existingChat = await db.chat.findUnique({
      where: { id: input.chatId },
    });
    if (existingChat) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `Chat with ID ${input.chatId} already exists`,
      });
    }
```

Replace with:

```ts
    const existingChat = await db.chat.findUnique({
      where: { id: input.chatId },
    });
    if (existingChat) {
      return existingChat;
    }
```

In the `catch` block (lines ~64-72), do the same — when we hit a unique-constraint race, return the existing row:

```ts
    if (
      error instanceof Error &&
      error.message.includes("Unique constraint failed")
    ) {
      const existing = await db.chat.findUnique({ where: { id: input.chatId } });
      if (existing) return existing;
      throw new TRPCError({
        code: "CONFLICT",
        message: `Chat with ID ${input.chatId} already exists`,
      });
    }
```

- [ ] **Step 4: Run the test, expect pass**

```bash
cd packages/trpc && npx vitest run src/routers/chat/createChat.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/trpc/src/routers/chat/createChat.ts packages/trpc/src/routers/chat/createChat.test.ts
git commit -m "feat(trpc): createChat returns existing row on conflict instead of throwing"
```

---

## Task 10: Make `createGroupReminderScheduleHandler` idempotent

**Files:**
- Modify: `packages/trpc/src/routers/aws/createGroupReminderSchedule.ts`

We want: if a schedule already exists for the chat, no-op silently. This way `createChat`'s `finally` block can race with `migrateChat`'s schedule replacement without producing duplicate or conflicting schedules.

- [ ] **Step 1: Read the current implementation**

```bash
sed -n '1,80p' /Users/bubuding/code/banana-split-tma/packages/trpc/src/routers/aws/createGroupReminderSchedule.ts
```

Identify where the schedule is actually created (the `CreateScheduleCommand` call) and where existing-schedule lookup happens.

- [ ] **Step 2: Add an early-return when a schedule already exists**

Before the `CreateScheduleCommand` call, add:

```ts
  const existing = await getGroupReminderSchedule(schedulerClient, Number(input.chatId));
  if (existing) {
    return { ok: true, alreadyExists: true };
  }
```

(Adjust the return shape to match the existing handler — if the current return is just `{ ok: true }`, keep it that way and drop `alreadyExists`.)

- [ ] **Step 3: Type-check**

```bash
cd packages/trpc && pnpm check-types
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/trpc/src/routers/aws/createGroupReminderSchedule.ts
git commit -m "feat(aws): createGroupReminderSchedule no-ops when schedule already exists"
```

---

## Task 11: Extract shared `runMigration` helper and add `migrate_from_chat_id` listener

**Files:**
- Modify: `apps/bot/src/features/bot_events.ts`

- [ ] **Step 1: Extract the migration body into a shared helper**

In `bot_events.ts`, above the existing `botEventsFeature.on("message:migrate_to_chat_id", ...)` block, add:

```ts
async function runMigration(
  ctx: BotContext,
  oldChatId: number,
  newChatId: number
): Promise<void> {
  const result = await ctx.trpc.chat.migrateChat({ oldChatId, newChatId });

  if (!result.migrated) {
    // Idempotent no-op (the other side's event already migrated). Stay quiet.
    return;
  }

  const chatContext = ChatUtils.createChatContext(newChatId, "supergroup");
  const url = ChatUtils.createMiniAppUrl(
    env.MINI_APP_DEEPLINK || "",
    ctx.me.username,
    chatContext,
    "compact"
  );

  const keyboard = new InlineKeyboard().url("🍌 Banana Splitz", url);

  await ctx.api.sendMessage(newChatId, MIGRATION_MESSAGE_GROUP, {
    reply_markup: keyboard,
    parse_mode: "MarkdownV2",
  });
}
```

- [ ] **Step 2: Replace the body of the `migrate_to_chat_id` handler to call `runMigration`**

Replace the existing handler:

```ts
botEventsFeature.on("message:migrate_to_chat_id", async (ctx) => {
  const oldChatId = ctx.chat.id;
  const newChatId = ctx.message.migrate_to_chat_id;
  await runMigration(ctx, oldChatId, newChatId);
});
```

(Note: no `try/catch`. Errors propagate to grammy's `bot.catch` in `bot.ts`.)

- [ ] **Step 3: Add the symmetric `migrate_from_chat_id` handler**

After the `migrate_to_chat_id` handler:

```ts
botEventsFeature.on("message:migrate_from_chat_id", async (ctx) => {
  const newChatId = ctx.chat.id;
  const oldChatId = ctx.message.migrate_from_chat_id;
  await runMigration(ctx, oldChatId, newChatId);
});
```

- [ ] **Step 4: Type-check**

```bash
cd apps/bot && pnpm check-types
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/bot/src/features/bot_events.ts
git commit -m "feat(bot): listen for migrate_from_chat_id and dedupe via migrated flag"
```

---

## Task 12: Refactor `my_chat_member` — drop in-memory guard, use DB state

**Files:**
- Modify: `apps/bot/src/features/bot_events.ts`

- [ ] **Step 1: Remove the in-memory Set and the 5-second polling guard**

At the top of `bot_events.ts`, delete the line:

```ts
const migratedChatIds = new Set<number>();
```

In the `my_chat_member` handler, delete the entire 5-second polling loop (currently lines 35-51). Specifically remove this block:

```ts
  if (chat.type === "supergroup") {
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (migratedChatIds.has(chat.id)) {
        break;
      }
    }
  }

  if (migratedChatIds.has(chat.id)) {
    migratedChatIds.delete(chat.id);
    console.log(`Skipping my_chat_member for migrated chat ${chat.id}`);
    return next();
  }
```

In the `migrate_to_chat_id` handler (now using `runMigration`), delete the line `migratedChatIds.add(newChatId);` if any reference to it remains.

- [ ] **Step 2: Replace the welcome-message logic to use DB state**

Replace the existing `try { … } catch { … }` block in `my_chat_member` (the part that calls `getChat` / `createChat` and sends welcome messages) with:

```ts
  try {
    let chatPhotoUrl: string | undefined;
    const fullChat = await ctx.api.getChat(chat.id);
    if (fullChat.photo) {
      const file = await ctx.api.getFile(fullChat.photo.big_file_id);
      chatPhotoUrl = file.file_path;
    }

    let existingChat: Awaited<ReturnType<typeof ctx.trpc.chat.getChat>> | null = null;
    try {
      existingChat = await ctx.trpc.chat.getChat({ chatId: chat.id });
    } catch (e: unknown) {
      if ((e as any)?.code !== "NOT_FOUND") {
        throw e;
      }
    }

    if (existingChat) {
      // Either: this chat was already created from a prior add (re-add path)
      // or: it was just created by migrateChat (migratedFromChatId set).
      // In both cases skip welcome — they've been seen already, or migration
      // will deliver its own dedicated message.
      console.log(
        `my_chat_member: chat ${chat.id} already exists (migrated=${existingChat.migratedFromChatId !== null}); skipping welcome`
      );
      return next();
    }

    await ctx.trpc.chat.createChat({
      chatId: chat.id,
      chatTitle: chat.title || `Group:${chat.id}`,
      chatType: chat.type,
      chatPhoto: chatPhotoUrl || undefined,
    });

    await ctx.reply(GROUP_JOIN_MESSAGE);
    await ctx.reply(GROUP_INSTRUCTION, { parse_mode: "MarkdownV2" });
  } catch (error) {
    console.error("Failed to process my_chat_member event:", error);
    await ctx.reply("❌ Failed to initialize chat");
  }
```

- [ ] **Step 2.5: Type-check**

```bash
cd apps/bot && pnpm check-types
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/bot/src/features/bot_events.ts
git commit -m "refactor(bot): drop in-memory migration guard; gate welcome on DB state"
```

---

## Task 13: Run the full test and lint suite

- [ ] **Step 1: Run all tests in trpc**

```bash
cd packages/trpc && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 2: Run all bot tests**

```bash
cd apps/bot && npx vitest run
```

Expected: all tests pass (or no tests found — bot has none today).

- [ ] **Step 3: Run lint**

```bash
cd /Users/bubuding/code/banana-split-tma && pnpm turbo run lint
```

Expected: no lint errors.

- [ ] **Step 4: Run type-check across the workspace**

```bash
cd /Users/bubuding/code/banana-split-tma && pnpm turbo run check-types
```

Expected: no type errors.

- [ ] **Step 5: If anything fails, fix it and re-run before continuing**

---

## Task 14: Local UAT prep — verify migration on dev DB

This task pauses for the human-driven local UAT. The scripted assertions below confirm the DB-side logic before the user does the Telegram-side flow.

- [ ] **Step 1: Confirm the new column exists in dev**

```bash
cd packages/database && npx prisma db execute --stdin <<< "SELECT column_name FROM information_schema.columns WHERE table_name = 'Chat' AND column_name = 'migratedFromChatId';"
```

Expected: one row.

- [ ] **Step 2: Smoke test migrateChat against a seeded pair on dev DB**

This step is exercised end-to-end via Telegram (Task 15). No automated DB-only test here — the unit tests already cover the handler logic.

- [ ] **Step 3: Hand off to the human for Telegram-side UAT (Task 15)**

---

## Task 15: Human UAT via Telegram

The user runs through these scenarios manually. The plan's role is to enumerate them so nothing is missed.

- [ ] **Scenario A: Happy path — group with data, upgrade**
  1. Create a regular group with the bot. Add 2-3 expenses, 1 custom category, optionally 1 snapshot.
  2. Upgrade to supergroup via Telegram client.
  3. **Verify in TMA:** all expenses, members, category visible on the new supergroup.
  4. **Verify in DB:**
     ```sql
     SELECT id, "migratedFromChatId" FROM "Chat" WHERE "migratedFromChatId" IS NOT NULL ORDER BY "updatedAt" DESC LIMIT 5;
     ```
     Expected: new supergroup row has `migratedFromChatId` set to the old chat ID. Old chat row is gone.
  5. **Verify in chat:** exactly one `MIGRATION_MESSAGE_GROUP` posted to the new supergroup. No `GROUP_JOIN_MESSAGE`.
  6. **Verify AWS:** `aws scheduler list-schedules --query "Schedules[?contains(Name, '<oldId>') || contains(Name, '<newId>')].[Name,State]"` — only the new chat's schedule, with the old chat's customized settings.

- [ ] **Scenario B: Fresh supergroup add (no migration)**
  1. Create a new supergroup directly (Telegram allows direct creation).
  2. Add the bot.
  3. **Verify:** `GROUP_JOIN_MESSAGE` + `GROUP_INSTRUCTION` posted. No migration message.
  4. **Verify in DB:** Chat row created with `migratedFromChatId = NULL`.

- [ ] **Scenario C: Bot kicked then re-added**
  1. From an existing group, kick the bot.
  2. Re-add it.
  3. **Verify:** No welcome messages posted (chat already known). No duplicate seeding in DB.

- [ ] **Scenario D: Pause webhook to simulate offline-during-upgrade**
  1. Stop the local dev bot process.
  2. From a test group, upgrade to supergroup. The `migrate_to_chat_id` event will be delivered to a dead webhook and likely lost.
  3. Restart the bot.
  4. Send any message in the new supergroup (this triggers update delivery; the first service message in the new supergroup carries `migrate_from_chat_id`).
  5. **Verify:** migration completes (data on new chat ID, old chat row gone, exactly one migration message).

---

## Task 16: Final hygiene + open PR

- [ ] **Step 1: Re-run lint + type-check + tests once more**

```bash
cd /Users/bubuding/code/banana-split-tma && pnpm turbo run lint check-types && cd packages/trpc && npx vitest run
```

Expected: green.

- [ ] **Step 2: Push branch and open PR**

```bash
git push -u origin fix/supergroup-migration-reliability
gh pr create --title "fix(bot): reliable group→supergroup migration" --body "$(cat <<'EOF'
## Summary
- Replaces the in-memory race-condition guard for Telegram group→supergroup migrations with a self-correcting design that tolerates dropped events, cross-instance webhook routing, and concurrent triggers.
- Adds `Chat.migratedFromChatId` so welcome and migration messages don't duplicate.
- Extends the race-branch merge to cover all chat-scoped tables ("old wins").

Spec: `docs/superpowers/specs/2026-05-01-supergroup-migration-fix-design.md`

## Test plan
- [x] Unit tests for migrateChat (idempotent no-op, advisory lock, race-branch table coverage, categories+ordering replacement)
- [x] Unit test for createChat upsert-safe behavior
- [x] Lint + type-check
- [ ] Local Telegram UAT: happy path upgrade with data
- [ ] Local Telegram UAT: fresh supergroup add (welcome only)
- [ ] Local Telegram UAT: re-add (no welcome)
- [ ] Local Telegram UAT: bot offline during upgrade (recovery via migrate_from_chat_id)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Per the user's PR-flow memory: **do not arm auto-merge yet.** Wait for the user to confirm UAT before enabling.

- [ ] **Step 3: Hand off to the user for UAT walkthrough (Task 15) before arming auto-merge**

---

## Self-Review Notes

**Spec coverage check:** Each component in the spec maps to tasks here:
- Component 1 (Symmetric Telegram listener) → Task 11
- Component 2 (Idempotent migrate + advisory lock) → Tasks 3, 4, 5
- Component 3 ("Old wins" race-branch merge) → Tasks 6, 7, 8
- Component 4 (`Chat.migratedFromChatId`) → Tasks 1, 2, 11, 12
- Component 5 (Stop swallowing errors) → Task 11 (no try/catch around runMigration call)

**Type consistency:** `migrateChat` returns `{migrated: boolean}` (Task 3), referenced by `runMigration` (Task 11) and `my_chat_member` flow (Task 12). `migratedFromChatId` is added to schema (Task 1), exposed via `getChat` output (Task 2), set in both branches of migrateChat (Task 5), and read in `my_chat_member` (Task 12).

**Out of scope reminder:** This plan does not implement the admin recovery slash command or alerting. Both were explicitly deferred during brainstorming.
