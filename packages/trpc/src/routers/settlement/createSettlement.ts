import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, publicProcedure } from "../../trpc.js";
import {
  toNumber,
  toDecimal,
  FINANCIAL_THRESHOLDS,
} from "../../utils/financial.js";

export const inputSchema = z.object({
  chatId: z.number().transform((val) => BigInt(val)),
  senderId: z.number().transform((val) => BigInt(val)),
  receiverId: z.number().transform((val) => BigInt(val)),
  amount: z.number().positive("Amount must be positive"),
  description: z.string().max(255, "Description too long").optional(),
});

export const outputSchema = z.object({
  id: z.string(),
  chatId: z.preprocess((arg) => String(arg), z.string()),
  senderId: z.preprocess((arg) => String(arg), z.string()),
  receiverId: z.preprocess((arg) => String(arg), z.string()),
  amount: z.number(),
  description: z.string().nullable(),
  date: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const createSettlementHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  try {
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

    // Create the settlement
    const settlement = await db.settlement.create({
      data: {
        chatId: input.chatId,
        senderId: input.senderId,
        receiverId: input.receiverId,
        amount: toNumber(amountDecimal),
        description: input.description || null,
      },
    });

    return {
      ...settlement,
      chatId: Number(settlement.chatId),
      senderId: Number(settlement.senderId),
      receiverId: Number(settlement.receiverId),
      amount: Number(settlement.amount),
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

export default publicProcedure
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
    return createSettlementHandler(input, ctx.db);
  });
