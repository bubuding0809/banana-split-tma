import { readFileSync } from "node:fs";
import type { Command } from "./types.js";
import { resolveChatId } from "../scope.js";
import { run, error } from "../output.js";
import { BASE_CATEGORIES } from "@repo/categories";

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
          "Filter expenses by category id (base:<slug> or chat:<uuid>). Settlements are never filtered out.",
        required: false,
      },
    },
    execute: (opts, trpc) =>
      run("list-expenses", async () => {
        const chatId = await resolveChatId(
          trpc,
          opts["chat-id"] as string | undefined
        );

        // Resolve category labels once per command invocation.
        const categoryMap = new Map<string, { emoji: string; title: string }>();
        for (const b of BASE_CATEGORIES) {
          categoryMap.set(b.id, { emoji: b.emoji, title: b.title });
        }
        try {
          const result = await trpc.category.listByChat.query({ chatId });
          for (const c of result.items.filter((item) => item.kind === "custom")) {
            categoryMap.set(c.id, { emoji: c.emoji, title: c.title });
          }
        } catch {
          // Non-fatal: category labels are best-effort
        }

        let expenses = await trpc.expense.getExpenseByChat.query({
          chatId,
          currency: opts.currency ? String(opts.currency) : undefined,
        });

        // Apply category filter (settlements have no categoryId so they always pass).
        if (opts.category) {
          expenses = expenses.filter(
            (e: { categoryId?: string | null }) =>
              e.categoryId == null || e.categoryId === String(opts.category)
          );
        }

        // Annotate each expense with a categoryLabel for display.
        return expenses.map(
          (e: { categoryId?: string | null; [key: string]: unknown }) => {
            const cat = e.categoryId ? categoryMap.get(e.categoryId) : null;
            const categoryLabel = cat ? `${cat.emoji} ${cat.title}` : null;
            return { ...e, categoryLabel };
          }
        );
      }),
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
    execute: (opts, trpc) => {
      if (!opts["expense-id"]) {
        return error(
          "missing_option",
          "--expense-id is required",
          "get-expense"
        );
      }
      return run("get-expense", async () => {
        return trpc.expense.getExpenseDetails.query({
          expenseId: String(opts["expense-id"]),
        });
      });
    },
  },

  {
    name: "create-expense",
    description: "Create a new expense with automatic split calculation",
    agentGuidance:
      "Use this when a user adds a new expense. Always resolve the chat ID first. For EQUAL splits, you don't need custom-splits.",
    examples: [
      "banana create-expense --amount 50 --description 'Dinner' --payer-id 123 --split-mode EQUAL --participant-ids 123,456",
      'banana create-expense --amount 100 --description \'Groceries\' --payer-id 123 --split-mode EXACT --participant-ids 123,456 --custom-splits \'[{"userId":123,"amount":60},{"userId":456,"amount":40}]\'',
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
    },
    execute: (opts, trpc) => {
      if (!opts["payer-id"]) {
        return error(
          "missing_option",
          "--payer-id is required",
          "create-expense"
        );
      }
      if (!opts.description) {
        return error(
          "missing_option",
          "--description is required",
          "create-expense"
        );
      }
      if (!opts.amount) {
        return error(
          "missing_option",
          "--amount is required",
          "create-expense"
        );
      }
      if (!opts["split-mode"]) {
        return error(
          "missing_option",
          "--split-mode is required",
          "create-expense"
        );
      }
      if (!opts["participant-ids"]) {
        return error(
          "missing_option",
          "--participant-ids is required",
          "create-expense"
        );
      }

      const payerId = Number(opts["payer-id"]);
      if (Number.isNaN(payerId)) {
        return error(
          "invalid_option",
          "--payer-id must be a valid number",
          "create-expense"
        );
      }

      const amount = Number(opts.amount);
      if (Number.isNaN(amount) || amount <= 0) {
        return error(
          "invalid_option",
          "--amount must be a positive number",
          "create-expense"
        );
      }

      const creatorId = opts["creator-id"]
        ? Number(opts["creator-id"])
        : payerId;
      if (Number.isNaN(creatorId)) {
        return error(
          "invalid_option",
          "--creator-id must be a valid number",
          "create-expense"
        );
      }

      const participantIds = String(opts["participant-ids"])
        .split(",")
        .map(Number);
      if (participantIds.some(Number.isNaN)) {
        return error(
          "invalid_option",
          "--participant-ids must be comma-separated numbers",
          "create-expense"
        );
      }

      let customSplits: { userId: number; amount: number }[] | undefined;
      if (opts["custom-splits"]) {
        try {
          customSplits = JSON.parse(String(opts["custom-splits"])) as {
            userId: number;
            amount: number;
          }[];
        } catch {
          return error(
            "invalid_option",
            "--custom-splits must be valid JSON array",
            "create-expense"
          );
        }
      }

      let date: Date | undefined;
      if (opts.date) {
        date = new Date(String(opts.date));
        if (Number.isNaN(date.getTime())) {
          return error(
            "invalid_option",
            "--date must be a valid ISO 8601 date string",
            "create-expense"
          );
        }
      }

      return run("create-expense", async () => {
        const chatId = await resolveChatId(
          trpc,
          opts["chat-id"] as string | undefined
        );
        return trpc.expense.createExpense.mutate({
          chatId,
          creatorId,
          payerId,
          description: String(opts.description),
          amount,
          currency: opts.currency ? String(opts.currency) : undefined,
          date,
          splitMode: String(opts["split-mode"]) as
            | "EQUAL"
            | "EXACT"
            | "PERCENTAGE"
            | "SHARES",
          participantIds,
          customSplits,
          sendNotification: true,
        });
      });
    },
  },

  {
    name: "update-expense",
    description: "Update an existing expense",
    agentGuidance:
      "Use this to modify an expense. You must provide all required fields, even if they haven't changed. Use get-expense first to get current values.",
    examples: [
      "banana update-expense --expense-id 123e4567-e89b-12d3-a456-426614174000 --amount 60 --description 'Dinner' --payer-id 123 --split-mode EQUAL --participant-ids 123,456",
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
        required: true,
      },
      "creator-id": {
        type: "string",
        description: "The user ID creating the update (defaults to payer-id)",
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
        description: "3-letter currency code",
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
          "ISO 8601 date string (e.g. 2026-03-04 or 2026-03-04T10:00:00Z)",
        required: false,
      },
    },
    execute: (opts, trpc) => {
      if (!opts["expense-id"]) {
        return error(
          "missing_option",
          "--expense-id is required",
          "update-expense"
        );
      }
      if (!opts["payer-id"]) {
        return error(
          "missing_option",
          "--payer-id is required",
          "update-expense"
        );
      }
      if (!opts.description) {
        return error(
          "missing_option",
          "--description is required",
          "update-expense"
        );
      }
      if (!opts.amount) {
        return error(
          "missing_option",
          "--amount is required",
          "update-expense"
        );
      }
      if (!opts["split-mode"]) {
        return error(
          "missing_option",
          "--split-mode is required",
          "update-expense"
        );
      }
      if (!opts["participant-ids"]) {
        return error(
          "missing_option",
          "--participant-ids is required",
          "update-expense"
        );
      }

      const payerId = Number(opts["payer-id"]);
      const amount = Number(opts.amount);
      const creatorId = opts["creator-id"]
        ? Number(opts["creator-id"])
        : payerId;
      const participantIds = String(opts["participant-ids"])
        .split(",")
        .map(Number);

      let customSplits: { userId: number; amount: number }[] | undefined;
      if (opts["custom-splits"]) {
        try {
          customSplits = JSON.parse(String(opts["custom-splits"])) as {
            userId: number;
            amount: number;
          }[];
        } catch {
          return error(
            "invalid_option",
            "--custom-splits must be valid JSON array",
            "update-expense"
          );
        }
      }

      let date: Date | undefined;
      if (opts.date) {
        date = new Date(String(opts.date));
        if (Number.isNaN(date.getTime())) {
          return error(
            "invalid_option",
            "--date must be a valid ISO 8601 date string",
            "update-expense"
          );
        }
      }

      return run("update-expense", async () => {
        const chatId = await resolveChatId(
          trpc,
          opts["chat-id"] as string | undefined
        );
        return trpc.expense.updateExpense.mutate({
          expenseId: String(opts["expense-id"]),
          chatId,
          creatorId,
          payerId,
          description: String(opts.description),
          amount,
          date,
          currency: opts.currency ? String(opts.currency) : undefined,
          splitMode: String(opts["split-mode"]) as
            | "EQUAL"
            | "EXACT"
            | "PERCENTAGE"
            | "SHARES",
          participantIds,
          customSplits,
          sendNotification: true,
        });
      });
    },
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
    execute: (opts, trpc) => {
      if (!opts["main-user-id"]) {
        return error(
          "missing_option",
          "--main-user-id is required",
          "get-net-share"
        );
      }
      if (!opts["target-user-id"]) {
        return error(
          "missing_option",
          "--target-user-id is required",
          "get-net-share"
        );
      }
      if (!opts.currency) {
        return error(
          "missing_option",
          "--currency is required",
          "get-net-share"
        );
      }
      return run("get-net-share", async () => {
        const chatId = await resolveChatId(
          trpc,
          opts["chat-id"] as string | undefined
        );
        return trpc.expenseShare.getNetShare.query({
          mainUserId: Number(opts["main-user-id"]),
          targetUserId: Number(opts["target-user-id"]),
          chatId,
          currency: String(opts.currency),
        });
      });
    },
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
    execute: (opts, trpc) => {
      if (!opts["user-id"]) {
        return error("missing_option", "--user-id is required", "get-totals");
      }
      return run("get-totals", async () => {
        const chatId = await resolveChatId(
          trpc,
          opts["chat-id"] as string | undefined
        );
        const userId = Number(opts["user-id"]);
        const [borrowed, lent] = await Promise.all([
          trpc.expenseShare.getTotalBorrowed.query({ userId, chatId }),
          trpc.expenseShare.getTotalLent.query({ userId, chatId }),
        ]);
        return { borrowed, lent };
      });
    },
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
    },
    execute: (opts, trpc) => {
      if (!opts.file) {
        return error(
          "missing_option",
          "--file is required",
          "bulk-import-expenses"
        );
      }

      type ExpenseRow = {
        payerId: number;
        creatorId?: number;
        description: string;
        amount: number;
        currency?: string;
        splitMode: "EQUAL" | "EXACT" | "PERCENTAGE" | "SHARES";
        participantIds: number[];
        customSplits?: { userId: number; amount: number }[];
        date?: string;
      };

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

      return run("bulk-import-expenses", async () => {
        const chatId = await resolveChatId(
          trpc,
          opts["chat-id"] as string | undefined
        );

        return trpc.expense.createExpensesBulk.mutate({
          chatId,
          expenses: rows.map((row) => ({
            payerId: row.payerId,
            creatorId: row.creatorId,
            description: row.description,
            amount: row.amount,
            currency: row.currency,
            splitMode: row.splitMode,
            participantIds: row.participantIds,
            customSplits: row.customSplits,
            date: row.date ? new Date(row.date) : undefined,
          })),
        });
      });
    },
  },
];
