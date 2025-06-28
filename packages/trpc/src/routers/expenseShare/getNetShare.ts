import { z } from "zod";
import { Db, publicProcedure } from "../../trpc.js";

const inputSchema = z.object({
  mainUserId: z.number(),
  targetUserId: z.number(),
  chatId: z.number(),
});

export const getNetShareHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  //* Find out how much the target user owes the main user
  // (Expenses where main user paid, but target user has a share)
  const toReceive = await db.expenseShare.findMany({
    where: {
      expense: {
        chatId: input.chatId,
        payerId: input.mainUserId, // FIXED: Use payerId to find expenses main user paid for
      },
      userId: input.targetUserId,
    },
    select: {
      amount: true,
    },
  });

  //* Find out how much the target user lent to the main user
  // (Expenses where target user paid, but main user has a share)
  const toPay = await db.expenseShare.findMany({
    where: {
      expense: {
        chatId: input.chatId,
        payerId: input.targetUserId, // FIXED: Use payerId to find expenses target user paid for
      },
      userId: input.mainUserId,
    },
    select: {
      amount: true,
    },
  });

  //* Calculate the net amount between the two users
  const netAmount =
    toReceive.reduce((acc, share) => acc + Number(share.amount ?? 0), 0) -
    toPay.reduce((acc, share) => acc + Number(share.amount ?? 0), 0);

  return netAmount;
};

export default publicProcedure
  .input(inputSchema)
  .query(async ({ input, ctx }) => {
    return getNetShareHandler(input, ctx.db);
  });
