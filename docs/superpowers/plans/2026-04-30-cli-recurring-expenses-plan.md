# CLI Recurring Expenses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose full backend recurring expense capabilities in the CLI by enhancing `create-expense` and adding a new `recurring` command module.

**Architecture:** Modifies the existing `create-expense` CLI command to route to `createExpenseWithRecurrence` when recurrence flags are present. Introduces a new `commands/recurring.ts` file housing `list`, `get`, `update`, and `cancel` commands for recurring templates.

**Tech Stack:** TypeScript, tRPC client, Node.js CLI (parseArgs)

---

### Task 1: Update `create-expense` to Support Recurrence

**Files:**
- Modify: `apps/cli/src/commands/expense.ts`

- [ ] **Step 1: Add recurrence flags to `create-expense` options configuration**

```typescript
// Add to the options object in create-expense command definition:
      "recurrence-frequency": {
        type: "string",
        description: "Set to DAILY, WEEKLY, MONTHLY, or YEARLY to create a recurring template",
        required: false,
      },
      "recurrence-interval": {
        type: "string",
        description: "Recurrence interval multiplier (default: 1)",
        required: false,
      },
      "recurrence-weekdays": {
        type: "string",
        description: "Comma-separated weekdays for weekly schedules (e.g., MON,WED)",
        required: false,
      },
      "recurrence-end-date": {
        type: "string",
        description: "ISO 8601 end date for the recurrence",
        required: false,
      },
      "recurrence-timezone": {
        type: "string",
        description: "Timezone for the schedule (defaults to system local timezone)",
        required: false,
      },
```

- [ ] **Step 2: Add recurrence examples to `create-expense` examples array**

```typescript
// Add to the examples array:
      "banana create-expense --amount 50 --description 'Netflix' --payer-id 123 --split-mode EQUAL --participant-ids 123,456 --recurrence-frequency MONTHLY",
```

- [ ] **Step 3: Parse and validate recurrence parameters in execute function**

```typescript
// Insert in the execute() function before the run() block:
      const frequency = opts["recurrence-frequency"] as string | undefined;
      let recurrenceParams: any = undefined;

      if (frequency) {
        if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(frequency)) {
          return error("invalid_option", "--recurrence-frequency must be DAILY, WEEKLY, MONTHLY, or YEARLY", "create-expense");
        }

        const interval = opts["recurrence-interval"] ? Number(opts["recurrence-interval"]) : 1;
        if (Number.isNaN(interval) || interval <= 0) {
          return error("invalid_option", "--recurrence-interval must be a positive number", "create-expense");
        }

        let weekdays: string[] | undefined;
        if (opts["recurrence-weekdays"]) {
          weekdays = String(opts["recurrence-weekdays"]).split(",").map(s => s.trim().toUpperCase());
          const validWeekdays = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
          if (weekdays.some(w => !validWeekdays.includes(w))) {
             return error("invalid_option", "--recurrence-weekdays must contain valid short days (SUN,MON,TUE...)", "create-expense");
          }
        } else if (frequency === "WEEKLY") {
           // Default to current day if WEEKLY and no weekdays provided
           const currentDayStr = new Date().toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
           weekdays = [currentDayStr];
        }

        let endDate: Date | undefined;
        if (opts["recurrence-end-date"]) {
          endDate = new Date(String(opts["recurrence-end-date"]));
          if (Number.isNaN(endDate.getTime())) {
            return error("invalid_option", "--recurrence-end-date must be a valid ISO 8601 date string", "create-expense");
          }
        }

        const timezone = (opts["recurrence-timezone"] as string) || Intl.DateTimeFormat().resolvedOptions().timeZone;

        recurrenceParams = {
          frequency,
          interval,
          weekdays: weekdays ?? [],
          endDate,
          timezone,
        };
      }
```

- [ ] **Step 4: Branch tRPC mutation logic**

