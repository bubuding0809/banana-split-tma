import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertChatAccess } from "../../middleware/chatScope.js";

const inputSchema = z.object({
  chatId: z.number(),
  currency: z
    .string()
    .min(3)
    .max(3, { message: "Currency code must be 3 characters long" })
    .optional(),
});

export const getExpenseByChatHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  const expenses = await db.expense.findMany({
    where: {
      chatId: input.chatId,
      ...(input.currency ? { currency: input.currency } : {}),
    },
    include: {
      shares: true,
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
  .input(inputSchema)
  .query(async ({ input, ctx }) => {
    await assertChatAccess(ctx.session, ctx.db, input.chatId);
    return getExpenseByChatHandler(input, ctx.db);
  });
