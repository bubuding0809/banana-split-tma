import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";

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
    return getExpenseByChatHandler(input, ctx.db);
  });
