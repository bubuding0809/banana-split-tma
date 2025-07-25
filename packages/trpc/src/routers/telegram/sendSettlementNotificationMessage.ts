import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../../trpc.js";
import { Telegram } from "telegraf";
import { mentionMarkdown, escapeMarkdown } from "../../utils/telegram.js";
import { formatCurrencyWithCode } from "../../utils/financial.js";

const inputSchema = z.object({
  chatId: z.number(),
  creditorUserId: z.number(),
  creditorName: z.string().min(1, "Creditor name is required"),
  creditorUsername: z.string().optional(),
  debtorName: z.string().min(1, "Debtor name is required"),
  amount: z.number().positive("Amount must be positive"),
  currency: z
    .string()
    .length(3, "Currency must be a 3-letter code")
    .default("SGD"),
  description: z.string().optional(),
  threadId: z.number().optional(),
});

export const sendSettlementNotificationMessageHandler = async (
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

  // Format the amount as currency with error handling
  const formattedAmount = escapeMarkdown(
    formatCurrencyWithCode(input.amount, input.currency),
    2
  );

  // Escape names for MarkdownV2
  const escapedDebtorName = escapeMarkdown(input.debtorName, 2);

  // Create user mention - prefer username if available, otherwise use name with user ID
  let creditorMention: string;
  try {
    creditorMention = mentionMarkdown(
      input.creditorUserId,
      input.creditorName,
      2
    );
  } catch (error) {
    // Fallback to escaped plain name if mention creation fails
    creditorMention = escapeMarkdown(input.creditorName, 2);
  }

  // Create the settlement notification message with pre-escaped components
  const descriptionPart = input.description
    ? ` \\(${escapeMarkdown(input.description, 2)}\\)`
    : "";
  const message = `✅ Great news ${creditorMention}\\!\n${escapedDebtorName} has settled their debt of ${formattedAmount}${descriptionPart}\\!`;

  try {
    const sentMessage = await teleBot.sendMessage(input.chatId, message, {
      parse_mode: "MarkdownV2",
      message_thread_id: input.threadId,
    });

    return sentMessage.message_id;
  } catch (error) {
    console.error("Error sending settlement notification message:", error);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to send settlement notification: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
};

export default protectedProcedure
  .input(inputSchema)
  .mutation(async ({ input, ctx }) => {
    return sendSettlementNotificationMessageHandler(input, ctx.teleBot);
  });
