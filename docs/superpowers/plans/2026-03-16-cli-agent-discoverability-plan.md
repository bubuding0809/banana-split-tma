# CLI Agent Discoverability Enhancement Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the CLI help system to provide structured metadata, examples, and agent guidance, split into global and command-specific views.

**Architecture:** Update the `Command` and `CommandOption` interfaces to include new metadata fields. Refactor the `showHelp` function in `cli.ts` to intercept command-specific help requests and output detailed JSON, while keeping the global help concise. Update all command definitions to populate the new metadata.

**Tech Stack:** TypeScript, Node.js

---

## Chunk 1: Update Types and CLI Entrypoint

### Task 1: Update Command Interfaces

**Files:**

- Modify: `apps/cli/src/commands/types.ts`

- [ ] **Step 1: Update `CommandOption` interface**

Add `required?: boolean` and `default?: string | boolean` to `CommandOption`.

```typescript
export interface CommandOption {
  type: "string" | "boolean";
  description: string;
  required?: boolean;
  default?: string | boolean;
}
```

- [ ] **Step 2: Update `Command` interface**

Add `agentGuidance?: string` and `examples?: string[]` to `Command`.

```typescript
export interface Command {
  name: string;
  description: string;
  agentGuidance?: string;
  examples?: string[];
  options: Record<string, CommandOption>;
  execute: (
    opts: Record<string, string | boolean | string[] | undefined>,
    trpc: TrpcClient
  ) => Promise<unknown>;
}
```

- [ ] **Step 3: Run type check**

Run: `pnpm --filter @banananasplitz/cli check-types`
Expected: PASS (or errors in command files that we will fix in the next tasks)

- [ ] **Step 4: Commit**

```bash
git add apps/cli/src/commands/types.ts
git commit -m "feat(cli): add metadata fields to command interfaces"
```

### Task 2: Write Tests for Help Output

**Files:**

- Create: `apps/cli/src/cli.test.ts`

- [ ] **Step 1: Write tests for help output**

```typescript
import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";

describe("CLI Help System", () => {
  it("should output concise global help", () => {
    const output = execSync("node dist/cli.js --help").toString();
    const parsed = JSON.parse(output);

    expect(parsed.name).toBe("banana");
    expect(parsed.agent_instructions).toBeDefined();
    expect(parsed.commands).toBeDefined();
    expect(parsed.commands.length).toBeGreaterThan(0);

    // Global help should not have detailed options for commands
    const createExpenseCmd = parsed.commands.find(
      (c: any) => c.name === "create-expense"
    );
    expect(createExpenseCmd.options).toBeUndefined();
  });

  it("should output detailed command-specific help", () => {
    const output = execSync(
      "node dist/cli.js create-expense --help"
    ).toString();
    const parsed = JSON.parse(output);

    expect(parsed.command).toBe("create-expense");
    expect(parsed.agentGuidance).toBeDefined();
    expect(parsed.examples).toBeDefined();
    expect(parsed.options).toBeDefined();

    // Check for required flags
    const amountOpt = parsed.options.find((o: any) => o.name === "--amount");
    expect(amountOpt.required).toBe(true);
  });

  it("should support 'help <command>' syntax", () => {
    const output = execSync("node dist/cli.js help create-expense").toString();
    const parsed = JSON.parse(output);

    expect(parsed.command).toBe("create-expense");
    expect(parsed.options).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests**

Run: `pnpm --filter @banananasplitz/cli test`
Expected: FAIL (because implementation is not done yet)

- [ ] **Step 3: Commit**

```bash
git add apps/cli/src/cli.test.ts
git commit -m "test(cli): add failing tests for help system"
```

### Task 3: Refactor Help System in CLI Entrypoint

**Files:**

- Modify: `apps/cli/src/cli.ts`

- [ ] **Step 1: Update `showHelp` for global help**

Modify `showHelp` to output a concise list of commands and add `agent_instructions`.

```typescript
function showHelp(): never {
  const commands = ALL_COMMANDS.map((cmd) => ({
    name: cmd.name,
    description: cmd.description,
  }));

  const globalOptions = Object.entries(GLOBAL_OPTIONS).map(([name, opt]) => ({
    name: `--${name}`,
    type: opt.type,
    description: opt.description,
  }));

  return success({
    name: "banana",
    description: "Agent-first CLI for Banana Split expense tracking API",
    agent_instructions:
      "To see detailed options, required fields, and examples for a specific command, run: banana <command> --help",
    commands: [
      { name: "help", description: "Show this help information" },
      {
        name: "login",
        description: "Save API key to config file",
      },
      {
        name: "install-skill",
        description:
          "Output Agent Skills spec skill path for AI agent integration",
      },
      ...commands,
    ],
    globalOptions,
  });
}
```

- [ ] **Step 2: Implement command-specific help interception**

In `main()`, check if `--help` is passed alongside a command name.

```typescript
// Handle global help: no args, or just "help" or "--help"
if (
  !commandName ||
  (commandName === "help" && args.length === 1) ||
  (commandName === "--help" && args.length === 1)
) {
  return showHelp();
}

