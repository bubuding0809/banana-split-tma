import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, protectedProcedure } from "../../trpc.js";
import { SplitMode } from "@dko/database";
import { Decimal } from "decimal.js";
import {
  toNumber,
  sumAmounts,
  FINANCIAL_THRESHOLDS,
} from "../../utils/financial.js";
import { validateCurrency } from "../../utils/currencyApi.js";
import { sendExpenseNotificationMessageHandler } from "../telegram/sendExpenseNotificationMessage.js";
import {
  editExpenseMessageHandler,
  sendExpenseUpdateBumpHandler,
} from "../telegram/editExpenseNotificationMessage.js";
import { Telegram } from "telegraf";

export const inputSchema = z.object({
  expenseId: z.string().min(1, "Expense ID is required"),
  chatId: z.number().transform((val) => BigInt(val)),
  creatorId: z.number().transform((val) => BigInt(val)),
  payerId: z.number().transform((val) => BigInt(val)),
  description: z
    .string()
    .min(1, "Description is required")
    .max(60, "Description too long"),
  amount: z.number().positive("Amount must be positive"),
  currency: z
    .string()
    .optional()
    .refine((val) => !val || validateCurrency(val), "Invalid currency code"),
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
  sendNotification: z.boolean().default(true),
  threadId: z.number().optional(),
});