```typescript
// Replace the current return trpc.expense.createExpense.mutate(...) with:
        const payload = {
          chatId,
          creatorId,
          payerId,
          description: String(opts.description),
          amount,
          currency: opts.currency ? String(opts.currency) : undefined,
          date,
          splitMode: String(opts["split-mode"]) as "EQUAL" | "EXACT" | "PERCENTAGE" | "SHARES",
          participantIds,
          customSplits,
          categoryId: opts.category ? String(opts.category) : undefined,
          sendNotification: true,
        };

        if (recurrenceParams) {
           return trpc.expense.createExpenseWithRecurrence.mutate({
             expense: payload,
             recurrence: recurrenceParams
           });
        }

        return trpc.expense.createExpense.mutate(payload);
```

- [ ] **Step 5: Type check project**
Run `pnpm run check-types` in `apps/cli`.
Expected: `0 errors`

- [ ] **Step 6: Commit changes**
Run `git add apps/cli/src/commands/expense.ts && git commit -m "feat(cli): add recurrence flags to create-expense"`

---

### Task 2: Create the `recurring.ts` Command Module

**Files:**
- Create: `apps/cli/src/commands/recurring.ts`

- [ ] **Step 1: Write `list-recurring-expenses` and `get-recurring-expense`**

```typescript
// apps/cli/src/commands/recurring.ts
import type { Command } from "./types.js";
import { resolveChatId } from "../scope.js";
import { run, error } from "../output.js";

export const recurringCommands: Command[] = [
  {
    name: "list-recurring-expenses",
    description: "List all active recurring expenses in a chat",
    agentGuidance: "Use this to find active template IDs for updating or canceling.",
    examples: ["banana list-recurring-expenses --chat-id 123456789"],
    options: {
      "chat-id": {
        type: "string",
        description: "The numeric chat ID",
        required: false,
      },
    },
    execute: (opts, trpc) =>
      run("list-recurring-expenses", async () => {
        const chatId = await resolveChatId(trpc, opts["chat-id"] as string | undefined);
        return trpc.expense.recurring.list.query({ chatId: Number(chatId) });
      }),
  },
  {
    name: "get-recurring-expense",
    description: "Get details for a specific recurring expense template",
    agentGuidance: "Use this to see schedule details before updating.",
    examples: ["banana get-recurring-expense --template-id 123e4567-e89b-12d3-a456-426614174000"],
    options: {
      "template-id": {
        type: "string",
        description: "The template UUID",
        required: true,
      },
    },
    execute: (opts, trpc) => {
      if (!opts["template-id"]) {
        return error("missing_option", "--template-id is required", "get-recurring-expense");
      }
      return run("get-recurring-expense", async () => {
        return trpc.expense.recurring.get.query({
          templateId: String(opts["template-id"]),
        });
      });
    },
  },
];
```

- [ ] **Step 2: Add `update-recurring-expense`**

```typescript
// Append to recurringCommands array in apps/cli/src/commands/recurring.ts:
  {
    name: "update-recurring-expense",
    description: "Update schedule or details of a recurring template",
    agentGuidance: "Use this to change the frequency, amount, or description. Omitting a flag keeps its current value.",
    examples: ["banana update-recurring-expense --template-id <uuid> --amount 60 --frequency MONTHLY"],
    options: {
      "template-id": {
        type: "string",
        description: "The template UUID",
        required: true,
      },
      amount: {
        type: "string",
        description: "New total amount",
        required: false,
      },
      description: {
        type: "string",
        description: "New description",
        required: false,
      },
      frequency: {
        type: "string",
        description: "DAILY, WEEKLY, MONTHLY, or YEARLY",
        required: false,
      },
      interval: {
        type: "string",
        description: "Recurrence interval multiplier",
        required: false,
      },
      weekdays: {
        type: "string",
        description: "Comma-separated weekdays (e.g., MON,WED)",
        required: false,
      },
      "end-date": {
        type: "string",
        description: "ISO 8601 end date (use 'none' to clear)",
        required: false,
      },
    },
    execute: (opts, trpc) => {
      if (!opts["template-id"]) {
        return error("missing_option", "--template-id is required", "update-recurring-expense");
      }
      
      return run("update-recurring-expense", async () => {
        const payload: Parameters<typeof trpc.expense.recurring.update.mutate>[0] = {
          templateId: String(opts["template-id"]),
        };

        if (opts.amount) {
          const amt = Number(opts.amount);
          if (Number.isNaN(amt) || amt <= 0) throw new Error("--amount must be a positive number");
          payload.amount = amt;
        }

        if (opts.description) payload.description = String(opts.description);
        
        if (opts.frequency) {
          const freq = String(opts.frequency);
          if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)) {
             throw new Error("--frequency must be DAILY, WEEKLY, MONTHLY, or YEARLY");
          }
          payload.frequency = freq as "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
        }

        if (opts.interval) {
          const ival = Number(opts.interval);
          if (Number.isNaN(ival) || ival <= 0) throw new Error("--interval must be a positive number");
          payload.interval = ival;
        }

        if (opts.weekdays) {
          const days = String(opts.weekdays).split(",").map(s => s.trim().toUpperCase());
          const valid = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
          if (days.some(d => !valid.includes(d))) {
             throw new Error("--weekdays must contain valid short days (SUN,MON...)");
          }
          payload.weekdays = days as ("SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT")[];
        }

        if (opts["end-date"] !== undefined) {
          if (String(opts["end-date"]).toLowerCase() === "none") {
             payload.endDate = null;
          } else {
             const ed = new Date(String(opts["end-date"]));
             if (Number.isNaN(ed.getTime())) throw new Error("--end-date must be valid ISO date or 'none'");
             payload.endDate = ed;
          }
        }

        return trpc.expense.recurring.update.mutate(payload);
      });
    },
  },
```

