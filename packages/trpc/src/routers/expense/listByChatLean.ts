import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertChatAccess } from "../../middleware/chatScope.js";
import type { Logger } from "@repo/logger";

// Lean expense list for callers that only need core display fields.
// Skips the `include: { shares, recurringTemplate }` join used by
// getAllExpensesByChat — saves 2-3 DB roundtrips. Also accepts an
// optional date range so the period filter pushes down to the DB
// instead of running in-memory in the caller.
//
// Used by the bot's /list handler (private chat). The TMA continues
// to use getAllExpensesByChat because it needs shares + recurring
// status for the split UI.

const inputSchema = z.object({
  chatId: z.number(),
  startDt: z.coerce.date().optional(),
  endDt: z.coerce.date().optional(),
});

export const listByChatLeanHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db,
  log?: Logger
) => {
  const dbStart = Date.now();
  const expenses = await db.expense.findMany({
    where: {
      chatId: input.chatId,
      ...(input.startDt || input.endDt
        ? {
            date: {
              ...(input.startDt ? { gte: input.startDt } : {}),
              ...(input.endDt ? { lt: input.endDt } : {}),
            },
          }
        : {}),
    },
    select: {
      id: true,
      description: true,
      amount: true,
      currency: true,
      date: true,
      categoryId: true,
    },
    orderBy: {
      date: "desc",
    },
  });
  log?.info(
    {
      procedure_internal: "expense.listByChatLean",
      step: "findMany",
      duration_ms: Date.now() - dbStart,
      row_count: expenses.length,
      chat_id: input.chatId,
      filtered: Boolean(input.startDt || input.endDt),
    },
    "trpc.internal.timing"
  );

  return expenses.map((expense) => ({
    ...expense,
    amount: Number(expense.amount),
    categoryId: expense.categoryId ?? null,
  }));
};

export default protectedProcedure
  .meta({
    openapi: {
      method: "GET",
      path: "/chat/{chatId}/expenses/lean",
      tags: ["expense"],
      summary:
        "Get a lean expense list (no shares, no recurring) by chat with optional date range",
    },
  })
  .input(inputSchema)
  .output(z.any())
  .query(async ({ input, ctx }) => {
    await assertChatAccess(ctx.session, ctx.db, input.chatId);
    return listByChatLeanHandler(input, ctx.db, ctx.log);
  });
