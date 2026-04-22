import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Telegram } from "telegraf";
import { SplitMode } from "@dko/database";
import { BASE_CATEGORIES } from "@repo/categories";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertChatAccess } from "../../middleware/chatScope.js";
import { assertUsersInChat } from "../../utils/chatValidation.js";
import { validateCurrency } from "../../utils/currencyApi.js";
import {
  updateExpenseHandler,
  outputSchema as expenseOutputSchema,
} from "./updateExpense.js";
import { sendBatchExpenseSummaryHandler } from "./sendBatchExpenseSummary.js";

const singleUpdateSchema = z.object({
  expenseId: z.string().min(1, "Expense ID is required"),
  payerId: z
    .number()
    .transform((v) => BigInt(v))
    .optional(),
  creatorId: z
    .number()
    .transform((v) => BigInt(v))
    .optional(),
  description: z
    .string()
    .min(1, "Description is required")
    .max(60, "Description too long")
    .optional(),
  amount: z.number().positive("Amount must be positive").optional(),
  date: z
    .date()
    .optional()
    .refine(
      (d) => !d || d <= new Date(),
      "Expense date cannot be in the future"
    ),
  currency: z
    .string()
    .optional()
    .refine((val) => !val || validateCurrency(val), "Invalid currency code"),
  splitMode: z.nativeEnum(SplitMode).optional(),
  participantIds: z.array(z.number().transform((v) => BigInt(v))).optional(),
  customSplits: z
    .array(
      z.object({
        userId: z.number().transform((v) => BigInt(v)),
        amount: z.number().positive("Split amount must be positive"),
      })
    )
    .optional(),
  // Tri-state: field absent ⇒ leave unchanged; null ⇒ clear; string ⇒ set.
  categoryId: z
    .string()
    .trim()
    .refine(
      (v) => v.startsWith("base:") || v.startsWith("chat:"),
      "categoryId must start with 'base:' or 'chat:'"
    )
    .nullable()
    .optional(),
});

export const inputSchema = z.object({
  chatId: z.number().transform((v) => BigInt(v)),
  expenses: z.array(singleUpdateSchema).min(1, "At least one expense required"),
  sendNotification: z.boolean().default(false),
  threadId: z.number().optional(),
});

const itemResultSchema = z.discriminatedUnion("status", [
  z.object({
    index: z.number(),
    status: z.literal("success"),
    expenseId: z.string(),
    expense: expenseOutputSchema,
  }),
  z.object({
    index: z.number(),
    status: z.literal("error"),
    expenseId: z.string(),
    error: z.string(),
  }),
]);

export const outputSchema = z.object({
  total: z.number(),
  succeeded: z.number(),
  failed: z.number(),
  results: z.array(itemResultSchema),
  summary: z
    .object({
      sent: z.boolean(),
      messageId: z.number().nullable(),
    })
    .optional(),
});

