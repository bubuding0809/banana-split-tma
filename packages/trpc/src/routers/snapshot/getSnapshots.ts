import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";

const inputSchema = z.object({
  chatId: z.number(),
});

export const getSnapshotsHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  const snapshots = await db.expenseSnapshot.findMany({
    where: {
      chatId: input.chatId,
      // Remove currency filtering - show all snapshots regardless of currency
    },
    include: {
      creator: true,
      expenses: {
        select: {
          id: true,
          amount: true,
          currency: true,
          description: true,
          createdAt: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return snapshots.map((snapshot) => ({
    ...snapshot,
    chatId: Number(snapshot.chatId),
    creatorId: Number(snapshot.creatorId),
    creator: {
      ...snapshot.creator,
      id: Number(snapshot.creator.id),
    },
    expenses: snapshot.expenses.map((expense) => ({
      ...expense,
      amount: Number(expense.amount),
    })),
  }));
};

export default protectedProcedure
  .input(inputSchema)
  .query(async ({ input, ctx }) => {
    return getSnapshotsHandler(input, ctx.db);
  });
