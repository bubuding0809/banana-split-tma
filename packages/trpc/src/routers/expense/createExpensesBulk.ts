import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertChatAccess } from "../../middleware/chatScope.js";
import { SplitMode } from "@dko/database";
import { validateCurrency } from "../../utils/currencyApi.js";
import { assertUsersInChat } from "../../utils/chatValidation.js";
import {
  createExpenseHandler,
  outputSchema as expenseOutputSchema,
} from "./createExpense.js";
import { Telegram } from "telegraf";

const singleExpenseSchema = z.object({
  payerId: z.number().transform((val) => BigInt(val)),
  creatorId: z
    .number()
    .transform((val) => BigInt(val))
    .optional(),
  description: z
    .string()
    .min(1, "Description is required")
    .max(60, "Description too long"),
  amount: z.number().positive("Amount must be positive"),
  date: z
    .date()
    .optional()
    .refine(
      (date) => !date || date <= new Date(),
      "Expense date cannot be in the future"
    ),
  currency: z
    .string()
    .optional()
    .refine((val) => !val || validateCurrency(val), "Invalid currency code"),
  splitMode: z.nativeEnum(SplitMode),
  participantIds: z
    .array(z.number().transform((val) => BigInt(val)))
    .min(1, "At least one participant required"),
  customSplits: z
    .array(
      z.object({
        userId: z.number().transform((val) => BigInt(val)),
        amount: z.number().positive("Split amount must be positive"),
      })
    )
    .optional(),
  // Optional at import time. Validation happens inside
  // createExpenseHandler per row (base: against BASE_CATEGORIES,
  // chat: against chatCategory).
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
  chatId: z.number().transform((val) => BigInt(val)),
  expenses: z
    .array(singleExpenseSchema)
    .min(1, "At least one expense required"),
});

const itemResultSchema = z.discriminatedUnion("status", [
  z.object({
    index: z.number(),
    status: z.literal("success"),
    description: z.string(),
    expense: expenseOutputSchema,
  }),
  z.object({
    index: z.number(),
    status: z.literal("error"),
    description: z.string(),
    error: z.string(),
  }),
]);

export const outputSchema = z.object({
  total: z.number(),
  succeeded: z.number(),
  failed: z.number(),
  results: z.array(itemResultSchema),
});

export const createExpensesBulkHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db,
  teleBot: Telegram
) => {
  const allUserIds = new Set<bigint>();
  for (const expense of input.expenses) {
    allUserIds.add(expense.payerId);
    if (expense.creatorId) allUserIds.add(expense.creatorId);
    expense.participantIds.forEach((id) => allUserIds.add(id));
    expense.customSplits?.forEach((split) => allUserIds.add(split.userId));
  }
  await assertUsersInChat(db, input.chatId, Array.from(allUserIds));

  // Fetch chat once — validates existence and provides baseCurrency for all expenses
  const chat = await db.chat.findUnique({
    where: { id: input.chatId },
    select: { baseCurrency: true },
  });

  if (!chat) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Chat not found",
    });
  }

  const baseCurrency = chat.baseCurrency;

  // Process all expenses in parallel
  const settledResults = await Promise.allSettled(
    input.expenses.map((expense) =>
      createExpenseHandler(
        {
          chatId: input.chatId,
          payerId: expense.payerId,
          creatorId: expense.creatorId ?? expense.payerId,
          description: expense.description,
          amount: expense.amount,
          date: expense.date,
          // Pre-fill currency from chat so createExpenseHandler skips its own DB lookup
          currency: expense.currency ?? baseCurrency,
          splitMode: expense.splitMode,
          participantIds: expense.participantIds,
          customSplits: expense.customSplits,
          categoryId: expense.categoryId,
          sendNotification: false,
        },
        db,
        teleBot
      )
    )
  );

  const results = settledResults.map((result, index) => {
    const expense = input.expenses[index]!;
    if (result.status === "fulfilled") {
      return {
        index,
        status: "success" as const,
        description: expense.description,
        expense: result.value,
      };
    }
    return {
      index,
      status: "error" as const,
      description: expense.description,
      error:
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason),
    };
  });

  const succeeded = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "error").length;

  return { total: input.expenses.length, succeeded, failed, results };
};

export default protectedProcedure
  .meta({
    openapi: {
      method: "POST",
      path: "/expense/bulk",
      contentTypes: ["application/json"],
      tags: ["expense"],
      summary: "Bulk create expenses",
      description:
        "Create multiple expenses in a single request. Expenses are processed in parallel and the chat's base currency is fetched only once. Returns per-item success/error results.",
    },
  })
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    await assertChatAccess(ctx.session, ctx.db, input.chatId);
    return createExpensesBulkHandler(input, ctx.db, ctx.teleBot);
  });