- [ ] **Step 3: Add `cancel-recurring-expense`**

```typescript
// Append to recurringCommands array in apps/cli/src/commands/recurring.ts:
  {
    name: "cancel-recurring-expense",
    description: "Cancel an active recurring expense template",
    agentGuidance: "Use this to stop future recurrences. Existing generated expenses are untouched.",
    examples: ["banana cancel-recurring-expense --template-id <uuid>"],
    options: {
      "template-id": {
        type: "string",
        description: "The template UUID",
        required: true,
      },
    },
    execute: (opts, trpc) => {
      if (!opts["template-id"]) {
        return error("missing_option", "--template-id is required", "cancel-recurring-expense");
      }
      return run("cancel-recurring-expense", async () => {
        return trpc.expense.recurring.cancel.mutate({
          templateId: String(opts["template-id"]),
        });
      });
    },
  }
```

- [ ] **Step 4: Type check project**
Run `pnpm run check-types` in `apps/cli`.
Expected: `0 errors`

- [ ] **Step 5: Commit changes**
Run `git add apps/cli/src/commands/recurring.ts && git commit -m "feat(cli): add recurring commands module"`

---

### Task 3: Register `recurringCommands` in CLI core

**Files:**
- Modify: `apps/cli/src/cli.ts`

- [ ] **Step 1: Import and register commands**

```typescript
// Add import at the top of apps/cli/src/cli.ts:
import { recurringCommands } from "./commands/recurring.js";

// Add to ALL_COMMANDS array:
const ALL_COMMANDS: Command[] = [
  ...chatCommands,
  ...expenseCommands,
  ...settlementCommands,
  ...snapshotCommands,
  ...currencyCommands,
  ...reminderCommands,
  ...meCommands,
  ...categoryCommands,
  ...recurringCommands,
];
```

- [ ] **Step 2: Type check project**
Run `pnpm run check-types` in `apps/cli`.
Expected: `0 errors`

- [ ] **Step 3: Commit changes**
Run `git add apps/cli/src/cli.ts && git commit -m "feat(cli): register recurring commands in core module"`

---

### Task 4: Local Sanity Check (Optional but recommended)

Since the CLI builds via `tsup`, we should ensure everything compiles properly.

- [ ] **Step 1: Build the CLI**
Run: `pnpm --filter @banananasplitz/cli run build`
Expected: Output showing successful build into `dist/cli.js`.

- [ ] **Step 2: Test `--help` output**
Run: `node apps/cli/dist/cli.js help`
Expected: Should see `list-recurring-expenses`, `get-recurring-expense`, `update-recurring-expense`, and `cancel-recurring-expense` in the list of commands.

- [ ] **Step 3: Test `create-expense --help`**
Run: `node apps/cli/dist/cli.js create-expense --help`
Expected: Should see `--recurrence-frequency` and the other new flags listed in the options array.

**Final Commit (if needed for build outputs, though dist is usually gitignored):**
Not required if `dist/` is ignored.