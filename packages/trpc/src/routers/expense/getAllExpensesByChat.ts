import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";

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
  return expenses.map((expense) => ({
    ...expense,
    creatorId: Number(expense.creatorId),
    payerId: Number(expense.payerId),
    chatId: Number(expense.chatId),
    amount: Number(expense.amount),
    shares: expense.shares.map((share) => ({
      ...share,
      userId: Number(share.userId),
      amount: Number(share.amount),
    })),
  }));
};

export default protectedProcedure
  .input(inputSchema)
  .query(async ({ input, ctx }) => {
    return getAllExpensesByChatHandler(input, ctx.db);
  });
