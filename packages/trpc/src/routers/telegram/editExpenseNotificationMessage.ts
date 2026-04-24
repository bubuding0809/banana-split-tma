import { TRPCError } from "@trpc/server";
import { Telegram } from "telegraf";
import {
  formatExpenseMessage,
  ExpenseParticipant,
  ExpenseChangedField,
} from "./sendExpenseNotificationMessage.js";
import {
  escapeMarkdown,
  mentionMarkdown,
  createDeepLinkedUrl,
} from "../../utils/telegram.js";
import { encodeV1DeepLink } from "../../utils/deepLinkProtocol.js";
import { inlineKeyboard } from "telegraf/markup";

interface EditExpenseMessageInput {
  chatId: number;
  chatType: string;
  // Expense UUID — deep link target for the "View Expense" CTA so the
  // tapper lands on the specific expense, not just the chat.
  expenseId: string;
  messageId: number;
  payerId: number;
  payerName: string;
  expenseDescription: string;
  totalAmount: number;
  participants: ExpenseParticipant[];
  currency: string;
  expenseDate: Date;
  categoryEmoji?: string;
  categoryTitle?: string;
  // Fields that actually changed in this update. Each gets a trailing
  // ✏️ in the rendered message; empty/undefined means no markers.
  changedFields?: readonly ExpenseChangedField[];
  threadId?: number;
}

interface SendExpenseUpdateBumpInput {
  chatId: number;
  replyToMessageId: number;
  updaterUserId: number;
  updaterName: string;
  threadId?: number;
}

interface SendExpenseUpdateStandaloneInput {
  chatId: number;
  // chatType drives the deep-link protocol's `g` vs `p` segment so the
  // TMA start_param lands the user in the right chat context.
  chatType: string;
  // Expense UUID — target of the "View Expense" CTA on the bubble.
  expenseId: string;
  // Post-update description. Included in the bubble text so readers can
  // tell *which* expense was updated without tapping through.
  expenseDescription: string;
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
    // Format the updated message using the shared formatter. isUpdate
    // flips the title from "🧾 New Expense" to "🧾 Expense"; changedFields
    // places ✏️ markers on whatever actually changed.
    const message = formatExpenseMessage(
      input.payerId,
      input.payerName,
      input.expenseDescription,
      input.totalAmount,
      input.participants,
      input.currency,
      input.expenseDate,
      input.categoryEmoji,
      input.categoryTitle,
      { isUpdate: true, changedFields: input.changedFields }
    );

    // Build the "View Expense" deep link payload. Uses the v1 protocol
    // with entity_type="e" so the TMA can route straight to the
    // edit-expense page on tap.
    const botInfo = await teleBot.getMe();
    const deepLinkPayload = encodeV1DeepLink(
      BigInt(input.chatId),
      input.chatType === "private" ? "p" : "g",
      "e",
      input.expenseId
    );
    const deepLink = createDeepLinkedUrl(
      botInfo.username,
      deepLinkPayload,
      "app"
    );
    const keyboard = inlineKeyboard([{ text: "View Expense", url: deepLink }]);

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
 * Sends a standalone "expense updated" message with a "View Expense"
 * inline button. Used when the original full notification has been
 * removed from the chat (user deleted it, retention, etc.) or was never
 * posted — we don't re-post the full notification, we just surface the
 * change minimally and let the user tap through to the TMA for the
 * current state.
 */
export const sendExpenseUpdateStandaloneHandler = async (
  input: SendExpenseUpdateStandaloneInput,
  teleBot: Telegram
): Promise<number> => {
  try {
    let updaterMention: string;
    try {
      updaterMention = mentionMarkdown(
        input.updaterUserId,
        input.updaterName,
        2
      );
    } catch {
      updaterMention = escapeMarkdown(input.updaterName, 2);
    }

    // Standalone bumps have no reply parent to carry the context, so the
    // inline button is the user's only way to see the actual expense.
    // Normal (reply) bumps skip the button — their parent already has one.
    const botInfo = await teleBot.getMe();
    const deepLinkPayload = encodeV1DeepLink(
      BigInt(input.chatId),
      input.chatType === "private" ? "p" : "g",
      "e",
      input.expenseId
    );
    const deepLink = createDeepLinkedUrl(
      botInfo.username,
      deepLinkPayload,
      "app"
    );
    const keyboard = inlineKeyboard([{ text: "View Expense", url: deepLink }]);

    // Description rendered as a MarkdownV2 blockquote so it visually
    // sits under the header as a quoted expense identifier, matching
    // the "> 📝 • …" style used by the full notification.
    const escapedDescription = escapeMarkdown(input.expenseDescription, 2);
    const message = `📝 Expense updated by ${updaterMention}\n> ${escapedDescription}`;

    const sentMessage = await teleBot.sendMessage(input.chatId, message, {
      parse_mode: "MarkdownV2",
      message_thread_id: input.threadId,
      ...keyboard,
    });

    return sentMessage.message_id;
  } catch (error) {
    console.error("Error sending standalone expense update message:", error);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to send standalone update: ${error instanceof Error ? error.message : "Unknown error"}`,
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
