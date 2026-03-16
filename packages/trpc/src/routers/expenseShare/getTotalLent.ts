import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertChatAccess } from "../../middleware/chatScope.js";
import { toNumber, sumAmounts } from "../../utils/financial.js";

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

  // Use sumAmounts utility for precise Decimal arithmetic
  const amounts = lent.map((share) => share.amount);
  return toNumber(sumAmounts(amounts));
};

export default protectedProcedure
  .input(inputSchema)
  .query(async ({ input, ctx }) => {
    await assertChatAccess(ctx.session, ctx.db, input.chatId);
    return getTotalLent(input, ctx.db);
  });
