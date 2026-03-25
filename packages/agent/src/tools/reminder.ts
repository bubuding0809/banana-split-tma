import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { createTrpcCaller } from "../trpc.js";

export const sendGroupReminderTool = createTool({
  id: "sendGroupReminder",
  description:
    "Send a reminder message to the entire Telegram group about all outstanding debts.",
  inputSchema: z.object({}),
  execute: async (data, context) => {
    const { caller, chatId } = createTrpcCaller(context);

    return caller.telegram.sendGroupReminderMessage({
      chatId: String(chatId),
    });
  },
});

export const sendDebtReminderTool = createTool({
  id: "sendDebtReminder",
  description:
    "Send a specific debt reminder to a debtor in the Telegram group.",
  inputSchema: z.object({
    debtorUserId: z
      .number()
      .describe(
        "The Telegram User ID of the person who owes money (the debtor)."
      ),
    debtorName: z.string().describe("The name of the debtor."),
    debtorUsername: z
      .string()
      .optional()
      .describe("The optional username of the debtor."),
    creditorName: z
      .string()
      .describe("The name of the creditor (the person who is owed money)."),
    amount: z.number().positive().describe("The amount of money owed."),
    currency: z
      .string()
      .length(3)
      .default("SGD")
      .describe("The 3-letter currency code."),
    threadId: z
      .number()
      .optional()
      .describe(
        "Optional Telegram thread/topic ID where the reminder should be sent."
      ),
  }),
  execute: async (data, context) => {
    const { caller, chatId } = createTrpcCaller(context);

    return caller.telegram.sendDebtReminderMessage({
      chatId,
      ...data,
    });
  },
});
