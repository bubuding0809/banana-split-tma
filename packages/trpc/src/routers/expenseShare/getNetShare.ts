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
        payerId: input.mainUserId,
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
        payerId: input.targetUserId,
      },
      userId: input.mainUserId,
    },
    select: {
      amount: true,
    },
  });

  //* Find out how much the main user has settled with the target user
  // (Settlements where main user paid the target user - reduces main user's debt)
  const settlementsMainToTarget = await db.settlement.findMany({
    where: {
      chatId: input.chatId,
      senderId: input.mainUserId,
      receiverId: input.targetUserId,
    },
    select: {
      amount: true,
    },
  });

  //* Find out how much the target user has settled with the main user
  // (Settlements where target user paid the main user - increases main user's debt)
  const settlementsTargetToMain = await db.settlement.findMany({
    where: {
      chatId: input.chatId,
      senderId: input.targetUserId,
      receiverId: input.mainUserId,
    },
    select: {
      amount: true,
    },
  });

  //* Calculate the net amount between the two users
  // Positive = target user owes main user, Negative = main user owes target user
  const netAmount =
    toReceive.reduce((acc, share) => acc + Number(share.amount ?? 0), 0) -
    toPay.reduce((acc, share) => acc + Number(share.amount ?? 0), 0) +
    settlementsMainToTarget.reduce(
      (acc, settlement) => acc + Number(settlement.amount ?? 0),
      0
    ) -
    settlementsTargetToMain.reduce(
      (acc, settlement) => acc + Number(settlement.amount ?? 0),
      0
    );

  return netAmount;
};

export default publicProcedure
  .input(inputSchema)
  .query(async ({ input, ctx }) => {
    return getNetShareHandler(input, ctx.db);
  });
