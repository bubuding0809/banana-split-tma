import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertChatAccess } from "../../middleware/chatScope.js";
import {
  toNumber,
  toDecimal,
  FINANCIAL_THRESHOLDS,
} from "../../utils/financial.js";
import { validateCurrency } from "../../utils/currencyApi.js";
import { assertUsersInChat } from "../../utils/chatValidation.js";
import { sendSettlementNotificationMessageHandler } from "../telegram/sendSettlementNotificationMessage.js";
import { Telegram } from "telegraf";

export const inputSchema = z.object({
  chatId: z.number().transform((val) => BigInt(val)),
  senderId: z.number().transform((val) => BigInt(val)),
  receiverId: z.number().transform((val) => BigInt(val)),
  amount: z.number().positive("Amount must be positive"),
  currency: z
    .string()
    .optional()
    .refine((val) => !val || validateCurrency(val), "Invalid currency code"),
  description: z.string().max(255, "Description too long").optional(),
  sendNotification: z.boolean().default(false),
  creditorName: z.string().optional(),
  creditorUsername: z.string().optional(),
  debtorName: z.string().optional(),
  threadId: z.number().optional(),
});

export const outputSchema = z.object({
  id: z.string(),
  chatId: z.preprocess((arg) => String(arg), z.string()),
  senderId: z.preprocess((arg) => String(arg), z.string()),
  receiverId: z.preprocess((arg) => String(arg), z.string()),
  amount: z.number(),
  currency: z.string(),
  description: z.string().nullable(),
  date: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const createSettlementHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db,
  teleBot: Telegram
) => {
  try {
    // Determine the currency to use
    let currency = input.currency;
    if (!currency) {
      // Fetch chat's baseCurrency if no currency provided
      const chat = await db.chat.findUnique({
        where: { id: input.chatId },
        select: { baseCurrency: true },
      });

      if (!chat) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Chat not found",
        });
      }

      currency = chat.baseCurrency;
    }

    // Validate amount using Decimal for precision
    const amountDecimal = toDecimal(input.amount);

    // Ensure amount meets minimum threshold
    if (amountDecimal.lessThanOrEqualTo(FINANCIAL_THRESHOLDS.DISPLAY)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Settlement amount must be at least $${FINANCIAL_THRESHOLDS.DISPLAY.toFixed(2)}`,
      });
    }

    // Validate that sender and receiver are different
    if (input.senderId === input.receiverId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Cannot create settlement with yourself",
      });
    }

    // Verify both users exist in the specified chat
    await assertUsersInChat(db, input.chatId, [
      input.senderId,
      input.receiverId,
    ]);

    // Create the settlement
    const settlement = await db.settlement.create({
      data: {
        chatId: input.chatId,
        senderId: input.senderId,
        receiverId: input.receiverId,
        amount: toNumber(amountDecimal),
        currency: currency,
        description: input.description || null,
      },
    });

    // Send notification if requested (handler gates on chat.notifyOnSettlement)
    if (input.sendNotification && input.creditorName && input.debtorName) {
      try {
        const messageId = await sendSettlementNotificationMessageHandler(
          {
            chatId: Number(input.chatId),
            creditorUserId: Number(input.receiverId), // creditor receives the money
            creditorName: input.creditorName,
            creditorUsername: input.creditorUsername,
            debtorName: input.debtorName,
            amount: input.amount,
            currency: currency,
            threadId: input.threadId,
            force: false,
          },
          db,
          teleBot
        );

        // Persist the Telegram message ID so deleteSettlement can clean
        // up the notification when this settlement is later deleted.
        if (messageId) {
          await db.settlement.update({
            where: { id: settlement.id },
            data: { telegramMessageId: BigInt(messageId) },
          });
        }
      } catch (notificationError) {
        console.error(
          "Failed to send settlement notification:",
          notificationError
        );
        // Don't throw - settlement succeeded, notification failure is non-critical
      }
    }

    return {
      ...settlement,
      chatId: Number(settlement.chatId),
      senderId: Number(settlement.senderId),
      receiverId: Number(settlement.receiverId),
      amount: Number(settlement.amount),
      currency: settlement.currency,
    };
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error;
    }

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to create settlement",
    });
  }
};

export default protectedProcedure
  .meta({
    openapi: {
      method: "POST",
      path: "/settlement",
      contentTypes: ["application/json"],
      tags: ["settlement"],
      summary: "Create a new settlement",
      description: "Record a debt settlement between two users in a chat",
    },
  })
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    await assertChatAccess(ctx.session, ctx.db, input.chatId);
    return createSettlementHandler(input, ctx.db, ctx.teleBot);
  });
