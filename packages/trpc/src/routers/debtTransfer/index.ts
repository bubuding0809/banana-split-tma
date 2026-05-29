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
import getAllByChat from "./getAllByChat.js";
import deleteTransfer from "./deleteTransfer.js";
import { getSimplifiedDebtsHandler } from "../chat/getSimplifiedDebts.js";
import { sendTransferNotificationMessageHandler } from "../telegram/sendTransferNotificationMessage.js";

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

// Minimal client surface used to read balances. Both the top-level Db and a
// Prisma interactive-transaction client satisfy this, so the solvency check
// can run inside `$transaction`.
type BalanceReader = Pick<Db, "expenseShare" | "settlement" | "debtTransfer">;

/**
 * Computes how much `debtorId` owes `creditorId` in `chatId` for `currency`,
 * including the effect of any prior native transfers touching that chat.
 *
 * Reuses the tested balance engine on a 2-person sub-ledger (only rows
 * between the debtor and creditor), so transfer source/target signs stay
 * consistent with the rest of the app. Positive = debtor owes creditor.
 */
const computePairwiseOwed = async (
  db: BalanceReader,
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

    // Check if source chat has simplification enabled (defensive lookup to support test stubs)
    let debtSimplificationEnabled = false;
    try {
      const chatRow = await db.chat.findUnique({
        where: { id: input.sourceChatId },
        select: { debtSimplificationEnabled: true },
      } as any);
      if (chatRow && "debtSimplificationEnabled" in chatRow) {
        debtSimplificationEnabled = !!(chatRow as any)
          .debtSimplificationEnabled;
      }
    } catch (e) {
      debtSimplificationEnabled = false;
    }

    const transfer = await db.$transaction(async (tx) => {
      // Serialize concurrent transfers for the same source ledger. Without
      // this, two requests could both pass the solvency check below and both
      // commit (TOCTOU), moving more debt than actually exists. The advisory
      // lock is held for the duration of the transaction and released on
      // commit/rollback.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${input.sourceChatId})`;

      let owed = 0;
      if (debtSimplificationEnabled) {
        // Evaluate the limit against the simplified graph
        const simplified = await getSimplifiedDebtsHandler(
          {
            chatId: Number(input.sourceChatId),
            currency,
          },
          tx as any
        );
        const edge = simplified.simplifiedDebts.find(
          (d) =>
            BigInt(d.fromUserId) === input.debtorId &&
            BigInt(d.toUserId) === input.creditorId
        );
        owed = edge ? edge.amount : 0;
      } else {
        // Fall back to direct pairwise raw debt if simplification is disabled
        owed = await computePairwiseOwed(
          tx,
          input.sourceChatId,
          currency,
          input.debtorId,
          input.creditorId
        );
      }

      if (
        toDecimal(owed).lessThan(
          amountDecimal.minus(FINANCIAL_THRESHOLDS.DISPLAY)
        )
      ) {
        const typeStr = debtSimplificationEnabled ? "simplified" : "raw";
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Debtor only owes ${owed.toFixed(2)} ${currency} (${typeStr}) in the source chat, which is less than the requested transfer of ${input.amount.toFixed(2)} ${currency}`,
        });
      }

      return tx.debtTransfer.create({
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
      });
    });

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

    const transfer = await createTransferHandler(
      { ...input, creatorId: BigInt(creatorId) },
      ctx.db,
      ctx.log
    );

    // Announce in both affected group chats (source: out, target: in). Best
    // effort — a notification failure must not fail the transfer.
    try {
      const [debtor, creditor, sourceChat, targetChat] = await Promise.all([
        ctx.db.user.findUnique({
          where: { id: input.debtorId },
          select: { firstName: true },
        }),
        ctx.db.user.findUnique({
          where: { id: input.creditorId },
          select: { firstName: true },
        }),
        ctx.db.chat.findUnique({
          where: { id: input.sourceChatId },
          select: { title: true, threadId: true },
        }),
        ctx.db.chat.findUnique({
          where: { id: input.targetChatId },
          select: { title: true, threadId: true },
        }),
      ]);

      const debtorName = debtor?.firstName ?? `User ${transfer.debtorId}`;
      const creditorName = creditor?.firstName ?? `User ${transfer.creditorId}`;

      await Promise.allSettled([
        sendTransferNotificationMessageHandler(
          {
            chatId: transfer.sourceChatId,
            direction: "out",
            debtorId: transfer.debtorId,
            debtorName,
            creditorId: transfer.creditorId,
            creditorName,
            amount: transfer.amount,
            currency: transfer.currency,
            counterpartChatTitle: targetChat?.title ?? "another group",
            threadId: sourceChat?.threadId
              ? Number(sourceChat.threadId)
              : undefined,
            force: false,
          },
          ctx.db,
          ctx.teleBot,
          ctx.log
        ),
        sendTransferNotificationMessageHandler(
          {
            chatId: transfer.targetChatId,
            direction: "in",
            debtorId: transfer.debtorId,
            debtorName,
            creditorId: transfer.creditorId,
            creditorName,
            amount: transfer.amount,
            currency: transfer.currency,
            counterpartChatTitle: sourceChat?.title ?? "another group",
            threadId: targetChat?.threadId
              ? Number(targetChat.threadId)
              : undefined,
            force: false,
          },
          ctx.db,
          ctx.teleBot,
          ctx.log
        ),
      ]);
    } catch (error) {
      ctx.log.error({ err: error }, "debtTransfer.broadcast.failed");
    }

    return transfer;
  });

export const debtTransferRouter = createTRPCRouter({
  createTransfer,
  getAllByChat,
  deleteTransfer,
});
