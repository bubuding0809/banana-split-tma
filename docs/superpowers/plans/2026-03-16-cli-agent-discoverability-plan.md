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

### Task 2: Refactor Help System in CLI Entrypoint

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
  commandName === "help" ||
  (commandName === "--help" && args.length === 1)
) {
  return showHelp();
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

### Task 3: Update Chat Commands

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

- [ ] **Step 3: Commit**

```bash
git add apps/cli/src/commands/chat.ts
git commit -m "feat(cli): add metadata to chat commands"
```

### Task 4: Update Expense Commands

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

Update the remaining commands in `expense.ts` with appropriate `required` flags, `agentGuidance`, and `examples`.

- [ ] **Step 6: Commit**

```bash
git add apps/cli/src/commands/expense.ts
git commit -m "feat(cli): add metadata to expense commands"
```

### Task 5: Update Remaining Commands

**Files:**

- Modify: `apps/cli/src/commands/settlement.ts`
- Modify: `apps/cli/src/commands/snapshot.ts`
- Modify: `apps/cli/src/commands/currency.ts`

- [ ] **Step 1: Add metadata to settlement commands**

Update `get-settlements`, `create-settlement`, `delete-settlement` with `required` flags, `agentGuidance`, and `examples`.

- [ ] **Step 2: Add metadata to snapshot commands**

Update `create-snapshot`, `list-snapshots`, `get-snapshot`, `restore-snapshot` with `required` flags, `agentGuidance`, and `examples`.

- [ ] **Step 3: Add metadata to currency commands**

Update `get-exchange-rates` with `required` flags, `agentGuidance`, and `examples`.

- [ ] **Step 4: Run type check and build**

Run: `pnpm --filter @banananasplitz/cli check-types && pnpm --filter @banananasplitz/cli build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/cli/src/commands/settlement.ts apps/cli/src/commands/snapshot.ts apps/cli/src/commands/currency.ts
git commit -m "feat(cli): add metadata to remaining commands"
```
