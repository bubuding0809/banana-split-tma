import { TRPCError } from "@trpc/server";
import { Telegram } from "telegraf";
import {
  formatExpenseMessage,
  ExpenseParticipant,
} from "./sendExpenseNotificationMessage.js";
import {
  escapeMarkdown,
  mentionMarkdown,
  createDeepLinkedUrl,
  toBase64Url,
} from "../../utils/telegram.js";
import { inlineKeyboard } from "telegraf/markup";

interface EditExpenseMessageInput {
  chatId: number;
  chatType: string;
  messageId: number;
  payerId: number;
  payerName: string;
  expenseDescription: string;
  totalAmount: number;
  participants: ExpenseParticipant[];
  currency: string;
  categoryEmoji?: string;
  categoryTitle?: string;
  threadId?: number;
}

interface SendExpenseUpdateBumpInput {
  chatId: number;
  replyToMessageId: number;
  updaterUserId: number;
  updaterName: string;
  threadId?: number;
}

/**
 * Edits an existing Telegram expense notification message with updated details
 */
export const editExpenseMessageHandler = async (
  input: EditExpenseMessageInput,
  teleBot: Telegram
): Promise<boolean> => {
  try {
    // Format the updated message using the shared formatter
    const message = formatExpenseMessage(
      input.payerId,
      input.payerName,
      input.expenseDescription,
      input.totalAmount,
      input.participants,
      input.currency,
      input.categoryEmoji,
      input.categoryTitle
    );

    // Create the deep link keyboard
    const chatContext = {
      chat_id: input.chatId,
      chat_type: input.chatType === "private" ? "p" : "g",
    };
    const base64EncodedChatContext = toBase64Url(JSON.stringify(chatContext));
    const botInfo = await teleBot.getMe();
    const deepLink = createDeepLinkedUrl(
      botInfo.username,
      base64EncodedChatContext,
      "app"
    );
    const keyboard = inlineKeyboard([
      { text: "View Balances 💸", url: deepLink },
    ]);

    // Edit the message
    await teleBot.editMessageText(
      input.chatId,
      input.messageId,
      undefined,
      message,
      {
        parse_mode: "MarkdownV2",
        ...keyboard,
      }
    );

    return true;
  } catch (error) {
    console.error("Error editing expense notification message:", error);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to edit expense notification: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
};

/**
 * Sends a small "bump" reply message to indicate the expense was updated
 */
export const sendExpenseUpdateBumpHandler = async (
  input: SendExpenseUpdateBumpInput,
  teleBot: Telegram
): Promise<number> => {
  try {
    // Create updater mention
    let updaterMention: string;
    try {
      updaterMention = mentionMarkdown(
        input.updaterUserId,
        input.updaterName,
        2
      );
    } catch (error) {
      updaterMention = escapeMarkdown(input.updaterName, 2);
    }

    const message = `📝 Expense updated by ${updaterMention}`;

    // Send the bump message as a reply to the original expense message
    const sentMessage = await teleBot.sendMessage(input.chatId, message, {
      parse_mode: "MarkdownV2",
      message_thread_id: input.threadId,
      reply_parameters: {
        message_id: input.replyToMessageId,
      },
    });

    return sentMessage.message_id;
  } catch (error) {
    console.error("Error sending expense update bump message:", error);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to send update bump: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
};
