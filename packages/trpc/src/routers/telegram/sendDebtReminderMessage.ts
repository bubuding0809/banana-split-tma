import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../../trpc.js";
import { assertNotChatScoped } from "../../middleware/chatScope.js";
import { Telegram } from "telegraf";
import { mentionMarkdown, escapeMarkdown } from "../../utils/telegram.js";
import { formatCurrencyWithCode } from "../../utils/financial.js";

const inputSchema = z.object({
  chatId: z.number(),
  debtorUserId: z.number(),
  debtorName: z.string().min(1, "Debtor name is required"),
  debtorUsername: z.string().optional(),
  creditorName: z.string().min(1, "Creditor name is required"),
  amount: z.number().positive("Amount must be positive"),
  currency: z
    .string()
    .length(3, "Currency must be a 3-letter code")
    .default("SGD"),
  threadId: z.number().optional(),
});

export const sendDebtReminderMessageHandler = async (
  input: z.infer<typeof inputSchema>,
  teleBot: Telegram
) => {
  const formattedAmount = escapeMarkdown(
    formatCurrencyWithCode(input.amount, input.currency),
    2
  );

  // Escape names for MarkdownV2
  const escapedCreditorName = escapeMarkdown(input.creditorName, 2);

  // Create user mention - prefer username if available, otherwise use name with user ID
  let debtorMention: string;
  try {
    debtorMention = mentionMarkdown(input.debtorUserId, input.debtorName, 2); // Already escaped in mentionMarkdown
  } catch (error) {
    // Fallback to escaped plain name if mention creation fails
    debtorMention = escapeMarkdown(input.debtorName, 2);
  }

  // Create the reminder message with pre-escaped components
  const message = `💁 Hey ${debtorMention}, you still owe ${escapedCreditorName} ${formattedAmount}\\. Don't forget to settle up\\!`;

  // Send the message directly (no additional escaping needed)
  try {
    const sentMessage = await teleBot.sendMessage(input.chatId, message, {
      parse_mode: "MarkdownV2",
      message_thread_id: input.threadId,
    });

    return sentMessage.message_id;
  } catch (error) {
    console.error("Error sending debt reminder message:", error);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to send message: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
};

export default protectedProcedure
  .input(inputSchema)
  .mutation(async ({ input, ctx }) => {
    assertNotChatScoped(ctx.session);
    return sendDebtReminderMessageHandler(input, ctx.teleBot);
  });
