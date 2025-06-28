import { z } from "zod";
import { Db, publicProcedure } from "../../trpc.js";

const inputSchema = z.object({
  userId: z.number(),
  chatId: z.number(),
});

const getTotalLent = async (input: z.infer<typeof inputSchema>, db: Db) => {
  const lent = await db.expenseShare.findMany({
    where: {
      expense: {
        chatId: input.chatId,
        payerId: input.userId, // FIXED: Use payerId to find expenses this user paid for
      },
    },
    select: {
      amount: true,
    },
  });

  return lent.reduce((acc, share) => acc + Number(share.amount ?? 0), 0);
};

export default publicProcedure
  .input(inputSchema)
  .query(async ({ input, ctx }) => {
    return getTotalLent(input, ctx.db);
  });
