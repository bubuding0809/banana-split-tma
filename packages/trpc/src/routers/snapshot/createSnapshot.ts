import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertChatAccess } from "../../middleware/chatScope.js";
import { Decimal } from "decimal.js";

const inputSchema = z.object({
  chatId: z.number(),
  creatorId: z.number(),
  title: z.string().min(1, "Title is required").max(255, "Title too long"),
  description: z.string().optional(),
  expenseIds: z
    .array(z.string().uuid())
    .min(1, "At least one expense must be selected"),
});

export const createSnapshotHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  console.log("Start createSnapshotHandler");
  // First verify all expenses exist and belong to the chat
  const expenses = await db.expense.findMany({
    where: {
      id: { in: input.expenseIds },
      chatId: input.chatId,
    },
    include: {
      shares: true,
    },
  });

  if (expenses.length !== input.expenseIds.length) {
    throw new Error(
      "Some expenses were not found or don't belong to this chat"
    );
  }

  // No longer need to calculate total amount since we support multicurrency
  // Individual expense amounts are preserved in their original currencies

  // Create the snapshot
  console.log("Creating snapshot");
  const snapshot = await db.expenseSnapshot.create({
    data: {
      chatId: input.chatId,
      creatorId: input.creatorId,
      title: input.title,
      // Remove currency field - snapshots now support multicurrency expenses
      expenses: {
        connect: input.expenseIds.map((id) => ({ id })),
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
    return createSnapshotHandler(input, ctx.db);
  });
