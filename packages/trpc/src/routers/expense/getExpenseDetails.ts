import { z } from "zod";
import { Db, publicProcedure } from "../../trpc.js";
import { Prisma } from "@dko/database";

const inputSchema = z.object({
  expenseId: z.string(),
});

const getExpenseDetailsHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  const expense = await db.expense.findUnique({
    where: {
      id: input.expenseId,
    },
    include: {
      participants: true,
      creator: true,
      shares: true,
      chat: true,
    },
  });

  return {
    ...expense,
    amount: Number(expense?.amount),
    participants:
      expense?.participants.map((p) => ({
        ...p,
        id: Number(p.id),
      })) ?? [],
    shares:
      expense?.shares.map((s) => ({
        ...s,
        userId: Number(s.userId),
        amount: Number(s.amount),
      })) ?? [],
  };
};

export default publicProcedure
  .input(inputSchema)
  .query(async ({ input, ctx }) => {
    return getExpenseDetailsHandler(input, ctx.db);
  });
