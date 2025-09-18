import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, protectedProcedure } from "../../trpc.js";
import {
  toNumber,
  toDecimal,
  FINANCIAL_THRESHOLDS,
} from "../../utils/financial.js";
import { validateCurrency } from "../../utils/currencyApi.js";
import { sendSettlementNotificationMessageHandler } from "../telegram/sendSettlementNotificationMessage.js";
import { Telegram } from "telegraf";

export const inputSchema = z.object({
  chatId: z.number().transform((val) => BigInt(val)),
  senderId: z.number().transform((val) => BigInt(val)),
  receiverId: z.number().transform((val) => BigInt(val)),
  balances: z.array(
    z.object({
      currency: z
        .string()
        .refine((val) => validateCurrency(val), "Invalid currency code"),
      amount: z.number(),
    })
  ),
  sendNotification: z.boolean().default(true),
  creditorName: z.string().optional(),
  creditorUsername: z.string().optional(),
  debtorName: z.string().optional(),
  threadId: z.number().optional(),
});

export const outputSchema = z.object({
  settlements: z.array(
    z.object({
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
    })
  ),
  totalSettlements: z.number(),
});

export const settleAllDebtsHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db,
  teleBot: Telegram
) => {
  try {
    // Validate that sender and receiver are different
    if (input.senderId === input.receiverId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Cannot create settlements with yourself",
      });
    }

    // Filter out zero or insignificant balances and validate amounts
    const validBalances = input.balances.filter((balance) => {
      const amountDecimal = toDecimal(Math.abs(balance.amount));
      return amountDecimal.greaterThan(FINANCIAL_THRESHOLDS.DISPLAY);
    });

    if (validBalances.length === 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "No valid balances to settle",
      });
    }

    // Verify both users exist in the specified chat
    const chatMembers = await db.chat.findFirst({
      where: {
        id: input.chatId,
      },
      select: {
        members: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!chatMembers) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Chat not found",
      });
    }

    const memberIds = new Set(
      chatMembers.members.map((member) => member.id.toString())
    );

    if (!memberIds.has(input.senderId.toString())) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Sender is not a member of this chat",
      });
    }

    if (!memberIds.has(input.receiverId.toString())) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Receiver is not a member of this chat",
      });
    }

    // Create all settlements in a transaction
    const settlements = await db.$transaction(async (prisma) => {
      const createdSettlements = [];

      for (const balance of validBalances) {
        const amountDecimal = toDecimal(Math.abs(balance.amount));

        const settlement = await prisma.settlement.create({
          data: {
            chatId: input.chatId,
            senderId: input.senderId,
            receiverId: input.receiverId,
            amount: toNumber(amountDecimal),
            currency: balance.currency,
            description: `Bulk settlement - ${balance.currency}`,
          },
        });

        createdSettlements.push({
          ...settlement,
          chatId: Number(settlement.chatId),
          senderId: Number(settlement.senderId),
          receiverId: Number(settlement.receiverId),
          amount: Number(settlement.amount),
          currency: settlement.currency,
        });
      }

      return createdSettlements;
    });

    // Send notification if requested and names are provided
    if (input.sendNotification && input.creditorName && input.debtorName) {
      try {
        await Promise.allSettled(
          validBalances.map((balance) =>
            sendSettlementNotificationMessageHandler(
              {
                chatId: Number(input.chatId),
                creditorUserId: Number(input.receiverId),
                creditorName: input.creditorName!, // Safe since we check above
                creditorUsername: input.creditorUsername,
                debtorName: input.debtorName!, // Safe since we check above
                amount: Math.abs(balance.amount),
                currency: balance.currency,
                threadId: input.threadId,
              },
              teleBot
            )
          )
        );
      } catch (notificationError) {
        console.error(
          "Failed to send bulk settlement notification:",
          notificationError
        );
        // Don't throw - settlements succeeded, notification failure is non-critical
      }
    }

    return {
      settlements,
      totalSettlements: settlements.length,
    };
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error;
    }

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to create bulk settlements",
    });
  }
};

export default protectedProcedure
  .meta({
    openapi: {
      method: "POST",
      path: "/settlement/settle-all",
      contentTypes: ["application/json"],
      tags: ["settlement"],
      summary: "Settle all debts at once",
      description:
        "Create multiple settlements for all outstanding balances between two users",
    },
  })
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    return settleAllDebtsHandler(input, ctx.db, ctx.teleBot);
  });
