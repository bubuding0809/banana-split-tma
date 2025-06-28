import { z } from "zod";
import { Db, publicProcedure } from "../../trpc.js";

const inputSchema = z.object({
  userId: z.number(),
  chatId: z.number(),
});

const getTotalBorrowedHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  const borrowed = await db.expenseShare.findMany({
    where: {
      userId: input.userId,
      expense: {
        chatId: input.chatId,
        NOT: {
          payerId: input.userId, // FIXED: Use payerId to exclude expenses this user paid for
        },
      },
    },
    select: {
      amount: true,
    },
  });

  return borrowed.reduce((acc, share) => acc + Number(share.amount ?? 0), 0);
};

export default publicProcedure
  .input(inputSchema)
  .query(async ({ input, ctx }) => {
    return getTotalBorrowedHandler(input, ctx.db);
  });
