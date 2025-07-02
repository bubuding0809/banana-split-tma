import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure } from "../../trpc.js";
import { Telegram } from "telegraf";
import { mentionMarkdown, escapeMarkdown } from "../../utils/telegram.js";

const participantSchema = z.object({
  userId: z.number(),
  name: z.string().min(1, "Participant name is required"),
  username: z.string().optional(),
  amount: z.number().positive("Amount must be positive"),
});

const inputSchema = z.object({
  chatId: z.number(),
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
  const escapedCreatorName = escapeMarkdown(input.creatorName, 2);

  // Create creator mention
  let creatorMention: string;
  try {
    creatorMention = mentionMarkdown(input.creatorUserId, input.creatorName, 2);
  } catch (error) {
    creatorMention = escapedCreatorName;
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
  const message = `🧾 New expense added by ${creatorMention}\\!\n\n*${escapedDescription}*\nTotal: ${formattedTotalAmount}\n\n*Your shares:*\n${participantList}\n\nBalances have been updated\\!`;

  // Send the message directly (components are pre-escaped)
  try {
    const sentMessage = await teleBot.sendMessage(input.chatId, message, {
      parse_mode: "MarkdownV2",
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

export default publicProcedure
  .input(inputSchema)
  .mutation(async ({ input, ctx }) => {
    return sendExpenseNotificationMessageHandler(input, ctx.teleBot);
  });
