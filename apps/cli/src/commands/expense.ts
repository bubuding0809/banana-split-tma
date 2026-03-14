import { readFileSync } from "node:fs";
import type { Command } from "./types.js";
import { resolveChatId } from "../scope.js";
import { run, error } from "../output.js";

export const expenseCommands: Command[] = [
  {
    name: "list-expenses",
    description: "List all expenses in a chat",
    options: {
      "chat-id": {
        type: "string",
        description: "The numeric chat ID (optional if API key is chat-scoped)",
      },
      currency: {
        type: "string",
        description: "Filter by 3-letter currency code (e.g. USD)",
      },
    },
    execute: (opts, trpc) =>
      run("list-expenses", async () => {
        const chatId = await resolveChatId(
          trpc,
          opts["chat-id"] as string | undefined
        );
        return trpc.expense.getExpenseByChat.query({
          chatId,
          currency: opts.currency ? String(opts.currency) : undefined,
        });
      }),
  },

  {
    name: "get-expense",
    description: "Get full details of a specific expense",
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
    options: {
      "chat-id": {
        type: "string",
        description: "The numeric chat ID (optional if API key is chat-scoped)",
      },
      "payer-id": {
        type: "string",
        description: "The user ID who paid the expense",
      },
      "creator-id": {
        type: "string",
        description: "The user ID creating the expense (defaults to payer-id)",
      },
      description: {
        type: "string",
        description: "Short description of the expense (max 60 chars)",
      },
      amount: {
        type: "string",
        description: "The total amount of the expense",
      },
      currency: {
        type: "string",
        description: "3-letter currency code (defaults to chat base currency)",
      },
      "split-mode": {
        type: "string",
        description: "How to split: EQUAL, EXACT, PERCENTAGE, or SHARES",
      },
      "participant-ids": {
        type: "string",
        description: "Comma-separated user IDs participating in the split",
      },
      "custom-splits": {
        type: "string",
        description:
          'JSON array for non-EQUAL splits: \'[{"userId":123,"amount":30}]\'',
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
    options: {
      "expense-id": {
        type: "string",
        description: "The expense UUID",
      },
      "chat-id": {
        type: "string",
        description: "The numeric chat ID (optional if API key is chat-scoped)",
      },
      "payer-id": {
        type: "string",
        description: "The user ID who paid the expense",
      },
      "creator-id": {
        type: "string",
        description: "The user ID creating the update (defaults to payer-id)",
      },
      description: {
        type: "string",
        description: "Short description of the expense (max 60 chars)",
      },
      amount: {
        type: "string",
        description: "The total amount of the expense",
      },
      currency: {
        type: "string",
        description: "3-letter currency code",
      },
      "split-mode": {
        type: "string",
        description: "How to split: EQUAL, EXACT, PERCENTAGE, or SHARES",
      },
      "participant-ids": {
        type: "string",
        description: "Comma-separated user IDs participating in the split",
      },
      "custom-splits": {
        type: "string",
        description:
          'JSON array for non-EQUAL splits: \'[{"userId":123,"amount":30}]\'',
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
    options: {
      "main-user-id": {
        type: "string",
        description: "The user whose perspective to calculate from",
      },
      "target-user-id": {
        type: "string",
        description: "The other user in the balance calculation",
      },
      "chat-id": {
        type: "string",
        description: "The numeric chat ID (optional if API key is chat-scoped)",
      },
      currency: {
        type: "string",
        description: "3-letter currency code (e.g. USD) — required",
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
    options: {
      "user-id": {
        type: "string",
        description: "The user ID to check totals for",
      },
      "chat-id": {
        type: "string",
        description: "The numeric chat ID (optional if API key is chat-scoped)",
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

  {
    name: "bulk-import-expenses",
    description:
      "Import multiple expenses from a JSON file. Each entry mirrors create-expense options.",
    options: {
      file: {
        type: "string",
        description:
          "Path to a JSON file containing an array of expense objects",
      },
      "chat-id": {
        type: "string",
        description: "The numeric chat ID (optional if API key is chat-scoped)",
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

        const results: {
          index: number;
          status: "success" | "error";
          description: string;
          result?: unknown;
          error?: string;
        }[] = [];

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i]!;
          try {
            const result = await trpc.expense.createExpense.mutate({
              chatId,
              payerId: row.payerId,
              creatorId: row.creatorId ?? row.payerId,
              description: row.description,
              amount: row.amount,
              currency: row.currency,
              splitMode: row.splitMode,
              participantIds: row.participantIds,
              customSplits: row.customSplits,
              sendNotification: false,
            });
            results.push({
              index: i,
              status: "success",
              description: row.description,
              result,
            });
          } catch (e) {
            results.push({
              index: i,
              status: "error",
              description: row.description,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        const succeeded = results.filter((r) => r.status === "success").length;
        const failed = results.filter((r) => r.status === "error").length;
        return { total: rows.length, succeeded, failed, results };
      });
    },
  },
];
