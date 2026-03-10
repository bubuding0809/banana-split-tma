import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertChatScope } from "../../middleware/chatScope.js";
import { toNumber, sumAmounts } from "../../utils/financial.js";

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

  // Use sumAmounts utility for precise Decimal arithmetic
  const amounts = borrowed.map((share) => share.amount);
  return toNumber(sumAmounts(amounts));
};

export default protectedProcedure
  .input(inputSchema)
  .query(async ({ input, ctx }) => {
    assertChatScope(ctx.session, input.chatId);
    return getTotalBorrowedHandler(input, ctx.db);
  });
