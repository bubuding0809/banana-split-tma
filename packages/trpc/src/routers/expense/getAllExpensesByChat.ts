import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertChatAccess } from "../../middleware/chatScope.js";
import type { Logger } from "@repo/logger";

const inputSchema = z.object({
  chatId: z.number(),
});

export const getAllExpensesByChatHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db,
  log?: Logger
) => {
  const dbStart = Date.now();
  const expenses = await db.expense.findMany({
    where: {
      chatId: input.chatId,
      // No currency filtering - return all expenses regardless of currency
    },
    include: {
      shares: true,
      recurringTemplate: { select: { status: true } },
    },
    orderBy: {
      date: "desc",
    },
  });
  const dbEnd = Date.now();
  log?.info(
    {
      procedure_internal: "expense.getAllExpensesByChat",
      step: "findMany",
      duration_ms: dbEnd - dbStart,
      row_count: expenses.length,
      chat_id: input.chatId,
    },
    "trpc.internal.timing"
  );

  const transformStart = Date.now();
  const result = expenses.map((expense) => {
    // Drop Prisma-level BigInt fields the client doesn't consume —
    // superjson preserves bigint all the way through, and React 19's
    // component-render tracing crashes on any bigint it walks in props.
    const { telegramMessageId, telegramUpdateBumpMessageIds, ...rest } =
      expense;
    void telegramMessageId;
    void telegramUpdateBumpMessageIds;
    return {
      ...rest,
      creatorId: Number(expense.creatorId),
      payerId: Number(expense.payerId),
      chatId: Number(expense.chatId),
      amount: Number(expense.amount),
      categoryId: expense.categoryId ?? null,
      shares: expense.shares.map((share) => ({
        ...share,
        userId: Number(share.userId),
        amount: Number(share.amount),
      })),
    };
  });
  log?.info(
    {
      procedure_internal: "expense.getAllExpensesByChat",
      step: "transform",
      duration_ms: Date.now() - transformStart,
      row_count: result.length,
    },
    "trpc.internal.timing"
  );
  return result;
};

export default protectedProcedure
  .meta({
    openapi: {
      method: "GET",
      path: "/chat/{chatId}/expenses",
      tags: ["expense"],
      summary: "Get all expenses by chat",
    },
  })
  .input(inputSchema)
  .output(z.any())
  .query(async ({ input, ctx }) => {
    const accessStart = Date.now();
    await assertChatAccess(ctx.session, ctx.db, input.chatId);
    ctx.log.info(
      {
        procedure_internal: "expense.getAllExpensesByChat",
        step: "access_check",
        duration_ms: Date.now() - accessStart,
        auth_type: ctx.session.authType,
      },
      "trpc.internal.timing"
    );
    return getAllExpensesByChatHandler(input, ctx.db, ctx.log);
  });
