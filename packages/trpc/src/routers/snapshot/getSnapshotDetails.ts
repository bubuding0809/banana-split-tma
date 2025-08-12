import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";

const inputSchema = z.object({
  snapshotId: z.string().uuid(),
});

export const getSnapshotDetailsHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  const snapshot = await db.expenseSnapshot.findUnique({
    where: {
      id: input.snapshotId,
    },
    include: {
      creator: true,
      chat: true,
      expenses: {
        include: {
          payer: true,
          creator: true,
          shares: {
            include: {
              user: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      },
    },
  });

  if (!snapshot) {
    throw new Error("Snapshot not found");
  }

  return {
    ...snapshot,
    chatId: Number(snapshot.chatId),
    creatorId: Number(snapshot.creatorId),
    totalAmount: Number(snapshot.totalAmount),
    creator: {
      ...snapshot.creator,
      id: Number(snapshot.creator.id),
    },
    chat: {
      ...snapshot.chat,
      id: Number(snapshot.chat.id),
    },
    expenses: snapshot.expenses.map((expense) => ({
      ...expense,
      chatId: Number(expense.chatId),
      creatorId: Number(expense.creatorId),
      payerId: Number(expense.payerId),
      amount: Number(expense.amount),
      payer: {
        ...expense.payer,
        id: Number(expense.payer.id),
      },
      creator: {
        ...expense.creator,
        id: Number(expense.creator.id),
      },
      shares: expense.shares.map((share) => ({
        ...share,
        userId: Number(share.userId),
        amount: share.amount ? Number(share.amount) : null,
        user: {
          ...share.user,
          id: Number(share.user.id),
        },
      })),
    })),
  };
};

export default protectedProcedure
  .input(inputSchema)
  .query(async ({ input, ctx }) => {
    return getSnapshotDetailsHandler(input, ctx.db);
  });
