import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertNotChatScoped } from "../../middleware/chatScope.js";
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
  force: z.boolean().default(false),
});

export const sendSettlementNotificationMessageHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db,
  teleBot: Telegram
) => {
  // Validate business logic
  if (input.chatId === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid chat ID. Cannot send message to chat ID 0.",
    });
  }

  // Respect the per-chat notification preference unless caller explicitly forces.
  if (!input.force) {
    const chat = await db.chat.findUnique({
      where: { id: BigInt(input.chatId) },
      select: { notifyOnSettlement: true },
    });
    if (!chat?.notifyOnSettlement) {
      return null;
    }
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
  .input(inputSchema.omit({ force: true }))
  .mutation(async ({ input, ctx }) => {
    assertNotChatScoped(ctx.session);
    return sendSettlementNotificationMessageHandler(
      { ...input, force: false },
      ctx.db,
      ctx.teleBot
    );
  });
