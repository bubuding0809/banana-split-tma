# Telegram Agent Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a Mastra-based natural language agent layer into the Telegram bot to interact with tRPC APIs for logging expenses and managing balances.

**Architecture:** A new `packages/agent` workspace containing Mastra configuration, tools, and workflows. `apps/bot` will import this agent and conditionally trigger it based on explicit commands in groups or un-parsed natural language in DMs.

**Tech Stack:** Mastra, Vercel AI SDK, Postgres (Mastra Memory), Zod, GrammY (Telegram), tRPC.

---

### Task 1: Scaffold `packages/agent`

**Files:**

- Create: `packages/agent/package.json`
- Create: `packages/agent/tsconfig.json`
- Create: `packages/agent/src/index.ts`
- Modify: `pnpm-workspace.yaml` (Verify `packages/*` is included)

- [ ] **Step 1: Initialize the workspace package**
      Create `packages/agent/package.json` with the required dependencies: `mastra`, `@mastra/core`, `@ai-sdk/openai`, `@repo/trpc`, `zod`, etc.

- [ ] **Step 2: Add TS config**
      Create `packages/agent/tsconfig.json` extending `@repo/typescript-config/base.json`.

- [ ] **Step 3: Export empty agent**
      Create `packages/agent/src/index.ts` with an empty export `export const bananaAgent = {};` to verify build.

- [ ] **Step 4: Run build**
      Run: `pnpm build --filter @repo/agent`
      Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agent
git commit -m "feat: scaffold agent package"
```

---

### Task 2: Setup Mastra Agent & Postgres Memory

**Files:**

- Create: `packages/agent/src/memory.ts`
- Create: `packages/agent/src/agent.ts`
- Modify: `packages/agent/src/index.ts`

- [ ] **Step 1: Setup Postgres Memory**
      Install `@mastra/memory-pg` in `packages/agent`. Create `memory.ts` that exports a `PgMemory` instance connected to `DATABASE_URL`. Ensure it doesn't conflict with Prisma migrations.

- [ ] **Step 2: Define Mastra Agent**
      Create `agent.ts` and define `export const bananaAgent = new Agent({ name: "BananaAgent", instructions: "You are a helpful Telegram expense tracker bot...", memory, model: openai("gpt-4o") });`. Note: Make sure to import `openai` from `@ai-sdk/openai`.

- [ ] **Step 3: Export from index**
      Export `bananaAgent` from `index.ts`.

- [ ] **Step 4: Build and test**
      Run: `pnpm build --filter @repo/agent`
      Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agent
git commit -m "feat: setup Mastra agent with Postgres memory"
```

---

### Task 3: Migrate CLI Commands to Mastra Tools

**Files:**

- Create: `packages/agent/src/trpc.ts`
- Create: `packages/agent/src/tools/chat.ts`
- Create: `packages/agent/src/tools/currency.ts`
- Create: `packages/agent/src/tools/expense.ts`
- Create: `packages/agent/src/tools/reminder.ts`
- Create: `packages/agent/src/tools/settlement.ts`
- Create: `packages/agent/src/tools/snapshot.ts`
- Modify: `packages/agent/src/agent.ts`

- [ ] **Step 1: Setup tRPC context wrapper**
      In `src/trpc.ts`, export a helper function that takes `telegramUserId` and `chatId` from the Mastra execution `context` (NOT the tool's input schema) and initializes a server-side caller for the tRPC routers. This ensures users cannot spoof their ID via natural language prompting.

- [ ] **Step 2: Create Core Tools**
      Implement tools in their respective files (mapping from `apps/cli/src/commands/*`):
- `chat.ts`: `getChatDetailsTool`
- `currency.ts`: `listCurrenciesTool`
- `snapshot.ts`: `getSnapshotTool`

- [ ] **Step 3: Create Expense Tools**
      In `tools/expense.ts`, define `listExpensesTool`, `getExpenseDetailsTool`, `createExpenseTool`, `editExpenseTool`, and `deleteExpenseTool`.

- [ ] **Step 4: Create Financial Tools**
      In `tools/settlement.ts`, define `getNetShareTool` and `getTotalsTool`.
      In `tools/reminder.ts`, define `sendGroupReminderTool` and `sendDebtReminderTool`.

- [ ] **Step 5: Attach tools to Agent**
      Modify `agent.ts` to include all these tools in the `tools` array of the `bananaAgent`.

- [ ] **Step 6: Commit**

```bash
git add packages/agent/src/tools packages/agent/src/agent.ts packages/agent/src/trpc.ts
git commit -m "feat: implement all Mastra tools based on CLI features"
```

---

### Task 4: Integrate Agent into Telegram Bot (DMs)

**Files:**

- Modify: `apps/bot/package.json`
- Modify: `apps/bot/src/features/expenses.ts`
- Create: `apps/bot/src/features/agent.ts`

- [ ] **Step 1: Add dependency**
      Add `"@repo/agent": "workspace:*"` to `apps/bot/package.json`. Run `pnpm install`.

- [ ] **Step 2: Create Agent Handler**
      Create `agent.ts`. Define `handleAgentMessage`. It must:

1. Send an initial "Thinking..." placeholder message to Telegram and save the `message_id`.
2. Call `bananaAgent.generate({ messages: [userMessage], threadId: String(ctx.chat.id), context: { telegramUserId: ctx.from.id, chatId: ctx.chat.id } })` to ensure memory is securely isolated per chat and tools have secure context.
3. Read the stream and accumulate text.
4. Batch update Telegram using `bot.api.editMessageText` throttled/debounced (e.g. every 1-2 seconds max) to avoid Telegram API 429 rate limit errors.
5. Finalize the message when the stream ends.

- [ ] **Step 3: Update DM logic**
      In `expenses.ts` `message:text` handler, if `parseExpense` fails or returns no match, call `handleAgentMessage(ctx)`.

- [ ] **Step 4: Test bot compilation**
      Run: `pnpm check-types --filter bot`
      Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/bot
git commit -m "feat: integrate Mastra agent into bot DMs with batched streaming"
```

---

### Task 5: Integrate Agent into Telegram Bot (Groups)

**Files:**

- Modify: `apps/bot/src/features/group.ts`

- [ ] **Step 1: Add explicit triggers**
      In `group.ts`, add command handlers for `/ask` and `/do`, as well as listening for direct mentions (using `ctx.me.username`). Extract the text payload and call `handleAgentMessage(ctx)`.

- [ ] **Step 2: Test bot compilation**
      Run: `pnpm check-types --filter bot`
      Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/bot/src/features/group.ts
git commit -m "feat: add /ask, /do, and mention triggers for agent in groups"
```
