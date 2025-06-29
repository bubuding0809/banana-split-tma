import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, publicProcedure } from "../../trpc.js";
import { SplitMode } from "@dko/database";

export const inputSchema = z.object({
  chatId: z.number().transform((val) => BigInt(val)),
  creatorId: z.number().transform((val) => BigInt(val)),
  payerId: z.number().transform((val) => BigInt(val)),
  description: z
    .string()
    .min(1, "Description is required")
    .max(60, "Description too long"),
  amount: z.number().positive("Amount must be positive"),
  splitMode: z.nativeEnum(SplitMode),
  participantIds: z
    .array(z.number().transform((val) => BigInt(val)))
    .min(1, "At least one participant required"),
  customSplits: z
    .array(
      z.object({
        userId: z.number().transform((val) => BigInt(val)),
        amount: z.number().positive("Split amount must be positive"),
      })
    )
    .optional(),
});

export const outputSchema = z.object({
  id: z.string(),
  chatId: z.preprocess((arg) => String(arg), z.string()),
  creatorId: z.preprocess((arg) => String(arg), z.string()),
  payerId: z.preprocess((arg) => String(arg), z.string()),
  description: z.string(),
  amount: z.number(),
  splitMode: z.nativeEnum(SplitMode),
  date: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Common validation functions
const validateCustomSplitsExist = (
  customSplits: { userId: bigint; amount: number }[] | undefined,
  mode: string
): { userId: bigint; amount: number }[] => {
  if (!customSplits || customSplits.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Custom splits required for ${mode} mode`,
    });
  }
  return customSplits;
};

const validateAllParticipantsCovered = (
  customSplits: { userId: bigint; amount: number }[],
  participantIds: bigint[]
): void => {
  const splitUserIds = new Set(customSplits.map((s) => s.userId.toString()));
  const participantUserIds = new Set(participantIds.map((id) => id.toString()));

  if (
    splitUserIds.size !== participantUserIds.size ||
    ![...splitUserIds].every((id) => participantUserIds.has(id))
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "All participants must have splits defined",
    });
  }
};

// Split mode handlers
const calculateEqualSplits = (
  amount: number,
  participantIds: bigint[]
): { userId: bigint; amount: number }[] => {
  const splitAmount = amount / participantIds.length;
  return participantIds.map((userId) => ({
    userId,
    amount: splitAmount,
  }));
};

const calculateExactSplits = (
  amount: number,
  participantIds: bigint[],
  customSplits: { userId: bigint; amount: number }[]
): { userId: bigint; amount: number }[] => {
  validateAllParticipantsCovered(customSplits, participantIds);

  // Validate individual amounts are positive and don't exceed total
  for (const split of customSplits) {
    if (split.amount <= 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "All split amounts must be positive",
      });
    }
    if (split.amount > amount) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Individual split amount (${split.amount}) cannot exceed total expense amount (${amount})`,
      });
    }
  }

  // Validate split totals equal the expense amount
  const totalSplitAmount = customSplits.reduce(
    (sum, split) => sum + split.amount,
    0
  );
  const tolerance = 0.01;

  if (Math.abs(totalSplitAmount - amount) > tolerance) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Split amounts (${totalSplitAmount.toFixed(2)}) must equal total expense amount (${amount.toFixed(2)})`,
    });
  }

  return customSplits;
};

const calculatePercentageSplits = (
  amount: number,
  participantIds: bigint[],
  customSplits: { userId: bigint; amount: number }[]
): { userId: bigint; amount: number }[] => {
  validateAllParticipantsCovered(customSplits, participantIds);

  // Validate individual percentages are valid (0-100%)
  for (const split of customSplits) {
    if (split.amount <= 0 || split.amount > 100) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "All percentages must be between 0 and 100",
      });
    }
  }

  // Validate percentages sum to 100%
  const totalPercentage = customSplits.reduce(
    (sum, split) => sum + split.amount,
    0
  );
  const tolerance = 0.01;

  if (Math.abs(totalPercentage - 100) > tolerance) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Percentages (${totalPercentage.toFixed(2)}%) must sum to 100%`,
    });
  }

  // Convert percentages to dollar amounts
  return customSplits.map((split) => ({
    userId: split.userId,
    amount: (split.amount / 100) * amount,
  }));
};

const calculateSharesSplits = (
  amount: number,
  participantIds: bigint[],
  customSplits: { userId: bigint; amount: number }[]
): { userId: bigint; amount: number }[] => {
  validateAllParticipantsCovered(customSplits, participantIds);

  // Calculate total shares
  const totalShares = customSplits.reduce(
    (sum, split) => sum + split.amount,
    0
  );

  if (totalShares <= 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Total shares must be greater than zero",
    });
  }

  // Convert shares to proportional dollar amounts
  return customSplits.map((split) => ({
    userId: split.userId,
    amount: (split.amount / totalShares) * amount,
  }));
};

const calculateSplits = (
  amount: number,
  splitMode: SplitMode,
  participantIds: bigint[],
  customSplits?: { userId: bigint; amount: number }[]
): { userId: bigint; amount: number }[] => {
  switch (splitMode) {
    case SplitMode.EQUAL:
      return calculateEqualSplits(amount, participantIds);

    case SplitMode.EXACT: {
      const validatedSplits = validateCustomSplitsExist(customSplits, "EXACT");
      return calculateExactSplits(amount, participantIds, validatedSplits);
    }

    case SplitMode.PERCENTAGE: {
      const validatedSplits = validateCustomSplitsExist(
        customSplits,
        "PERCENTAGE"
      );
      return calculatePercentageSplits(amount, participantIds, validatedSplits);
    }

    case SplitMode.SHARES: {
      const validatedSplits = validateCustomSplitsExist(customSplits, "SHARES");
      return calculateSharesSplits(amount, participantIds, validatedSplits);
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
          payerId: input.payerId,
          description: input.description,
          amount: input.amount,
          splitMode: input.splitMode,
          participants: {
            connect: input.participantIds.map((id) => ({ id })),
          },
        },
      });

      // Create expense shares for each participant
      await tx.expenseShare.createMany({
        data: splits.map((split) => ({
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
      payerId: Number(expense.payerId),
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
      description:
        "Create an expense with automatic split calculation based on split mode",
    },
  })
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    return createExpenseHandler(input, ctx.db);
  });
