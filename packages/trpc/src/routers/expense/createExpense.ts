import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, publicProcedure } from "../../trpc.js";
import { SplitMode } from "@dko/database";

export const inputSchema = z.object({
  chatId: z.number().transform((val) => BigInt(val)),
  creatorId: z.number().transform((val) => BigInt(val)),
  description: z.string().min(1, "Description is required").max(60, "Description too long"),
  amount: z.number().positive("Amount must be positive"),
  splitMode: z.nativeEnum(SplitMode),
  participantIds: z.array(z.number().transform((val) => BigInt(val))).min(1, "At least one participant required"),
  customSplits: z.array(z.object({
    userId: z.number().transform((val) => BigInt(val)),
    amount: z.number().positive("Split amount must be positive"),
  })).optional(),
});

export const outputSchema = z.object({
  id: z.string(),
  chatId: z.preprocess((arg) => String(arg), z.string()),
  creatorId: z.preprocess((arg) => String(arg), z.string()),
  description: z.string(),
  amount: z.number(),
  splitMode: z.nativeEnum(SplitMode),
  date: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const calculateSplits = (
  amount: number,
  splitMode: SplitMode,
  participantIds: bigint[],
  customSplits?: { userId: bigint; amount: number }[]
): { userId: bigint; amount: number }[] => {
  switch (splitMode) {
    case SplitMode.EQUAL: {
      const splitAmount = amount / participantIds.length;
      return participantIds.map(userId => ({
        userId,
        amount: splitAmount,
      }));
    }
    
    case SplitMode.EXACT:
    case SplitMode.PERCENTAGE:
    case SplitMode.SHARES: {
      if (!customSplits || customSplits.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Custom splits required for ${splitMode} mode`,
        });
      }
      
      // Validate that all participants have splits defined
      const splitUserIds = new Set(customSplits.map(s => s.userId.toString()));
      const participantUserIds = new Set(participantIds.map(id => id.toString()));
      
      if (splitUserIds.size !== participantUserIds.size || 
          ![...splitUserIds].every(id => participantUserIds.has(id))) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "All participants must have splits defined",
        });
      }
      
      // Validate split totals
      const totalSplitAmount = customSplits.reduce((sum, split) => sum + split.amount, 0);
      const tolerance = 0.01; // Allow for small rounding differences
      
      if (Math.abs(totalSplitAmount - amount) > tolerance) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Split amounts (${totalSplitAmount}) must equal total amount (${amount})`,
        });
      }
      
      return customSplits;
    }
    
    default:
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Unsupported split mode: ${splitMode}`,
      });
  }
};

export const createExpenseHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  try {
    // Calculate the splits for each participant
    const splits = calculateSplits(
      input.amount,
      input.splitMode,
      input.participantIds,
      input.customSplits
    );

    // Create expense and shares in a transaction
    const expense = await db.$transaction(async (tx) => {
      // Create the expense
      const newExpense = await tx.expense.create({
        data: {
          chatId: input.chatId,
          creatorId: input.creatorId,
          description: input.description,
          amount: input.amount,
          splitMode: input.splitMode,
          participants: {
            connect: input.participantIds.map(id => ({ id })),
          },
        },
      });

      // Create expense shares for each participant
      await tx.expenseShare.createMany({
        data: splits.map(split => ({
          expenseId: newExpense.id,
          userId: split.userId,
          amount: split.amount,
        })),
      });

      return newExpense;
    });

    return {
      ...expense,
      chatId: Number(expense.chatId),
      creatorId: Number(expense.creatorId),
      amount: Number(expense.amount),
    };
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error;
    }

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to create expense",
    });
  }
};

export default publicProcedure
  .meta({
    openapi: {
      method: "POST",
      path: "/expense",
      contentTypes: ["application/json"],
      tags: ["expense"],
      summary: "Create a new expense",
      description: "Create an expense with automatic split calculation based on split mode",
    },
  })
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    return createExpenseHandler(input, ctx.db);
  });