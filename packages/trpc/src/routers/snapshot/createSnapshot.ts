import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";
import { Decimal } from "decimal.js";

const inputSchema = z.object({
  chatId: z.number(),
  title: z.string().min(1, "Title is required").max(255, "Title too long"),
  description: z.string().optional(),
  expenseIds: z
    .array(z.string().uuid())
    .min(1, "At least one expense must be selected"),
  currency: z
    .string()
    .min(3)
    .max(3, { message: "Currency code must be 3 characters long" })
    .default("SGD"),
});

export const createSnapshotHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db,
  userId: number
) => {
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

  // Calculate total amount across all expenses in the specified currency
  // For now, we'll assume same currency - proper currency conversion can be added later
  let totalAmount = new Decimal(0);

  for (const expense of expenses) {
    // Convert to target currency if needed (simplified for now)
    if (expense.currency === input.currency) {
      totalAmount = totalAmount.plus(expense.amount.toString());
    } else {
      // For now, just use the expense amount as-is
      // TODO: Implement proper currency conversion using CurrencyRate model
      totalAmount = totalAmount.plus(expense.amount.toString());
    }
  }

  // Create the snapshot
  const snapshot = await db.expenseSnapshot.create({
    data: {
      chatId: input.chatId,
      creatorId: userId,
      title: input.title,
      description: input.description,
      totalAmount: totalAmount.toDecimalPlaces(2),
      currency: input.currency,
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
    totalAmount: Number(snapshot.totalAmount),
    creator: {
      ...snapshot.creator,
      id: Number(snapshot.creator.id),
    },
    expenses: snapshot.expenses.map((expense: any) => ({
      ...expense,
      chatId: Number(expense.chatId),
      creatorId: Number(expense.creatorId),
      payerId: Number(expense.payerId),
      amount: Number(expense.amount),
      payer: {
        ...expense.payer,
        id: Number(expense.payer.id),
      },
      shares: expense.shares.map((share: any) => ({
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
    return createSnapshotHandler(input, ctx.db, Number(ctx.session.user!.id));
  });
