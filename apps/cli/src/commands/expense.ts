import { readFileSync } from "node:fs";
import type { Command } from "./types.js";
import { run, error } from "../output.js";
import {
  bulkImportExpenses,
  bulkUpdateExpenses,
  createExpense,
  deleteExpense,
  getExpense,
  getNetShare,
  getTotals,
  listExpenses,
  parseUpdateExpensePatch,
  updateExpense,
  validateExpenseId,
  type BulkUpdateRow,
  type ExpenseRow,
} from "@bananasplitz/api-ops";

export const expenseCommands: Command[] = [
  {
    name: "list-expenses",
    description: "List all expenses in a chat",
    agentGuidance:
      "Use this to find a specific expense ID or to see recent activity.",
    examples: [
      "banana list-expenses --chat-id 123456789",
      "banana list-expenses --currency USD",
      "banana list-expenses --category base:food",
    ],
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
      category: {
        type: "string",
        description:
          "Filter expenses by category id (base:<slug> or chat:<uuid>). Pass 'none' to filter to uncategorized expenses.",
        required: false,
      },
    },
    execute: (opts, trpc) =>
      run("list-expenses", async () =>
        listExpenses(trpc, {
          chatId: opts["chat-id"] as string | undefined,
          currency: opts.currency ? String(opts.currency) : undefined,
          category: opts.category ? String(opts.category) : undefined,
        })
      ),
  },

  {
    name: "get-expense",
    description: "Get full details of a specific expense",
    agentGuidance:
      "Use this to see how an expense was split or to get its exact details before updating.",
    examples: [
      "banana get-expense --expense-id 123e4567-e89b-12d3-a456-426614174000",
    ],
    options: {
      "expense-id": {
        type: "string",
        description: "The expense UUID",
        required: true,
      },
    },
    execute: (opts, trpc) =>
      run("get-expense", async () =>
        getExpense(trpc, {
          expenseId: validateExpenseId(
            opts["expense-id"] as string | undefined
          ),
        })
      ),
  },

  {
    name: "create-expense",
    description: "Create a new expense with automatic split calculation",
    agentGuidance:
      "Use this when a user adds a new expense. Always resolve the chat ID first. For EQUAL splits, you don't need custom-splits.",
    examples: [
      "banana create-expense --amount 50 --description 'Dinner' --payer-id 123 --split-mode EQUAL --participant-ids 123,456",
      "banana create-expense --amount 12 --description 'Lunch' --payer-id 123 --split-mode EQUAL --participant-ids 123,456 --category base:food",
      'banana create-expense --amount 100 --description \'Groceries\' --payer-id 123 --split-mode EXACT --participant-ids 123,456 --custom-splits \'[{"userId":123,"amount":60},{"userId":456,"amount":40}]\'',
      "banana create-expense --amount 50 --description 'Netflix' --payer-id 123 --split-mode EQUAL --participant-ids 123,456 --recurrence-frequency MONTHLY",
    ],
    options: {
      "chat-id": {
        type: "string",
        description: "The numeric chat ID (optional if API key is chat-scoped)",
        required: false,
      },
      "payer-id": {
        type: "string",
        description: "The user ID who paid the expense",
        required: true,
      },
      "creator-id": {
        type: "string",
        description: "The user ID creating the expense (defaults to payer-id)",
        required: false,
      },
      description: {
        type: "string",
        description: "Short description of the expense (max 60 chars)",
        required: true,
      },
      amount: {
        type: "string",
        description: "The total amount of the expense",
        required: true,
      },
      currency: {
        type: "string",
        description: "3-letter currency code (defaults to chat base currency)",
        required: false,
      },
      "split-mode": {
        type: "string",
        description: "How to split: EQUAL, EXACT, PERCENTAGE, or SHARES",
        required: true,
      },
      "participant-ids": {
        type: "string",
        description: "Comma-separated user IDs participating in the split",
        required: true,
      },
      "custom-splits": {
        type: "string",
        description:
          'JSON array for non-EQUAL splits: \'[{"userId":123,"amount":30}]\'',
        required: false,
      },
      date: {
        type: "string",
        description:
          "ISO 8601 date string (e.g. 2026-03-04 or 2026-03-04T10:00:00Z). Defaults to now.",
        required: false,
      },
      category: {
        type: "string",
        description:
          "Category id (e.g. base:food or chat:<uuid>). Run list-categories to see options.",
        required: false,
      },
      "recurrence-frequency": {
        type: "string",
        description:
          "Set to DAILY, WEEKLY, MONTHLY, or YEARLY to create a recurring template",
        required: false,
      },
      "recurrence-interval": {
        type: "string",
        description: "Recurrence interval multiplier (default: 1)",
        required: false,
      },
      "recurrence-weekdays": {
        type: "string",
        description:
          "Comma-separated weekdays for weekly schedules (e.g., MON,WED)",
        required: false,
      },
      "recurrence-end-date": {
        type: "string",
        description: "ISO 8601 end date for the recurrence",
        required: false,
      },
      "recurrence-timezone": {
        type: "string",
        description:
          "Timezone for the schedule (defaults to system local timezone)",
        required: false,
      },
    },
    execute: (opts, trpc) =>
      run("create-expense", async () =>
        createExpense(trpc, {
          chatId: opts["chat-id"] as string | undefined,
          payerId: opts["payer-id"] as string,
          creatorId: opts["creator-id"] as string | undefined,
          description: opts.description as string,
          amount: opts.amount as string,
          currency: opts.currency as string | undefined,
          splitMode: opts["split-mode"] as string,
          participantIds: opts["participant-ids"] as string,
          customSplits: opts["custom-splits"] as string | undefined,
          date: opts.date as string | undefined,
          category: opts.category as string | undefined,
          recurrenceFrequency: opts["recurrence-frequency"] as
            | string
            | undefined,
          recurrenceInterval: opts["recurrence-interval"] as string | undefined,
          recurrenceWeekdays: opts["recurrence-weekdays"] as string | undefined,
          recurrenceEndDate: opts["recurrence-end-date"] as string | undefined,
          recurrenceTimezone: opts["recurrence-timezone"] as string | undefined,
        })
      ),
  },

  {
    name: "update-expense",
    description: "Update an existing expense",
    agentGuidance:
      "Use this to modify an expense. Omitted fields will keep their current values. Use get-expense first to get current values if needed.",
    examples: [
      "banana update-expense --expense-id 123e4567-e89b-12d3-a456-426614174000 --amount 60",
      "banana update-expense --expense-id 123e4567-e89b-12d3-a456-426614174000 --category base:food",
    ],
    options: {
      "expense-id": {
        type: "string",
        description: "The expense UUID",
        required: true,
      },
      "chat-id": {
        type: "string",
        description: "The numeric chat ID (optional if API key is chat-scoped)",
        required: false,
      },
      "payer-id": {
        type: "string",
        description: "The user ID who paid the expense",
        required: false,
      },
      "creator-id": {
        type: "string",
        description: "The user ID creating the update",
        required: false,
      },
      description: {
        type: "string",
        description: "Short description of the expense (max 60 chars)",
        required: false,
      },
      amount: {
        type: "string",
        description: "The total amount of the expense",
        required: false,
      },
      currency: {
        type: "string",
        description: "3-letter currency code",
        required: false,
      },
      "split-mode": {
        type: "string",
        description: "How to split: EQUAL, EXACT, PERCENTAGE, or SHARES",
        required: false,
      },
      "participant-ids": {
        type: "string",
        description: "Comma-separated user IDs participating in the split",
        required: false,
      },
      "custom-splits": {
        type: "string",
        description:
          'JSON array for non-EQUAL splits: \'[{"userId":123,"amount":30}]\'',
        required: false,
      },
      date: {
        type: "string",
        description:
          "ISO 8601 date string (e.g. 2026-03-04 or 2026-03-04T10:00:00Z)",
        required: false,
      },
      category: {
        type: "string",
        description:
          "Category id (base:<slug> or chat:<uuid>). Pass 'none' to clear. Omit to leave unchanged.",
        required: false,
      },
    },
    execute: (opts, trpc) =>
      run("update-expense", async () => {
        const patch = parseUpdateExpensePatch({
          expenseId: opts["expense-id"] as string | undefined,
          payerId: opts["payer-id"] as string | undefined,
          creatorId: opts["creator-id"] as string | undefined,
          description: opts.description as string | undefined,
          amount: opts.amount as string | undefined,
          currency: opts.currency as string | undefined,
          splitMode: opts["split-mode"] as string | undefined,
          participantIds: opts["participant-ids"] as string | undefined,
          customSplits: opts["custom-splits"] as string | undefined,
          date: opts.date as string | undefined,
          category: opts.category as string | undefined,
        });
        return updateExpense(trpc, {
          patch,
          chatId: opts["chat-id"] as string | undefined,
        });
      }),
  },

  {
    name: "get-net-share",
    description: "Get the net balance between two users in a chat",
    agentGuidance: "Use this to see who owes who before creating a settlement.",
    examples: [
      "banana get-net-share --main-user-id 123 --target-user-id 456 --currency USD",
    ],
    options: {
      "main-user-id": {
        type: "string",
        description: "The user whose perspective to calculate from",
        required: true,
      },
      "target-user-id": {
        type: "string",
        description: "The other user in the balance calculation",
        required: true,
      },
      "chat-id": {
        type: "string",
        description: "The numeric chat ID (optional if API key is chat-scoped)",
        required: false,
      },
      currency: {
        type: "string",
        description: "3-letter currency code (e.g. USD) — required",
        required: true,
      },
    },
    execute: (opts, trpc) =>
      run("get-net-share", async () =>
        getNetShare(trpc, {
          mainUserId: opts["main-user-id"] as string | undefined,
          targetUserId: opts["target-user-id"] as string | undefined,
          chatId: opts["chat-id"] as string | undefined,
          currency: opts.currency as string | undefined,
        })
      ),
  },

  {
    name: "get-totals",
    description: "Get total borrowed and lent amounts for a user in a chat",
    agentGuidance:
      "Use this to get a high-level overview of a user's financial state in a chat.",
    examples: ["banana get-totals --user-id 123"],
    options: {
      "user-id": {
        type: "string",
        description: "The user ID to check totals for",
        required: true,
      },
      "chat-id": {
        type: "string",
        description: "The numeric chat ID (optional if API key is chat-scoped)",
        required: false,
      },
    },
    execute: (opts, trpc) =>
      run("get-totals", async () =>
        getTotals(trpc, {
          userId: opts["user-id"] as string | undefined,
          chatId: opts["chat-id"] as string | undefined,
        })
      ),
  },

  {
    name: "delete-expense",
    description: "Delete an expense by ID",
    agentGuidance:
      "Use this to remove an expense completely. This cannot be undone.",
    examples: [
      "banana delete-expense --expense-id 123e4567-e89b-12d3-a456-426614174000",
    ],
    options: {
      "expense-id": {
        type: "string",
        description: "The expense UUID",
        required: true,
      },
    },
    execute: (opts, trpc) =>
      run("delete-expense", async () =>
        deleteExpense(trpc, {
          expenseId: validateExpenseId(
            opts["expense-id"] as string | undefined
          ),
        })
      ),
  },

  {
    name: "bulk-import-expenses",
    description:
      "Import multiple expenses from a JSON file. Each entry mirrors create-expense options.",
    agentGuidance:
      "Use this when migrating data or adding many expenses at once.",
    examples: ["banana bulk-import-expenses --file ./expenses.json"],
    options: {
      file: {
        type: "string",
        description:
          "Path to a JSON file containing an array of expense objects",
        required: true,
      },
      "chat-id": {
        type: "string",
        description: "The numeric chat ID (optional if API key is chat-scoped)",
        required: false,
      },
      notify: {
        type: "boolean",
        description:
          "Send a single condensed Telegram summary after the batch. Off by default.",
        required: false,
      },
    },
    execute: (opts, trpc) => {
      if (!opts.file) {
        return error(
          "missing_option",
          "--file is required",
          "bulk-import-expenses"
        );
      }

      let rows: ExpenseRow[];
      try {
        const raw = readFileSync(String(opts.file), "utf8");
        rows = JSON.parse(raw) as ExpenseRow[];
        if (!Array.isArray(rows)) {
          return error(
            "invalid_option",
            "JSON file must contain an array of expense objects",
            "bulk-import-expenses"
          );
        }
      } catch (e) {
        return error(
          "invalid_option",
          `Failed to read/parse file: ${e instanceof Error ? e.message : String(e)}`,
          "bulk-import-expenses"
        );
      }

      return run("bulk-import-expenses", async () =>
        bulkImportExpenses(trpc, {
          chatId: opts["chat-id"] as string | undefined,
          rows,
          notify: Boolean(opts.notify),
        })
      );
    },
  },

  {
    name: "bulk-update-expenses",
    description:
      "Update multiple expenses from a JSON file. Each row is a partial update keyed by expenseId.",
    agentGuidance:
      "Use this to update many expenses at once (e.g. retagging categories). Each row only needs `expenseId` plus the fields you want to change; omitted fields keep their current values. Rows are processed in parallel on the server and failures are reported per-row — the batch does not abort on the first error. Per-row Telegram notifications are suppressed; pass `--notify` to emit a single condensed summary message after the batch.",
    examples: [
      "banana bulk-update-expenses --file ./updates.json",
      "banana bulk-update-expenses --file ./updates.json --notify",
    ],
    options: {
      file: {
        type: "string",
        description:
          "Path to a JSON file containing an array of expense update objects (each with `expenseId` + any fields to change)",
        required: true,
      },
      "chat-id": {
        type: "string",
        description: "The numeric chat ID (optional if API key is chat-scoped)",
        required: false,
      },
      notify: {
        type: "boolean",
        description:
          "Send a single condensed Telegram summary after the batch. Off by default.",
        required: false,
      },
    },
    execute: (opts, trpc) => {
      if (!opts.file) {
        return error(
          "missing_option",
          "--file is required",
          "bulk-update-expenses"
        );
      }

      let rows: BulkUpdateRow[];
      try {
        const raw = readFileSync(String(opts.file), "utf8");
        rows = JSON.parse(raw) as BulkUpdateRow[];
        if (!Array.isArray(rows)) {
          return error(
            "invalid_option",
            "JSON file must contain an array of expense update objects",
            "bulk-update-expenses"
          );
        }
      } catch (e) {
        return error(
          "invalid_option",
          `Failed to read/parse file: ${e instanceof Error ? e.message : String(e)}`,
          "bulk-update-expenses"
        );
      }

      return run("bulk-update-expenses", async () =>
        bulkUpdateExpenses(trpc, {
          chatId: opts["chat-id"] as string | undefined,
          rows,
          notify: Boolean(opts.notify),
        })
      );
    },
  },
];
