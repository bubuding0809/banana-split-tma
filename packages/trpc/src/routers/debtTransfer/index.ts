import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { type Logger } from "@repo/logger";
import {
  Db,
  protectedProcedure,
  trpcLogger,
  createTRPCRouter,
} from "../../trpc.js";
import { assertChatAccess } from "../../middleware/chatScope.js";
import {
  toNumber,
  toDecimal,
  FINANCIAL_THRESHOLDS,
} from "../../utils/financial.js";
import { validateCurrency } from "../../utils/currencyApi.js";
import { assertUsersInChat } from "../../utils/chatValidation.js";
import {
  buildUserBalanceMap,
  type TransferRow,
} from "../../utils/chatBalances.js";

export const inputSchema = z.object({
  debtorId: z.number().transform((val) => BigInt(val)),
  creditorId: z.number().transform((val) => BigInt(val)),
  amount: z.number().positive("Amount must be positive"),
  currency: z
    .string()
    .optional()
    .refine((val) => !val || validateCurrency(val), "Invalid currency code"),
  sourceChatId: z.number().transform((val) => BigInt(val)),
  targetChatId: z.number().transform((val) => BigInt(val)),
  description: z.string().max(255, "Description too long").optional(),
});

export const outputSchema = z.object({
  id: z.string(),
  debtorId: z.preprocess((arg) => String(arg), z.string()),
  creditorId: z.preprocess((arg) => String(arg), z.string()),
  creatorId: z.preprocess((arg) => String(arg), z.string()),
  sourceChatId: z.preprocess((arg) => String(arg), z.string()),
  targetChatId: z.preprocess((arg) => String(arg), z.string()),
  amount: z.number(),
  currency: z.string(),
  description: z.string().nullable(),
  date: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type CreateTransferInput = z.infer<typeof inputSchema> & {
  creatorId: bigint;
};

/**
 * Computes how much `debtorId` owes `creditorId` in `chatId` for `currency`,
 * including the effect of any prior native transfers touching that chat.
 *
 * Reuses the tested balance engine on a 2-person sub-ledger (only rows
 * between the debtor and creditor), so transfer source/target signs stay
 * consistent with the rest of the app. Positive = debtor owes creditor.
 */
const computePairwiseOwed = async (
  db: Db,
  chatId: bigint,
  currency: string,
  debtorId: bigint,
  creditorId: bigint
): Promise<number> => {
  const pair = [debtorId, creditorId];

  const shares = await db.expenseShare.findMany({
    where: {
      userId: { in: pair },
      expense: { chatId, currency, payerId: { in: pair } },
    },
    select: {
      userId: true,
      amount: true,
      expense: { select: { payerId: true, currency: true } },
    },
  });

  const settlements = await db.settlement.findMany({
    where: {
      chatId,
      currency,
      senderId: { in: pair },
      receiverId: { in: pair },
    },
    select: { senderId: true, receiverId: true, amount: true, currency: true },
  });

  const transfers = await db.debtTransfer.findMany({
    where: {
      currency,
      debtorId: { in: pair },
      creditorId: { in: pair },
      OR: [{ sourceChatId: chatId }, { targetChatId: chatId }],
    },
    select: {
      sourceChatId: true,
      targetChatId: true,
      debtorId: true,
      creditorId: true,
      amount: true,
    },
  });

  const map = buildUserBalanceMap(
    [Number(debtorId), Number(creditorId)],
    shares,
    settlements,
    transfers as TransferRow[],
    Number(chatId)
  );

  // In a 2-person ledger, the creditor's positive balance is exactly what
  // the debtor still owes them.
  return map.get(Number(creditorId)) ?? 0;
};

export const createTransferHandler = async (
  input: CreateTransferInput,
  db: Db,
  log: Logger = trpcLogger
) => {
  try {
    if (input.sourceChatId === input.targetChatId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Source and target chats must be different",
      });
    }

    if (input.debtorId === input.creditorId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Debtor and creditor must be different users",
      });
    }

    const currency = input.currency || "SGD";

    const amountDecimal = toDecimal(input.amount);
    if (amountDecimal.lessThanOrEqualTo(FINANCIAL_THRESHOLDS.DISPLAY)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Transfer amount must be at least $${FINANCIAL_THRESHOLDS.DISPLAY.toFixed(2)}`,
      });
    }

    // Creator, debtor and creditor must all be members of BOTH chats.
    const participants = [input.creatorId, input.debtorId, input.creditorId];
    await assertUsersInChat(db, input.sourceChatId, participants);
    await assertUsersInChat(db, input.targetChatId, participants);

    // The debtor must actually owe the creditor at least `amount` in the
    // source chat, otherwise we'd be fabricating synthetic debt.
    const owed = await computePairwiseOwed(
      db,
      input.sourceChatId,
      currency,
      input.debtorId,
      input.creditorId
    );

    if (
      toDecimal(owed).lessThan(
        amountDecimal.minus(FINANCIAL_THRESHOLDS.DISPLAY)
      )
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Debtor only owes ${owed.toFixed(2)} ${currency} in the source chat, which is less than the requested transfer of ${input.amount.toFixed(2)} ${currency}`,
      });
    }

    const transfer = await db.$transaction((tx) =>
      tx.debtTransfer.create({
        data: {
          creatorId: input.creatorId,
          debtorId: input.debtorId,
          creditorId: input.creditorId,
          amount: toNumber(amountDecimal),
          currency,
          description: input.description || null,
          sourceChatId: input.sourceChatId,
          targetChatId: input.targetChatId,
        },
      })
    );

    return {
      ...transfer,
      debtorId: Number(transfer.debtorId),
      creditorId: Number(transfer.creditorId),
      creatorId: Number(transfer.creatorId),
      sourceChatId: Number(transfer.sourceChatId),
      targetChatId: Number(transfer.targetChatId),
      amount: Number(transfer.amount),
    };
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error;
    }

    log.error({ err: error }, "debtTransfer.createTransfer.failed");
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to create debt transfer",
      cause: error,
    });
  }
};

const createTransfer = protectedProcedure
  .meta({
    openapi: {
      method: "POST",
      path: "/debt-transfer",
      contentTypes: ["application/json"],
      tags: ["debtTransfer"],
      summary: "Create a cross-group debt transfer",
      description:
        "Move an outstanding debt from one chat to another without creating consumption spending in either group",
    },
  })
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    // Cross-group action: the caller must be authorized for BOTH chats.
    await assertChatAccess(ctx.session, ctx.db, input.sourceChatId);
    await assertChatAccess(ctx.session, ctx.db, input.targetChatId);

    const creatorId = ctx.session.user?.id;
    if (creatorId === undefined || creatorId === null) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "A creating user is required for debt transfers",
      });
    }

    return createTransferHandler(
      { ...input, creatorId: BigInt(creatorId) },
      ctx.db,
      ctx.log
    );
  });

export const debtTransferRouter = createTRPCRouter({
  createTransfer,
});