export const updateExpensesBulkHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db,
  teleBot: Telegram,
  actorName?: string
) => {
  // 1. Fetch all affected expenses in one round-trip. Each row needs
  //    its existing state for the partial-update merge; a per-row
  //    findUnique would be N extra round-trips.
  const expenseIds = input.expenses.map((e) => e.expenseId);
  const existingExpenses = await db.expense.findMany({
    where: { id: { in: expenseIds } },
    include: {
      participants: { select: { id: true } },
      shares: { select: { userId: true, amount: true } },
    },
  });
  const existingById = new Map(existingExpenses.map((e) => [e.id, e]));

  // 2. Fetch chat once (the summary needs threadId even if no rows touch it).
  const chat = await db.chat.findUnique({
    where: { id: input.chatId },
    select: { id: true, baseCurrency: true, threadId: true },
  });
  if (!chat) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Chat not found" });
  }

  // 3. Dedupe user IDs across all rows AND existing expenses so the
  //    per-row handler's inline membership check finds every user it
  //    will touch in one batched query instead of N.
  const allUserIds = new Set<bigint>();
  for (const row of input.expenses) {
    if (row.payerId !== undefined) allUserIds.add(row.payerId);
    if (row.creatorId !== undefined) allUserIds.add(row.creatorId);
    row.participantIds?.forEach((id) => allUserIds.add(id));
    row.customSplits?.forEach((s) => allUserIds.add(s.userId));
  }
  for (const e of existingExpenses) {
    allUserIds.add(e.payerId);
    allUserIds.add(e.creatorId);
    e.participants.forEach((p) => allUserIds.add(p.id));
  }
  if (allUserIds.size > 0) {
    await assertUsersInChat(db, input.chatId, Array.from(allUserIds));
  }

  // 4. Validate referenced chat:<uuid> categories once. Base categories
  //    are validated inside updateExpenseHandler against the in-memory
  //    BASE_CATEGORIES list, so we only need a DB round-trip for custom
  //    chat categories.
  const chatCategoryUuids = new Set<string>();
  for (const row of input.expenses) {
    if (row.categoryId?.startsWith("chat:")) {
      chatCategoryUuids.add(row.categoryId.slice("chat:".length));
    }
  }
  if (chatCategoryUuids.size > 0) {
    const valid = await db.chatCategory.findMany({
      where: {
        chatId: input.chatId,
        id: { in: Array.from(chatCategoryUuids) },
      },
      select: { id: true },
    });
    const validIds = new Set(valid.map((v) => v.id));
    for (const uuid of chatCategoryUuids) {
      if (!validIds.has(uuid)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unknown chat category: chat:${uuid}`,
        });
      }
    }
  }

  // 5. Fan out in parallel. Each row merges the partial patch against
  //    the pre-fetched existing expense, then delegates to
  //    updateExpenseHandler which owns its own per-row $transaction
  //    (same atomicity boundary as singular update-expense). Per-row
  //    notifications are suppressed so we can emit one summary below.
  const settled = await Promise.allSettled(
    input.expenses.map(async (row) => {
      const existing = existingById.get(row.expenseId);
      if (!existing) {
        throw new Error(`expense ${row.expenseId} not found`);
      }
      if (existing.chatId !== input.chatId) {
        throw new Error(
          `expense ${row.expenseId} is not in the specified chat`
        );
      }

      const splitMode = row.splitMode ?? existing.splitMode;
      const participantIds =
        row.participantIds ?? existing.participants.map((p) => p.id);
      const amount = row.amount ?? Number(existing.amount);

      let customSplits: { userId: bigint; amount: number }[] | undefined;
      if (row.customSplits) {
        customSplits = row.customSplits;
      } else if (splitMode !== SplitMode.EQUAL) {
        customSplits = existing.shares.map((s) => ({
          userId: s.userId,
          amount: Number(s.amount),
        }));
      }

      const categoryId =
        row.categoryId !== undefined ? row.categoryId : existing.categoryId;

      return updateExpenseHandler(
        {
          expenseId: row.expenseId,
          chatId: input.chatId,
          creatorId: row.creatorId ?? existing.creatorId,
          payerId: row.payerId ?? existing.payerId,
          description: row.description ?? existing.description,
          amount,
          date: row.date ?? existing.date,
          currency: row.currency ?? existing.currency,
          splitMode,
          participantIds,
          customSplits,
          categoryId,
          sendNotification: false,
          threadId: undefined,
        },
        db,
        teleBot
      );
    })
  );

  const results = settled.map((r, index) => {
    const row = input.expenses[index]!;
    if (r.status === "fulfilled") {
      return {
        index,
        status: "success" as const,
        expenseId: row.expenseId,
        expense: r.value,
      };
    }
    return {
      index,
      status: "error" as const,
      expenseId: row.expenseId,
      error: r.reason instanceof Error ? r.reason.message : String(r.reason),
    };
  });

  const succeeded = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "error").length;

  // 6. If the caller asked for it and at least one row landed, fire a
  //    single consolidated Telegram summary. Failures here are
  //    non-fatal — the batch has already committed row by row.
  let summary: { sent: boolean; messageId: number | null } | undefined;
  if (input.sendNotification && succeeded > 0) {
    // The updateExpense output schema doesn't include participants, so
    // reconstruct per-row counts from the request (participantIds override)
    // with a fallback to the pre-fetched existing expense.
    const items = results
      .filter(
        (r): r is typeof r & { status: "success" } => r.status === "success"
      )
      .map((r) => {
        const inputRow = input.expenses[r.index];
        const existing = existingById.get(r.expenseId);
        const participantCount =
          inputRow?.participantIds?.length ??
          existing?.participants.length ??
          undefined;

        // Diff pre- vs post-update state so the summary can mark each
        // changed branch with ✏️. We compare the *input patch* against
        // the existing row rather than the serialised updateExpense
        // output so string/number/bigint round-tripping doesn't trigger
        // false positives (e.g. BigInt(123n) === 123 on a stringifier).
        const changedFields: (
          | "description"
          | "amount"
          | "payer"
          | "category"
          | "split"
        )[] = [];
        if (existing && inputRow) {
          if (
            inputRow.description !== undefined &&
            inputRow.description !== existing.description
          ) {
            changedFields.push("description");
          }
          if (
            inputRow.amount !== undefined &&
            inputRow.amount !== Number(existing.amount)
          ) {
            changedFields.push("amount");
          }
          if (
            inputRow.payerId !== undefined &&
            inputRow.payerId !== existing.payerId
          ) {
            changedFields.push("payer");
          }
          if (
            inputRow.categoryId !== undefined &&
            inputRow.categoryId !== existing.categoryId
          ) {
            changedFields.push("category");
          }
          const splitModeChanged =
            inputRow.splitMode !== undefined &&
            inputRow.splitMode !== existing.splitMode;
          let participantsChanged = false;
          if (inputRow.participantIds !== undefined) {
            const before = new Set(
              existing.participants.map((p) => p.id.toString())
            );
            const after = new Set(
              inputRow.participantIds.map((id) => id.toString())
            );
            participantsChanged =
              before.size !== after.size ||
              [...before].some((id) => !after.has(id));
          }
          if (splitModeChanged || participantsChanged) {
            changedFields.push("split");
          }
        }

        return {
          description: r.expense.description,
          amount: Number(r.expense.amount),
          currency: r.expense.currency,
          categoryId: r.expense.categoryId ?? null,
          // updateExpense output serialises payerId to a string; the
          // summary handler expects the post-transform bigint.
          payerId: BigInt(r.expense.payerId),
          splitMode: r.expense.splitMode,
          participantCount,
          changedFields: changedFields.length > 0 ? changedFields : undefined,
        };
      });

    summary = await sendBatchExpenseSummaryHandler(
      {
        chatId: input.chatId,
        kind: "updated",
        items,
        actorName,
        threadId:
          input.threadId ??
          (chat.threadId != null ? Number(chat.threadId) : undefined),
      },
      db,
      teleBot
    );
  }

  return {
    total: input.expenses.length,
    succeeded,
    failed,
    results,
    ...(summary ? { summary } : {}),
  };
};

export default protectedProcedure
  .meta({
    openapi: {
      method: "POST",
      path: "/expense/bulk-update",
      contentTypes: ["application/json"],
      tags: ["expense"],
      summary: "Bulk partial-update expenses",
      description:
        "Update multiple expenses in a single request. Each row is a partial patch keyed by `expenseId`; omitted fields keep their current values. Rows are processed in parallel (same atomicity boundary as singular update-expense: one transaction per row). Returns per-item success/error results. When `sendNotification: true`, emits a single consolidated Telegram summary after the batch.",
    },
  })
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    await assertChatAccess(ctx.session, ctx.db, input.chatId);
    const actorName = ctx.session?.user?.first_name ?? undefined;
    return updateExpensesBulkHandler(input, ctx.db, ctx.teleBot, actorName);
  });