// Handle command-specific help
if (args.includes("--help") || args.includes("-h") || commandName === "help") {
  const targetCommandName = commandName === "help" ? args[1] : commandName;
  const command = ALL_COMMANDS.find((cmd) => cmd.name === targetCommandName);
  if (command) {
    return success({
      command: command.name,
      description: command.description,
      agentGuidance: command.agentGuidance,
      examples: command.examples,
      options: Object.entries(command.options).map(([name, opt]) => ({
        name: `--${name}`,
        type: opt.type,
        description: opt.description,
        required: opt.required,
        default: opt.default,
      })),
    });
  }
  // If command not found, let it fall through to the unknown command error below
}

// Handle command-specific help
if (args.includes("--help") || args.includes("-h")) {
  const command = ALL_COMMANDS.find((cmd) => cmd.name === commandName);
  if (command) {
    return success({
      command: command.name,
      description: command.description,
      agentGuidance: command.agentGuidance,
      examples: command.examples,
      options: Object.entries(command.options).map(([name, opt]) => ({
        name: `--${name}`,
        type: opt.type,
        description: opt.description,
        required: opt.required,
        default: opt.default,
      })),
    });
  }
  // If command not found, let it fall through to the unknown command error below
}
```

- [ ] **Step 3: Run type check and build**

Run: `pnpm --filter @banananasplitz/cli check-types && pnpm --filter @banananasplitz/cli build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/cli/src/cli.ts
git commit -m "feat(cli): implement command-specific help and concise global help"
```

---

## Chunk 2: Update Command Definitions

### Task 4: Update Chat Commands

**Files:**

- Modify: `apps/cli/src/commands/chat.ts`

- [ ] **Step 1: Add metadata to `get-chat`**

```typescript
  {
    name: "get-chat",
    description: "Get details of a specific chat",
    agentGuidance: "Use this to verify a chat exists or to get its base currency.",
    examples: ["banana get-chat --chat-id 123456789"],
    options: {
      "chat-id": {
        type: "string",
        description: "The numeric chat ID (optional if API key is chat-scoped)",
        required: false,
      },
    },
    // ...
```

- [ ] **Step 2: Add metadata to `list-chats`**

```typescript
  {
    name: "list-chats",
    description: "List all chats the user is a member of",
    agentGuidance: "Use this to find the chat ID when the user doesn't provide one.",
    examples: ["banana list-chats"],
    options: {},
    // ...
```

- [ ] **Step 3: Add metadata to `get-debts`, `get-simplified-debts`, `update-chat-settings`**

```typescript
  {
    name: "get-debts",
    description: "Get all outstanding debts in a chat",
    agentGuidance: "Use this to see all individual debts before simplification.",
    examples: ["banana get-debts --chat-id 123456789"],
    options: {
      "chat-id": { type: "string", description: "The numeric chat ID", required: false },
      currencies: { type: "string", description: "Comma-separated 3-letter currency codes", required: false },
    },
    // ...
  },
  {
    name: "get-simplified-debts",
    description: "Get optimized/simplified debt graph for a chat in a specific currency",
    agentGuidance: "Use this to see the most efficient way to settle all debts in a chat.",
    examples: ["banana get-simplified-debts --chat-id 123456789 --currency USD"],
    options: {
      "chat-id": { type: "string", description: "The numeric chat ID", required: false },
      currency: { type: "string", description: "3-letter currency code", required: true },
    },
    // ...
  },
  {
    name: "update-chat-settings",
    description: "Update chat settings (debt simplification, base currency)",
    agentGuidance: "Use this to change how debts are calculated or the default currency.",
    examples: ["banana update-chat-settings --chat-id 123456789 --debt-simplification true --base-currency USD"],
    options: {
      "chat-id": { type: "string", description: "The numeric chat ID", required: false },
      "debt-simplification": { type: "string", description: "Enable/disable debt simplification (true/false)", required: false },
      "base-currency": { type: "string", description: "Update default 3-letter currency code", required: false },
    },
    // ...
  }
```

- [ ] **Step 4: Commit**

```bash
git add apps/cli/src/commands/chat.ts
git commit -m "feat(cli): add metadata to chat commands"
```

### Task 5: Update Expense Commands

**Files:**

- Modify: `apps/cli/src/commands/expense.ts`

- [ ] **Step 1: Add metadata to `list-expenses`**

```typescript
  {
    name: "list-expenses",
    description: "List all expenses in a chat",
    agentGuidance: "Use this to find a specific expense ID or to see recent activity.",
    examples: ["banana list-expenses --chat-id 123456789", "banana list-expenses --currency USD"],
    options: {
      "chat-id": {
        type: "string",
        description: "The numeric chat ID (optional if API key is chat-scoped)",
        required: false,
      },
      currency: {
        type: "string",
        description: "Filter by 3-letter currency code (e.g. USD)",
        required: false,
      },
    },
    // ...
```

- [ ] **Step 2: Add metadata to `get-expense`**

```typescript
  {
    name: "get-expense",
    description: "Get full details of a specific expense",
    agentGuidance: "Use this to see how an expense was split or to get its exact details before updating.",
    examples: ["banana get-expense --expense-id 123e4567-e89b-12d3-a456-426614174000"],
    options: {
      "expense-id": {
        type: "string",
        description: "The expense UUID",
        required: true,
      },
    },
    // ...
```

- [ ] **Step 3: Add metadata to `create-expense`**

```typescript
  {
    name: "create-expense",
    description: "Create a new expense with automatic split calculation",
    agentGuidance: "Use this when a user adds a new expense. Always resolve the chat ID first. For EQUAL splits, you don't need custom-splits.",
    examples: [
      "banana create-expense --amount 50 --description 'Dinner' --payer-id 123 --split-mode EQUAL --participant-ids 123,456",
      "banana create-expense --amount 100 --description 'Groceries' --payer-id 123 --split-mode EXACT --participant-ids 123,456 --custom-splits '[{\"userId\":123,\"amount\":60},{\"userId\":456,\"amount\":40}]'"
    ],
    options: {
      "chat-id": { type: "string", description: "The numeric chat ID", required: false },
      "payer-id": { type: "string", description: "The user ID who paid", required: true },
      "creator-id": { type: "string", description: "The user ID creating the expense", required: false },
      description: { type: "string", description: "Short description (max 60 chars)", required: true },
      amount: { type: "string", description: "The total amount", required: true },
      currency: { type: "string", description: "3-letter currency code", required: false },
      "split-mode": { type: "string", description: "EQUAL, EXACT, PERCENTAGE, or SHARES", required: true },
      "participant-ids": { type: "string", description: "Comma-separated user IDs", required: true },
      "custom-splits": { type: "string", description: "JSON array for non-EQUAL splits", required: false },
      date: { type: "string", description: "ISO 8601 date string", required: false },
    },
    // ...
```

- [ ] **Step 4: Add metadata to `update-expense`**

```typescript
  {
    name: "update-expense",
    description: "Update an existing expense",
    agentGuidance: "Use this to modify an expense. You must provide all required fields, even if they haven't changed. Use get-expense first to get current values.",
    examples: [
      "banana update-expense --expense-id 123e4567-e89b-12d3-a456-426614174000 --amount 60 --description 'Dinner' --payer-id 123 --split-mode EQUAL --participant-ids 123,456"
    ],
    options: {
      "expense-id": { type: "string", description: "The expense UUID", required: true },
      "chat-id": { type: "string", description: "The numeric chat ID", required: false },
      "payer-id": { type: "string", description: "The user ID who paid", required: true },
      "creator-id": { type: "string", description: "The user ID creating the update", required: false },
      description: { type: "string", description: "Short description", required: true },
      amount: { type: "string", description: "The total amount", required: true },
      currency: { type: "string", description: "3-letter currency code", required: false },
      "split-mode": { type: "string", description: "EQUAL, EXACT, PERCENTAGE, or SHARES", required: true },
      "participant-ids": { type: "string", description: "Comma-separated user IDs", required: true },
      "custom-splits": { type: "string", description: "JSON array for non-EQUAL splits", required: false },
      date: { type: "string", description: "ISO 8601 date string", required: false },
    },
    // ...
```

- [ ] **Step 5: Add metadata to `get-net-share`, `get-totals`, `delete-expense`, `bulk-import-expenses`**

```typescript
  {
    name: "get-net-share",
    description: "Get the net balance between two users in a chat",
    agentGuidance: "Use this to see who owes who before creating a settlement.",
    examples: ["banana get-net-share --main-user-id 123 --target-user-id 456 --currency USD"],
    options: {
      "main-user-id": { type: "string", description: "The user whose perspective to calculate from", required: true },
      "target-user-id": { type: "string", description: "The other user in the balance calculation", required: true },
      "chat-id": { type: "string", description: "The numeric chat ID", required: false },
      currency: { type: "string", description: "3-letter currency code", required: true },
    },
    // ...
  },
  {
    name: "get-totals",
    description: "Get total borrowed and lent amounts for a user in a chat",
    agentGuidance: "Use this to get a high-level overview of a user's financial state in a chat.",
    examples: ["banana get-totals --user-id 123"],
    options: {
      "user-id": { type: "string", description: "The user ID to check totals for", required: true },
      "chat-id": { type: "string", description: "The numeric chat ID", required: false },
    },
    // ...
  },
  {
    name: "delete-expense",
    description: "Delete an expense by ID",
    agentGuidance: "Use this to remove an expense completely. This cannot be undone.",
    examples: ["banana delete-expense --expense-id 123e4567-e89b-12d3-a456-426614174000"],
    options: {
      "expense-id": { type: "string", description: "The expense UUID", required: true },
    },
    // ...
  },
  {
    name: "bulk-import-expenses",
    description: "Import multiple expenses from a JSON file",
    agentGuidance: "Use this when migrating data or adding many expenses at once.",
    examples: ["banana bulk-import-expenses --file ./expenses.json"],
    options: {
      file: { type: "string", description: "Path to a JSON file", required: true },
      "chat-id": { type: "string", description: "The numeric chat ID", required: false },
    },
    // ...
  }
```

- [ ] **Step 6: Commit**

```bash
git add apps/cli/src/commands/expense.ts
git commit -m "feat(cli): add metadata to expense commands"
```

### Task 6: Update Remaining Commands

**Files:**

- Modify: `apps/cli/src/commands/settlement.ts`
- Modify: `apps/cli/src/commands/snapshot.ts`
- Modify: `apps/cli/src/commands/currency.ts`

- [ ] **Step 1: Add metadata to settlement commands**

```typescript
  {
    name: "list-settlements",
    description: "List all debt settlements in a chat",
    agentGuidance: "Use this to see past payments between users.",
    examples: ["banana list-settlements --chat-id 123456789"],
    options: {
      "chat-id": { type: "string", description: "The numeric chat ID", required: false },
      currency: { type: "string", description: "Filter by 3-letter currency code", required: false },
    },
    // ...
  },
  {
    name: "create-settlement",
    description: "Record a debt settlement/payment between two users",
    agentGuidance: "Use this when a user says 'I paid back $50 to Bob'. Always use get-net-share first to verify the debt.",
    examples: ["banana create-settlement --sender-id 123 --receiver-id 456 --amount 50 --currency USD"],
    options: {
      "chat-id": { type: "string", description: "The numeric chat ID", required: false },
      "sender-id": { type: "string", description: "The user ID who is paying", required: true },
      "receiver-id": { type: "string", description: "The user ID who is receiving", required: true },
      amount: { type: "string", description: "The amount being paid", required: true },
      currency: { type: "string", description: "3-letter currency code", required: false },
      description: { type: "string", description: "Optional note", required: false },
    },
    // ...
  },
  {
    name: "delete-settlement",
    description: "Delete a settlement by ID",
    agentGuidance: "Use this to undo a settlement.",
    examples: ["banana delete-settlement --settlement-id 123e4567-e89b-12d3-a456-426614174000"],
    options: {
      "settlement-id": { type: "string", description: "The settlement UUID", required: true },
    },
    // ...
  },
  {
    name: "settle-all-debts",
    description: "Settle all debts between two users across multiple currencies",
    agentGuidance: "Use this when a user wants to clear all balances with someone else.",
    examples: ["banana settle-all-debts --sender-id 123 --receiver-id 456 --balances '[{\"currency\":\"USD\",\"amount\":15}]'"],
    options: {
      "chat-id": { type: "string", description: "The numeric chat ID", required: false },
      "sender-id": { type: "string", description: "The user ID paying", required: true },
      "receiver-id": { type: "string", description: "The user ID receiving", required: true },
      balances: { type: "string", description: "JSON array of balances", required: true },
      "creditor-name": { type: "string", description: "Optional creditor name", required: false },
      "debtor-name": { type: "string", description: "Optional debtor name", required: false },
    },
    // ...
  }
```

- [ ] **Step 2: Add metadata to snapshot commands**

```typescript
  {
    name: "list-snapshots",
    description: "List all expense snapshots in a chat",
    agentGuidance: "Use this to find a snapshot ID.",
    examples: ["banana list-snapshots"],
    options: {
      "chat-id": { type: "string", description: "The numeric chat ID", required: false },
    },
    // ...
  },
  {
    name: "get-snapshot",
    description: "Get full details of a specific snapshot",
    agentGuidance: "Use this to see which expenses are included in a snapshot.",
    examples: ["banana get-snapshot --snapshot-id 123e4567-e89b-12d3-a456-426614174000"],
    options: {
      "snapshot-id": { type: "string", description: "The snapshot UUID", required: true },
    },
    // ...
  },
  {
    name: "create-snapshot",
    description: "Create an expense snapshot combining multiple specific expenses",
    agentGuidance: "Use this to group expenses together.",
    examples: ["banana create-snapshot --creator-id 123 --title 'Trip to Japan' --expense-ids 'id1,id2'"],
    options: {
      "chat-id": { type: "string", description: "The numeric chat ID", required: false },
      "creator-id": { type: "string", description: "The user ID creating the snapshot", required: true },
      title: { type: "string", description: "Snapshot title", required: true },
      "expense-ids": { type: "string", description: "Comma-separated expense UUIDs", required: true },
    },
    // ...
  },
  {
    name: "update-snapshot",
    description: "Modify an existing snapshot's title or associated expenses",
    agentGuidance: "Use this to add or remove expenses from a snapshot.",
    examples: ["banana update-snapshot --snapshot-id 123e4567-e89b-12d3-a456-426614174000 --title 'Trip to Japan' --expense-ids 'id1,id2,id3'"],
    options: {
      "snapshot-id": { type: "string", description: "The snapshot UUID", required: true },
      "chat-id": { type: "string", description: "The numeric chat ID", required: false },
      title: { type: "string", description: "Snapshot title", required: true },
      "expense-ids": { type: "string", description: "Comma-separated expense UUIDs", required: true },
    },
    // ...
  },
  {
    name: "delete-snapshot",
    description: "Delete an existing snapshot",
    agentGuidance: "Use this to remove a snapshot. The underlying expenses are not deleted.",
    examples: ["banana delete-snapshot --snapshot-id 123e4567-e89b-12d3-a456-426614174000"],
    options: {
      "snapshot-id": { type: "string", description: "The snapshot UUID", required: true },
    },
    // ...
  }
```

- [ ] **Step 3: Add metadata to currency commands**

```typescript
  {
    name: "get-exchange-rate",
    description: "Get the current exchange rate between two currencies",
    agentGuidance: "Use this to check conversion rates before creating expenses in foreign currencies.",
    examples: ["banana get-exchange-rate --base-currency USD --target-currency SGD"],
    options: {
      "base-currency": { type: "string", description: "The source currency code", required: true },
      "target-currency": { type: "string", description: "The target currency code", required: true },
    },
    // ...
  }
```

- [ ] **Step 4: Run type check and build**

Run: `pnpm --filter @banananasplitz/cli check-types && pnpm --filter @banananasplitz/cli build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/cli/src/commands/settlement.ts apps/cli/src/commands/snapshot.ts apps/cli/src/commands/currency.ts
git commit -m "feat(cli): add metadata to remaining commands"
```
