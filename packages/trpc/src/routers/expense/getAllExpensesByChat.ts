import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertChatAccess } from "../../middleware/chatScope.js";

const inputSchema = z.object({
  chatId: z.number(),
});

export const getAllExpensesByChatHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  const expenses = await db.expense.findMany({
    where: {
      chatId: input.chatId,
      // No currency filtering - return all expenses regardless of currency
    },
    include: {
      shares: true,
    },
    orderBy: {
      date: "desc",
    },
  });
  return expenses.map((expense) => {
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
    await assertChatAccess(ctx.session, ctx.db, input.chatId);
    return getAllExpensesByChatHandler(input, ctx.db);
  });
