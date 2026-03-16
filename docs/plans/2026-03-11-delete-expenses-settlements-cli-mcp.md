# Delete Expenses and Settlements CLI and MCP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expand CLI and MCP capabilities to support deleting expenses and settlements

**Architecture:** Add two CLI commands (`delete-expense`, `delete-settlement`) to interact with existing tRPC router mutations without interactive prompts. Add two MCP tools (`banana_delete_expense`, `banana_delete_settlement`) that do the same.

**Tech Stack:** TypeScript, tRPC client, zod, Model Context Protocol SDK, commander-like CLI argument parsing

---

### Task 1: Add CLI command for deleting expenses

**Files:**

- Modify: `apps/cli/src/commands/expense.ts`

**Step 1: Write minimal implementation**
Append the `delete-expense` command to the `expenseCommands` array in `apps/cli/src/commands/expense.ts`.

```typescript
  {
    name: "delete-expense",
    description: "Delete an expense by ID",
    options: {
      "expense-id": {
        type: "string",
        description: "The expense UUID",
      },
    },
    execute: (opts, trpc) => {
      if (!opts["expense-id"]) {
        return error(
          "missing_option",
          "--expense-id is required",
          "delete-expense"
        );
      }
      return run("delete-expense", async () => {
        return trpc.expense.deleteExpense.mutate({
          expenseId: String(opts["expense-id"]),
        });
      });
    },
  },
```

**Step 2: Commit**

```bash
git add apps/cli/src/commands/expense.ts
git commit -m "feat(cli): add delete-expense command"
```

### Task 2: Add CLI command for deleting settlements

**Files:**

- Modify: `apps/cli/src/commands/settlement.ts`

**Step 1: Write minimal implementation**
Append the `delete-settlement` command to the `settlementCommands` array in `apps/cli/src/commands/settlement.ts`.

```typescript
  {
    name: "delete-settlement",
    description: "Delete a settlement by ID",
    options: {
      "settlement-id": {
        type: "string",
        description: "The settlement UUID",
      },
    },
    execute: (opts, trpc) => {
      if (!opts["settlement-id"]) {
        return error(
          "missing_option",
          "--settlement-id is required",
          "delete-settlement"
        );
      }
      return run("delete-settlement", async () => {
        return trpc.settlement.deleteSettlement.mutate({
          settlementId: String(opts["settlement-id"]),
        });
      });
    },
  },
```

**Step 2: Commit**

```bash
git add apps/cli/src/commands/settlement.ts
git commit -m "feat(cli): add delete-settlement command"
```

### Task 3: Add MCP tool for deleting expenses

**Files:**

- Modify: `apps/mcp/src/tools/expense.ts`

**Step 1: Write minimal implementation**
Add `banana_delete_expense` tool to `registerExpenseTools` function.

```typescript
server.registerTool(
  "banana_delete_expense",
  {
    title: "Delete Expense",
    description: "Delete a specific expense by ID.",
    inputSchema: {
      expense_id: z.string().describe("The expense UUID to delete."),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  toolHandler("banana_delete_expense", async ({ expense_id }) => {
    const result = await trpc.expense.deleteExpense.mutate({
      expenseId: expense_id,
    });
    return {
      content: [
        {
          type: "text" as const,
          text: `✅ ${result.message}`,
        },
      ],
    };
  })
);
```

**Step 2: Commit**

```bash
git add apps/mcp/src/tools/expense.ts
git commit -m "feat(mcp): add banana_delete_expense tool"
```

### Task 4: Add MCP tool for deleting settlements

**Files:**

- Modify: `apps/mcp/src/tools/settlement.ts`

**Step 1: Write minimal implementation**
Add `banana_delete_settlement` tool to `registerSettlementTools` function.

```typescript
server.registerTool(
  "banana_delete_settlement",
  {
    title: "Delete Settlement",
    description: "Delete a specific settlement by ID.",
    inputSchema: {
      settlement_id: z.string().describe("The settlement UUID to delete."),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  toolHandler("banana_delete_settlement", async ({ settlement_id }) => {
    const result = await trpc.settlement.deleteSettlement.mutate({
      settlementId: settlement_id,
    });
    return {
      content: [
        {
          type: "text" as const,
          text: `✅ ${result.message}`,
        },
      ],
    };
  })
);
```

**Step 2: Commit**

```bash
git add apps/mcp/src/tools/settlement.ts
git commit -m "feat(mcp): add banana_delete_settlement tool"
```

### Task 5: Build and Verify Type Checking

**Files:**

- N/A

**Step 1: Run type checking and build for CLI and MCP**

```bash
turbo run check-types --filter=@banananasplitz/cli --filter=banana-split-mcp-server
turbo run build --filter=@banananasplitz/cli --filter=banana-split-mcp-server
```

**Step 2: Commit**
If fixes are needed during typecheck, commit them. Otherwise, implementation is complete.