export const outputSchema = z.object({
  id: z.string(),
  chatId: z.preprocess((arg) => String(arg), z.string()),
  creatorId: z.preprocess((arg) => String(arg), z.string()),
  payerId: z.preprocess((arg) => String(arg), z.string()),
  description: z.string(),
  amount: z.number(),
  currency: z.string(),
  splitMode: z.nativeEnum(SplitMode),
  date: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Reuse validation functions from createExpense
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

// Reuse split calculation functions from createExpense
const calculateEqualSplits = (
  amount: number,
  participantIds: bigint[]
): { userId: bigint; amount: number }[] => {
  const amountDecimal = new Decimal(amount);
  const participantCount = new Decimal(participantIds.length);
  const splitAmount = amountDecimal.dividedBy(participantCount);

  return participantIds.map((userId) => ({
    userId,
    amount: toNumber(splitAmount),
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

  // Validate split totals equal the expense amount using precise Decimal arithmetic
  const splitAmounts = customSplits.map((split) => split.amount);
  const totalSplitAmountDecimal = sumAmounts(splitAmounts);
  const amountDecimal = new Decimal(amount);
  const difference = totalSplitAmountDecimal.minus(amountDecimal).abs();

  if (difference.greaterThan(FINANCIAL_THRESHOLDS.DISPLAY)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Split amounts (${totalSplitAmountDecimal.toFixed(2)}) must equal total expense amount (${amountDecimal.toFixed(2)})`,
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

  // Validate percentages sum to 100% using precise Decimal arithmetic
  const percentages = customSplits.map((split) => split.amount);
  const totalPercentageDecimal = sumAmounts(percentages);
  const hundredDecimal = new Decimal(100);
  const difference = totalPercentageDecimal.minus(hundredDecimal).abs();

  if (difference.greaterThan(FINANCIAL_THRESHOLDS.DISPLAY)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Percentages (${totalPercentageDecimal.toFixed(2)}%) must sum to 100%`,
    });
  }

  // Convert percentages to dollar amounts using precise Decimal arithmetic
  const amountDecimal = new Decimal(amount);
  return customSplits.map((split) => {
    const percentageDecimal = new Decimal(split.amount);
    const dollarAmount = percentageDecimal.dividedBy(100).times(amountDecimal);
    return {
      userId: split.userId,
      amount: toNumber(dollarAmount),
    };
  });
};

const calculateSharesSplits = (
  amount: number,
  participantIds: bigint[],
  customSplits: { userId: bigint; amount: number }[]
): { userId: bigint; amount: number }[] => {
  validateAllParticipantsCovered(customSplits, participantIds);

  // Calculate total shares using precise Decimal arithmetic
  const shares = customSplits.map((split) => split.amount);
  const totalSharesDecimal = sumAmounts(shares);

  if (totalSharesDecimal.lessThanOrEqualTo(0)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Total shares must be greater than zero",
    });
  }

  // Convert shares to proportional dollar amounts using precise Decimal arithmetic
  const amountDecimal = new Decimal(amount);
  return customSplits.map((split) => {
    const shareDecimal = new Decimal(split.amount);
    const dollarAmount = shareDecimal
      .dividedBy(totalSharesDecimal)
      .times(amountDecimal);
    return {
      userId: split.userId,
      amount: toNumber(dollarAmount),
    };
  });
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

export const updateExpenseHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db,
  teleBot: Telegram
) => {
  try {
    // First, verify that the expense exists and user has permission to edit it
    const existingExpense = await db.expense.findUnique({
      where: { id: input.expenseId },
      include: {
        chat: true,
        participants: true,
        shares: true,
      },
    });

    if (!existingExpense) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Expense not found",
      });
    }

    // Verify the expense belongs to the specified chat
    if (existingExpense.chatId !== input.chatId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Expense does not belong to the specified chat",
      });
    }

    // Determine the currency to use
    let currency = input.currency;
    if (!currency) {
      currency = existingExpense.chat.baseCurrency;
    }

    // Calculate the new splits for each participant
    const splits = calculateSplits(
      input.amount,
      input.splitMode,
      input.participantIds,
      input.customSplits
    );

    // Update expense and shares in a transaction
    const updatedExpense = await db.$transaction(async (tx) => {
      // Update the main expense record
      const expense = await tx.expense.update({
        where: { id: input.expenseId },
        data: {
          creatorId: input.creatorId,
          payerId: input.payerId,
          description: input.description,
          amount: input.amount,
          currency: currency,
          splitMode: input.splitMode,
          participants: {
            set: input.participantIds.map((id) => ({ id })),
          },
        },
      });

      // Delete existing expense shares
      await tx.expenseShare.deleteMany({
        where: { expenseId: input.expenseId },
      });

      // Create new expense shares for each participant
      await tx.expenseShare.createMany({
        data: splits.map((split) => ({
          expenseId: input.expenseId,
          userId: split.userId,
          amount: split.amount,
        })),
      });

      return expense;
    });

    // Send notification if requested and teleBot is available
    if (input.sendNotification) {
      try {
        // Fetch creator and participant details for notification
        const [payer, creator, participants] = await Promise.all([
          db.user.findUnique({
            where: { id: input.payerId },
            select: { id: true, firstName: true, username: true },
          }),
          db.user.findUnique({
            where: { id: input.creatorId },
            select: { id: true, firstName: true, username: true },
          }),
          db.user.findMany({
            where: { id: { in: input.participantIds } },
            select: { id: true, firstName: true, username: true },
          }),
        ]);

        if (creator && payer && participants.length > 0) {
          // Map splits to participants with user info
          const participantsWithAmounts = splits.map((split) => {
            const participant = participants.find((p) => p.id === split.userId);
            if (!participant) {
              throw new Error(`Participant with ID ${split.userId} not found`);
            }
            return {
              userId: Number(participant.id),
              name: participant.firstName,
              username: participant.username || undefined,
              amount: split.amount,
            };
          });

          // If we have the original message ID, edit it instead of sending a new one
          if (existingExpense.telegramMessageId) {
            try {
              // Edit the original expense message with updated details
              await editExpenseMessageHandler(
                {
                  chatId: Number(input.chatId),
                  messageId: Number(existingExpense.telegramMessageId),
                  payerId: Number(input.payerId),
                  payerName: payer.firstName,
                  expenseDescription: input.description,
                  totalAmount: input.amount,
                  participants: participantsWithAmounts,
                  currency: currency,
                  threadId: input.threadId,
                },
                teleBot
              );

              // Send a small bump reply to notify about the update
              await sendExpenseUpdateBumpHandler(
                {
                  chatId: Number(input.chatId),
                  replyToMessageId: Number(existingExpense.telegramMessageId),
                  updaterUserId: Number(input.creatorId),
                  updaterName: creator.firstName,
                  threadId: input.threadId,
                },
                teleBot
              );
            } catch (editError) {
              // If editing fails, fall back to sending a new message
              console.error(
                "Failed to edit expense message, sending new notification instead:",
                editError
              );
              await sendExpenseNotificationMessageHandler(
                {
                  chatId: Number(input.chatId),
                  payerId: Number(input.payerId),
                  payerName: payer.firstName,
                  creatorUserId: Number(creator.id),
                  creatorName: creator.firstName,
                  creatorUsername: creator.username || undefined,
                  expenseDescription: `Updated: ${input.description}`,
                  totalAmount: input.amount,
                  participants: participantsWithAmounts,
                  currency: currency,
                  threadId: input.threadId,
                },
                teleBot
              );
            }
          } else {
            // No original message ID, send a new notification
            await sendExpenseNotificationMessageHandler(
              {
                chatId: Number(input.chatId),
                payerId: Number(input.payerId),
                payerName: payer.firstName,
                creatorUserId: Number(creator.id),
                creatorName: creator.firstName,
                creatorUsername: creator.username || undefined,
                expenseDescription: `Updated: ${input.description}`,
                totalAmount: input.amount,
                participants: participantsWithAmounts,
                currency: currency,
                threadId: input.threadId,
              },
              teleBot
            );
          }
        }
      } catch (notificationError) {
        // Log notification error but don't fail expense update
        console.error(
          "Error sending expense update notification:",
          notificationError
        );
      }
    }

    return {
      ...updatedExpense,
      chatId: Number(updatedExpense.chatId),
      creatorId: Number(updatedExpense.creatorId),
      payerId: Number(updatedExpense.payerId),
      amount: Number(updatedExpense.amount),
      currency: updatedExpense.currency,
    };
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error;
    }

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to update expense",
    });
  }
};

export default protectedProcedure
  .meta({
    openapi: {
      method: "PUT",
      path: "/expense/{expenseId}",
      contentTypes: ["application/json"],
      tags: ["expense"],
      summary: "Update an existing expense",
      description:
        "Update an expense with automatic split recalculation based on split mode",
    },
  })
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    return updateExpenseHandler(input, ctx.db, ctx.teleBot);
  });
