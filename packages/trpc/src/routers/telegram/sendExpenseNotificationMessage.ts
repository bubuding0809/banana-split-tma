import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../../trpc.js";
import { Telegram } from "telegraf";
import {
  mentionMarkdown,
  escapeMarkdown,
  createDeepLinkedUrl,
} from "../../utils/telegram.js";
import { inlineKeyboard } from "telegraf/markup";

const participantSchema = z.object({
  userId: z.number(),
  name: z.string().min(1, "Participant name is required"),
  username: z.string().optional(),
  amount: z.number().positive("Amount must be positive"),
});

const inputSchema = z.object({
  chatId: z.number(),
  payerId: z.number(),
  payerName: z.string().min(1, "Payer name is required"),
  creatorUserId: z.number(),
  creatorName: z.string().min(1, "Creator name is required"),
  creatorUsername: z.string().optional(),
  expenseDescription: z.string().min(1, "Expense description is required"),
  totalAmount: z.number().positive("Total amount must be positive"),
  participants: z
    .array(participantSchema)
    .min(1, "At least one participant is required"),
  currency: z
    .string()
    .length(3, "Currency must be a 3-letter code")
    .default("SGD"),
  threadId: z.number().optional(),
});

export const sendExpenseNotificationMessageHandler = async (
  input: z.infer<typeof inputSchema>,
  teleBot: Telegram
) => {
  // Validate business logic
  if (input.chatId === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid chat ID. Cannot send message to chat ID 0.",
    });
  }

  if (input.participants.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Cannot send expense notification without participants.",
    });
  }

  // Format the total amount as currency with error handling
  let formattedTotalAmount: string;
  try {
    const rawTotalAmount = new Intl.NumberFormat("en-SG", {
      style: "currency",
      currency: input.currency,
    }).format(input.totalAmount);
    formattedTotalAmount = escapeMarkdown(rawTotalAmount, 2);
  } catch (error) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Invalid currency code: ${input.currency}`,
    });
  }

  // Escape expense description and creator name for MarkdownV2
  const escapedDescription = escapeMarkdown(input.expenseDescription, 2);

  // Create payer mention
  let payerMention: string;
  try {
    payerMention = mentionMarkdown(input.payerId, input.payerName, 2);
  } catch (error) {
    payerMention = escapeMarkdown(input.payerName, 2);
  }

  // Build participant list with amounts
  const participantList = input.participants
    .map((participant) => {
      // Format individual amount
      let formattedParticipantAmount: string;
      try {
        const rawAmount = new Intl.NumberFormat("en-SG", {
          style: "currency",
          currency: input.currency,
        }).format(participant.amount);
        formattedParticipantAmount = escapeMarkdown(rawAmount, 2);
      } catch (error) {
        formattedParticipantAmount = escapeMarkdown(
          participant.amount.toString(),
          2
        );
      }

      // Create participant mention
      let participantMention: string;
      try {
        participantMention = mentionMarkdown(
          participant.userId,
          participant.name,
          2
        );
      } catch (error) {
        participantMention = escapeMarkdown(participant.name, 2);
      }

      return `• ${participantMention}: ${formattedParticipantAmount}`;
    })
    .join("\n");

  // Create the expense notification message
  const message = `🧾 New expense paid by ${payerMention}\\!

> ${escapedDescription}
Total: ${formattedTotalAmount}

*Your shares:*\n${participantList}`;

  const chatContext = {
    chat_id: input.chatId,
    chat_type: "g",
  };
  const base64EnchodedChatContext = btoa(JSON.stringify(chatContext));
  const botInfo = await teleBot.getMe();
  const deepLink = createDeepLinkedUrl(
    botInfo.username,
    base64EnchodedChatContext,
    "app"
  );
  const keyboard = inlineKeyboard([
    { text: "View Balances 💸", url: deepLink },
  ]);

  // Send the message directly (components are pre-escaped)
  try {
    const sentMessage = await teleBot.sendMessage(input.chatId, message, {
      parse_mode: "MarkdownV2",
      message_thread_id: input.threadId,
      ...keyboard,
    });

    return sentMessage.message_id;
  } catch (error) {
    console.error("Error sending expense notification message:", error);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to send expense notification: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
};

export default protectedProcedure
  .input(inputSchema)
  .mutation(async ({ input, ctx }) => {
    return sendExpenseNotificationMessageHandler(input, ctx.teleBot);
  });
