import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { createTrpcCaller } from "../trpc.js";

export const getNetShareTool = createTool({
  id: "getNetShare",
  description:
    "Get the net share balance between the current user and a target user for a specific currency.",
  inputSchema: z.object({
    targetUserId: z
      .number()
      .describe("The user ID of the person to check the balance against."),
    currency: z
      .string()
      .min(3)
      .max(3)
      .describe("The 3-letter currency code (e.g., USD, SGD)."),
  }),
  execute: async (data, context) => {
    const { caller, telegramUserId, chatId } = createTrpcCaller(context);

    const balance = await caller.expenseShare.getNetShare({
      mainUserId: telegramUserId,
      targetUserId: data.targetUserId,
      chatId,
      currency: data.currency,
    });

    return { balance };
  },
});

export const getTotalsTool = createTool({
  id: "getTotals",
  description:
    "Get the total amount borrowed and lent by the current user across all expenses in the chat.",
  inputSchema: z.object({}),
  execute: async (data, context) => {
    const { caller, telegramUserId, chatId } = createTrpcCaller(context);

    const [borrowed, lent] = await Promise.all([
      caller.expenseShare.getTotalBorrowed({ userId: telegramUserId, chatId }),
      caller.expenseShare.getTotalLent({ userId: telegramUserId, chatId }),
    ]);

    return { borrowed, lent };
  },
});
