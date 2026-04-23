import { readFileSync } from "node:fs";
import type { Command } from "./types.js";
import { resolveChatId } from "../scope.js";
import { run, error } from "../output.js";
import { BASE_CATEGORIES } from "@repo/categories";

type ExpenseSplitMode = "EQUAL" | "EXACT" | "PERCENTAGE" | "SHARES";

type ExpenseUpdatePatch = {
  expenseId: string;
  payerId?: number;
  creatorId?: number;
  description?: string;
  amount?: number;
  currency?: string;
  splitMode?: ExpenseSplitMode;
  participantIds?: number[];
  customSplits?: { userId: number; amount: number }[];
  date?: Date;
  categoryId?: string | null;
};

async function applyExpensePartialUpdate(
  patch: ExpenseUpdatePatch,
  trpc: any,
  chatId: number,
  opts: { sendNotification?: boolean } = {}
): Promise<any> {
  const existing = await trpc.expense.getExpenseDetails.query({
    expenseId: patch.expenseId,
  });

  // getExpenseDetails returns { amount: null, splitMode: undefined, ... }
  // (not an error) for unknown IDs. Catch that here so the fan-out in
  // bulk-update-expenses reports a clean "not found" instead of the
  // server's Zod validation dump when NaN values reach updateExpense.
  if (existing == null || existing.splitMode == null) {
    throw new Error(`expense ${patch.expenseId} not found`);
  }

  const splitMode = (patch.splitMode ?? existing.splitMode) as ExpenseSplitMode;
  const participantIds =
    patch.participantIds ?? existing.participants.map((p: any) => p.id);

  let customSplits: { userId: number; amount: number }[] | undefined;
  if (patch.customSplits) {
    customSplits = patch.customSplits;
  } else if (splitMode !== "EQUAL") {
    customSplits = existing.shares.map((s: any) => ({
      userId: s.userId,
      amount: s.amount,
    }));
  }

  const categoryId =
    patch.categoryId !== undefined ? patch.categoryId : existing.categoryId;

  return trpc.expense.updateExpense.mutate({
    expenseId: patch.expenseId,
    chatId,
    creatorId: patch.creatorId ?? Number(existing.creatorId),
    payerId: patch.payerId ?? Number(existing.payerId),
    description: patch.description ?? String(existing.description),
    amount: patch.amount ?? Number(existing.amount),
    date: patch.date ?? existing.date,
    currency: patch.currency ?? existing.currency,
    splitMode,
    participantIds,
    customSplits,
    categoryId,
    sendNotification: opts.sendNotification ?? true,
  });
}

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
          for (const c of result.items.filter(
            (item) => item.kind === "custom"
          )) {
            categoryMap.set(c.id, { emoji: c.emoji, title: c.title });
          }
        } catch {
          // Non-fatal: category labels are best-effort
        }

        let expenses = await trpc.expense.getExpenseByChat.query({
          chatId,
          currency: opts.currency ? String(opts.currency) : undefined,
        });

        // Strict category match. `getExpenseByChat` returns expenses only
        // (no settlements), so there's no reason to let untagged rows
        // pass through. The special value "none" filters to uncategorized
        // expenses, mirroring the TMA's Uncategorized chip.
        if (opts.category) {
          const target = String(opts.category);
          expenses = expenses.filter(
            (e: { categoryId?: string | null }) =>
              (e.categoryId ?? "none") === target
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
      "banana create-expense --amount 12 --description 'Lunch' --payer-id 123 --split-mode EQUAL --participant-ids 123,456 --category base:food",
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
      category: {
        type: "string",
        description:
          "Category id (e.g. base:food or chat:<uuid>). Run list-categories to see options.",
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
          categoryId: opts.category ? String(opts.category) : undefined,
          sendNotification: true,
        });
      });
    },
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
    execute: (opts, trpc) => {
      if (!opts["expense-id"]) {
        return error(
          "missing_option",
          "--expense-id is required",
          "update-expense"
        );
      }

      return run("update-expense", async () => {
        const patch: ExpenseUpdatePatch = {
          expenseId: String(opts["expense-id"]),
        };

        if (opts["payer-id"]) {
          const payerId = Number(opts["payer-id"]);
          if (Number.isNaN(payerId)) {
            throw new Error("--payer-id must be a valid number");
          }
          patch.payerId = payerId;
        }

        if (opts.amount) {
          const amount = Number(opts.amount);
          if (Number.isNaN(amount) || amount <= 0) {
            throw new Error("--amount must be a positive number");
          }
          patch.amount = amount;
        }

        if (opts["creator-id"]) {
          const creatorId = Number(opts["creator-id"]);
          if (Number.isNaN(creatorId)) {
            throw new Error("--creator-id must be a valid number");
          }
          patch.creatorId = creatorId;
        }

        if (opts.description) {
          patch.description = String(opts.description);
        }

        if (opts.currency) {
          patch.currency = String(opts.currency);
        }

        if (opts["split-mode"]) {
          patch.splitMode = String(opts["split-mode"]) as ExpenseSplitMode;
        }

        if (opts["participant-ids"]) {
          const participantIds = String(opts["participant-ids"])
            .split(",")
            .map(Number);
          if (participantIds.some(Number.isNaN)) {
            throw new Error(
              "--participant-ids must be comma-separated numbers"
            );
          }
          patch.participantIds = participantIds;
        }

        if (opts["custom-splits"]) {
          try {
            patch.customSplits = JSON.parse(String(opts["custom-splits"])) as {
              userId: number;
              amount: number;
            }[];
          } catch {
            throw new Error("--custom-splits must be valid JSON array");
          }
        }

        if (opts.date) {
          const date = new Date(String(opts.date));
          if (Number.isNaN(date.getTime())) {
            throw new Error("--date must be a valid ISO 8601 date string");
          }
          patch.date = date;
        }

        if (opts.category !== undefined) {
          const raw = String(opts.category);
          patch.categoryId = raw === "none" ? null : raw;
        }

        const chatId = await resolveChatId(
          trpc,
          opts["chat-id"] as string | undefined
        );

        return applyExpensePartialUpdate(patch, trpc, chatId);
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
        categoryId?: string | null;
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
        const notify = Boolean(opts.notify);

        const bulkResult = await trpc.expense.createExpensesBulk.mutate({
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
            categoryId: row.categoryId,
          })),
        });

        let summary: { sent: boolean; messageId: number | null } | undefined;
        if (notify && bulkResult.succeeded > 0) {
          // Join server response (final amount/currency/categoryId) with
          // the original input row (payerId/splitMode/participantIds) so
          // the summary can render the richer per-row block.
          const items = bulkResult.results
            .filter((r: any) => r.status === "success" && r.expense)
            .map((r: any) => {
              const inputRow = rows[r.index];
              return {
                description: String(
                  r.expense.description ?? r.description ?? ""
                ),
                amount: Number(r.expense.amount),
                currency: String(r.expense.currency),
                categoryId: r.expense.categoryId ?? null,
                payerId: inputRow?.payerId,
                splitMode: inputRow?.splitMode,
                participantCount: inputRow?.participantIds?.length,
              };
            });
          try {
            summary = await trpc.expense.sendBatchExpenseSummary.mutate({
              chatId,
              kind: "created",
              items,
            });
          } catch {
            summary = { sent: false, messageId: null };
          }
        }

        return summary ? { ...bulkResult, summary } : bulkResult;
      });
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

      type UpdateRow = {
        expenseId: string;
        payerId?: number;
        creatorId?: number;
        description?: string;
        amount?: number;
        currency?: string;
        splitMode?: ExpenseSplitMode;
        participantIds?: number[];
        customSplits?: { userId: number; amount: number }[];
        date?: string;
        category?: string | null;
      };

      let rows: UpdateRow[];
      try {
        const raw = readFileSync(String(opts.file), "utf8");
        rows = JSON.parse(raw) as UpdateRow[];
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

      return run("bulk-update-expenses", async () => {
        const chatId = await resolveChatId(
          trpc,
          opts["chat-id"] as string | undefined
        );
        const notify = Boolean(opts.notify);

        // Translate CLI-friendly row shape → server's update schema.
        // `category` (CLI) → `categoryId` (server): omit = leave unchanged,
        // "none"/null = clear, string = set.
        type BulkUpdateInput = Parameters<
          typeof trpc.expense.updateExpensesBulk.mutate
        >[0];
        type BulkUpdateRow = BulkUpdateInput["expenses"][number];
        const expenses: BulkUpdateRow[] = rows.map((row, i) => {
          if (!row || typeof row.expenseId !== "string" || !row.expenseId) {
            throw new Error(`row ${i}: missing expenseId`);
          }
          const out: BulkUpdateRow = { expenseId: row.expenseId };
          if (row.payerId !== undefined) out.payerId = row.payerId;
          if (row.creatorId !== undefined) out.creatorId = row.creatorId;
          if (row.description !== undefined) out.description = row.description;
          if (row.amount !== undefined) out.amount = row.amount;
          if (row.currency !== undefined) out.currency = row.currency;
          if (row.splitMode !== undefined) out.splitMode = row.splitMode;
          if (row.participantIds !== undefined)
            out.participantIds = row.participantIds;
          if (row.customSplits !== undefined)
            out.customSplits = row.customSplits;
          if (row.date !== undefined) {
            const d = new Date(row.date);
            if (Number.isNaN(d.getTime())) {
              throw new Error(`row ${i}: date must be a valid ISO 8601 string`);
            }
            out.date = d;
          }
          if (row.category !== undefined) {
            out.categoryId =
              row.category === null || row.category === "none"
                ? null
                : row.category;
          }
          return out;
        });

        return trpc.expense.updateExpensesBulk.mutate({
          chatId,
          expenses,
          sendNotification: notify,
        });
      });
    },
  },
];
