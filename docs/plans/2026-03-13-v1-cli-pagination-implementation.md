# V1 CLI Pagination Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement optional pagination and filtering across listing endpoints and the CLI to protect context windows for AI agents.

**Architecture:** Extend tRPC schemas for `expense.getAllExpensesByChat`, `snapshot.getSnapshots`, and `chat.getAllChats` with optional parameters (`limit`, `offset`, `startDate`, `endDate`, `currency`). Then, update the `@banananasplitz/cli` commands (`list-expenses`, `list-snapshots`, `list-chats`) to pass these via newly added CLI flags.

**Tech Stack:** TypeScript, tRPC, Prisma, Node.js (`parseArgs`)

---

### Task 1: Add Pagination & Filtering to `expense.getAllExpensesByChat`

**Files:**

- Modify: `packages/trpc/src/routers/expense/getAllExpensesByChat.ts`

**Step 1: Write the failing test**
(No dedicated unit test for this router exists yet, but we will ensure type-safety and manual verification locally)

**Step 2: Write minimal implementation**

Update `inputSchema`:

```typescript
const inputSchema = z.object({
  chatId: z.number(),
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  currency: z.string().length(3).optional(),
});
```

Update `getAllExpensesByChatHandler` Prisma query:

```typescript
const where: any = { chatId: input.chatId };
if (input.currency) where.currency = input.currency;
if (input.startDate || input.endDate) {
  where.date = {};
  if (input.startDate) where.date.gte = new Date(input.startDate);
  if (input.endDate) where.date.lte = new Date(input.endDate);
}

const expenses = await db.expense.findMany({
  where,
  take: input.limit,
  skip: input.offset,
  include: { shares: true },
  orderBy: { date: "desc" },
});
```

**Step 3: Run typescript compiler to verify it passes**
Run: `cd packages/trpc && pnpm tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/trpc/src/routers/expense/getAllExpensesByChat.ts
git commit -m "feat(api): add pagination and filtering to getAllExpensesByChat"
```

---

### Task 2: Add Pagination & Filtering to `snapshot.getSnapshots`

**Files:**

- Modify: `packages/trpc/src/routers/snapshot/getSnapshots.ts`

**Step 1: Write minimal implementation**

Update `inputSchema`:

```typescript
const inputSchema = z.object({
  chatId: z.number(),
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});
```

Update `getSnapshotsHandler` Prisma query:

```typescript
  const where: any = { chatId: input.chatId };
  if (input.startDate || input.endDate) {
    where.createdAt = {};
    if (input.startDate) where.createdAt.gte = new Date(input.startDate);
    if (input.endDate) where.createdAt.lte = new Date(input.endDate);
  }

  const snapshots = await db.expenseSnapshot.findMany({
    where,
    take: input.limit,
    skip: input.offset,
    // ... existing includes/order
```

**Step 2: Run typescript compiler to verify**
Run: `cd packages/trpc && pnpm tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/trpc/src/routers/snapshot/getSnapshots.ts
git commit -m "feat(api): add pagination and filtering to getSnapshots"
```

---

### Task 3: Add Pagination to `chat.getAllChats`

**Files:**

- Modify: `packages/trpc/src/routers/chat/getAllChats.ts`

**Step 1: Write minimal implementation**

Update `inputSchema`:

```typescript
const inputSchema = z.object({
  excludeTypes: z
    .array(z.enum(["private", "group", "supergroup", "channel", "sender"]))
    .optional()
    .default([]),
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional(),
});
```

Update `getAllChatsHandler`:

```typescript
  const chats = await db.chat.findMany({
    where: { type: { notIn: input.excludeTypes } },
    take: input.limit,
    skip: input.offset,
    // ... select
```

**Step 2: Commit**

```bash
git add packages/trpc/src/routers/chat/getAllChats.ts
git commit -m "feat(api): add pagination to getAllChats"
```

---

### Task 4: Update CLI `list-expenses` Command

**Files:**

- Modify: `apps/cli/src/commands/expense.ts`

**Step 1: Add new options and wire to TRPC**
Update `options` for `list-expenses`:

```typescript
    options: {
      "chat-id": { type: "string", description: "The numeric chat ID" },
      limit: { type: "string", description: "Number of records to return (max 100)" },
      offset: { type: "string", description: "Number of records to skip" },
      "start-date": { type: "string", description: "Filter by start date (YYYY-MM-DD)" },
      "end-date": { type: "string", description: "Filter by end date (YYYY-MM-DD)" },
      currency: { type: "string", description: "Filter by 3-letter currency code" },
    },
```

Inside `execute`:

```typescript
const input: any = { chatId: resolvedChatId };
if (opts.limit) input.limit = Number(opts.limit);
if (opts.offset) input.offset = Number(opts.offset);
if (opts["start-date"])
  input.startDate = new Date(String(opts["start-date"])).toISOString();
if (opts["end-date"])
  input.endDate = new Date(String(opts["end-date"])).toISOString();
if (opts.currency) input.currency = String(opts.currency).toUpperCase();

return run("list-expenses", () =>
  trpc.expense.getAllExpensesByChat.query(input)
);
```

**Step 2: Commit**

```bash
git add apps/cli/src/commands/expense.ts
git commit -m "feat(cli): add pagination and filters to list-expenses command"
```

---

### Task 5: Update CLI `list-snapshots` & `list-chats`

**Files:**

- Modify: `apps/cli/src/commands/snapshot.ts`
- Modify: `apps/cli/src/commands/chat.ts`

**Step 1: Implement changes**
Add `--limit`, `--offset`, `--start-date`, `--end-date` to `list-snapshots`.
Add `--limit`, `--offset` to `list-chats`.
Wire them appropriately to the tRPC calls (similar to Task 4).

**Step 2: Validate TypeScript**
Run: `cd apps/cli && pnpm tsc --noEmit`

**Step 3: Commit**

```bash
git add apps/cli/src/commands/snapshot.ts apps/cli/src/commands/chat.ts
git commit -m "feat(cli): add pagination to list-snapshots and list-chats commands"
```
