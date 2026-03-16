import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertChatAccess } from "../../middleware/chatScope.js";

const inputSchema = z.object({
  snapshotId: z.string().uuid(),
  chatId: z.number(),
  title: z.string().min(1, "Title is required").max(255, "Title too long"),
  expenseIds: z
    .array(z.string().uuid())
    .min(1, "At least one expense must be selected"),
});

export const updateSnapshotHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  // First verify snapshot exists and belongs to the chat
  const existingSnapshot = await db.expenseSnapshot.findUnique({
    where: {
      id: input.snapshotId,
    },
    select: {
      id: true,
      chatId: true,
    },
  });

  if (!existingSnapshot) {
    throw new Error("Snapshot not found");
  }

  if (existingSnapshot.chatId !== BigInt(input.chatId)) {
    throw new Error("Snapshot does not belong to this chat");
  }

  // Verify all expenses exist and belong to the chat
  const expenses = await db.expense.findMany({
    where: {
      id: { in: input.expenseIds },
      chatId: input.chatId,
    },
  });

  if (expenses.length !== input.expenseIds.length) {
    throw new Error(
      "Some expenses were not found or don't belong to this chat"
    );
  }

  // Update the snapshot
  const snapshot = await db.expenseSnapshot.update({
    where: {
      id: input.snapshotId,
    },
    data: {
      title: input.title,
      expenses: {
        set: input.expenseIds.map((id) => ({ id })),
      },
    },
    include: {
      expenses: {
        include: {
          shares: true,
          payer: true,
        },
      },
      creator: true,
    },
  });

  return {
    ...snapshot,
    chatId: Number(snapshot.chatId),
    creatorId: Number(snapshot.creatorId),
    creator: {
      ...snapshot.creator,
      id: Number(snapshot.creator.id),
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
      shares: expense.shares.map((share) => ({
        ...share,
        userId: Number(share.userId),
        amount: share.amount ? Number(share.amount) : null,
      })),
    })),
  };
};

export default protectedProcedure
  .input(inputSchema)
  .mutation(async ({ input, ctx }) => {
    await assertChatAccess(ctx.session, ctx.db, input.chatId);
    return updateSnapshotHandler(input, ctx.db);
  });
