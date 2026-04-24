import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertChatAccess } from "../../middleware/chatScope.js";
import { SplitMode } from "@dko/database";
import { BASE_CATEGORIES } from "@repo/categories";
import { Decimal } from "decimal.js";
import {
  toNumber,
  sumAmounts,
  FINANCIAL_THRESHOLDS,
} from "../../utils/financial.js";
import { validateCurrency } from "../../utils/currencyApi.js";
import { assertUsersInChat } from "../../utils/chatValidation.js";
import { ExpenseChangedField } from "../telegram/sendExpenseNotificationMessage.js";
import {
  editExpenseMessageHandler,
  sendExpenseUpdateBumpHandler,
  sendExpenseUpdateStandaloneHandler,
} from "../telegram/editExpenseNotificationMessage.js";
import { Telegram } from "telegraf";

// Diff pre- vs post-update state to decide which fields the edited
// notification should mark with ✏️. Matches the 5-field vocabulary
// used by sendBatchExpenseSummary so singular and batch edits render
// the same signal.
const computeChangedFields = (
  existing: {
    description: string;
    amount: { toNumber(): number } | number;
    payerId: bigint;
    categoryId: string | null;
    splitMode: SplitMode;
    shares: { userId: bigint; amount: { toNumber(): number } | number }[];
  },
  input: {
    description: string;
    amount: number;
    payerId: bigint;
    categoryId?: string | null;
    splitMode: SplitMode;
  },
  newSplits: { userId: bigint; amount: number }[]
): ExpenseChangedField[] => {
  const changed: ExpenseChangedField[] = [];

  if (existing.description !== input.description) changed.push("description");

  const existingAmount =
    typeof existing.amount === "number"
      ? existing.amount
      : existing.amount.toNumber();
  if (Math.abs(existingAmount - input.amount) > 0.005) changed.push("amount");

  if (existing.payerId !== input.payerId) changed.push("payer");

  // `input.categoryId === undefined` means the caller didn't touch
  // category — leave the existing value, don't mark it as changed.
  if (
    input.categoryId !== undefined &&
    existing.categoryId !== input.categoryId
  ) {
    changed.push("category");
  }

  // "split" covers splitMode, participant set, and per-participant
  // share amounts — any one flips the single marker.
  let splitChanged = existing.splitMode !== input.splitMode;
  if (!splitChanged) {
    const existingByUser = new Map(
      existing.shares.map((s) => [
        s.userId.toString(),
        typeof s.amount === "number" ? s.amount : s.amount.toNumber(),
      ])
    );
    const newByUser = new Map(
      newSplits.map((s) => [s.userId.toString(), s.amount])
    );
    if (existingByUser.size !== newByUser.size) {
      splitChanged = true;
    } else {
      for (const [uid, amt] of newByUser) {
        const prev = existingByUser.get(uid);
        if (prev === undefined || Math.abs(prev - amt) > 0.005) {
          splitChanged = true;
          break;
        }
      }
    }
  }
  if (splitChanged) changed.push("split");

  return changed;
};

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
  date: z
    .date()
    .optional()
    .refine(
      (date) => !date || date <= new Date(),
      "Expense date cannot be in the future"
    ),
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
  categoryId: z
    .string()
    .trim()
    .refine(
      (v) => v.startsWith("base:") || v.startsWith("chat:"),
      "categoryId must start with 'base:' or 'chat:'"
    )
    .nullable()
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
  categoryId: z.string().nullable(),
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
    // Assert all users are members of the chat
    await assertUsersInChat(db, input.chatId, [
      input.creatorId,
      input.payerId,
      ...input.participantIds,
      ...(input.customSplits?.map((s) => s.userId) || []),
    ]);

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

    if (input.categoryId) {
      if (input.categoryId.startsWith("base:")) {
        if (!BASE_CATEGORIES.find((c) => c.id === input.categoryId)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Unknown base category",
          });
        }
      } else {
        const uuid = input.categoryId.slice("chat:".length);
        const exists = await db.chatCategory.findFirst({
          where: { id: uuid, chatId: existingExpense.chatId },
          select: { id: true },
        });
        if (!exists) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Unknown chat category",
          });
        }
      }
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
          date: input.date,
          currency: currency,
          splitMode: input.splitMode,
          categoryId:
            input.categoryId === undefined ? undefined : input.categoryId,
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

    // Compute which fields actually changed — drives the ✏️ markers
    // in the edited notification and also powers the no-op guard.
    const changedFields = computeChangedFields(
      {
        description: existingExpense.description,
        amount: existingExpense.amount as unknown as { toNumber(): number },
        payerId: existingExpense.payerId,
        categoryId: existingExpense.categoryId,
        splitMode: existingExpense.splitMode,
        shares: existingExpense.shares as unknown as {
          userId: bigint;
          amount: { toNumber(): number };
        }[],
      },
      {
        description: input.description,
        amount: input.amount,
        payerId: input.payerId,
        categoryId: input.categoryId,
        splitMode: input.splitMode,
      },
      splits
    );

    // Send notification if requested and teleBot is available.
    // Also respect the per-chat `notifyOnExpenseUpdate` preference —
    // users can disable the edit+bump for every update (singular or
    // driven by bulk-update fan-out) via Settings.
    // No-op guard: if nothing the user can see actually changed, skip
    // the edit+bump — avoids Telegram's "message is not modified" error
    // and avoids pinging participants for a net-zero update.
    if (
      input.sendNotification &&
      existingExpense.chat.notifyOnExpenseUpdate &&
      changedFields.length > 0
    ) {
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

          const threadId =
            input.threadId ??
            (existingExpense.chat.threadId
              ? Number(existingExpense.chat.threadId)
              : undefined);

          // Resolve the post-update category to emoji + title for the
          // notification. `input.categoryId === undefined` means the
          // caller didn't touch category, so we keep whatever the
          // existing expense had.
          const effectiveCategoryId =
            input.categoryId === undefined
              ? existingExpense.categoryId
              : input.categoryId;
          let categoryEmoji: string | undefined;
          let categoryTitle: string | undefined;
          if (effectiveCategoryId?.startsWith("base:")) {
            const base = BASE_CATEGORIES.find(
              (c) => c.id === effectiveCategoryId
            );
            if (base) {
              categoryEmoji = base.emoji;
              categoryTitle = base.title;
            }
          } else if (effectiveCategoryId?.startsWith("chat:")) {
            const uuid = effectiveCategoryId.slice("chat:".length);
            const row = await db.chatCategory.findFirst({
              where: { id: uuid, chatId: input.chatId },
              select: { emoji: true, title: true },
            });
            if (row) {
              categoryEmoji = row.emoji;
              categoryTitle = row.title;
            }
          }

          // If we have the original message ID, edit it instead of sending a new one
          if (existingExpense.telegramMessageId) {
            try {
              // Edit the original expense message with updated details
              await editExpenseMessageHandler(
                {
                  chatId: Number(input.chatId),
                  chatType: existingExpense.chat.type,
                  expenseId: input.expenseId,
                  messageId: Number(existingExpense.telegramMessageId),
                  payerId: Number(input.payerId),
                  payerName: payer.firstName,
                  expenseDescription: input.description,
                  totalAmount: input.amount,
                  participants: participantsWithAmounts,
                  currency: currency,
                  expenseDate: input.date ?? existingExpense.date,
                  categoryEmoji,
                  categoryTitle,
                  changedFields,
                  threadId,
                },
                teleBot
              );

              // Send a small bump reply to notify about the update
              const bumpMessageId = await sendExpenseUpdateBumpHandler(
                {
                  chatId: Number(input.chatId),
                  replyToMessageId: Number(existingExpense.telegramMessageId),
                  updaterUserId: Number(input.creatorId),
                  updaterName: creator.firstName,
                  threadId,
                },
                teleBot
              );

              // Store the bump message ID for future deletion
              if (bumpMessageId) {
                await db.expense.update({
                  where: { id: input.expenseId },
                  data: {
                    telegramUpdateBumpMessageIds: {
                      push: BigInt(bumpMessageId),
                    },
                  },
                });
              }
            } catch (editError) {
              // The original notification is gone — most commonly the
              // user deleted it from the chat. Re-posting the full
              // "🧾 New Expense" bubble would be noisy and confusing.
              // Instead, drop a minimal "📝 Expense updated" message with
              // a "View Expense" button and null out telegramMessageId
              // so future edits skip the failing edit-attempt and just
              // post another standalone bump.
              console.error(
                "Failed to edit expense message, falling back to standalone update:",
                editError
              );
              const standaloneId = await sendExpenseUpdateStandaloneHandler(
                {
                  chatId: Number(input.chatId),
                  chatType: existingExpense.chat.type,
                  expenseId: input.expenseId,
                  updaterUserId: Number(input.creatorId),
                  updaterName: creator.firstName,
                  threadId,
                },
                teleBot
              );
              await db.expense.update({
                where: { id: input.expenseId },
                data: {
                  telegramMessageId: null,
                  ...(standaloneId
                    ? {
                        telegramUpdateBumpMessageIds: {
                          push: BigInt(standaloneId),
                        },
                      }
                    : {}),
                },
              });
            }
          } else {
            // No original message ID was ever stored (e.g. expense was
            // created while notifyOnExpense was off, or a previous
            // fallback nulled it). Post the same minimal standalone bump
            // so participants still see an update signal.
            const standaloneId = await sendExpenseUpdateStandaloneHandler(
              {
                chatId: Number(input.chatId),
                chatType: existingExpense.chat.type,
                expenseId: input.expenseId,
                updaterUserId: Number(input.creatorId),
                updaterName: creator.firstName,
                threadId,
              },
              teleBot
            );
            if (standaloneId) {
              await db.expense.update({
                where: { id: input.expenseId },
                data: {
                  telegramUpdateBumpMessageIds: {
                    push: BigInt(standaloneId),
                  },
                },
              });
            }
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
      categoryId: updatedExpense.categoryId ?? null,
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
    await assertChatAccess(ctx.session, ctx.db, input.chatId);
    return updateExpenseHandler(input, ctx.db, ctx.teleBot);
  });
