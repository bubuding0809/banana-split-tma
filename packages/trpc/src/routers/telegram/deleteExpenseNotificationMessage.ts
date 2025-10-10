import { TRPCError } from "@trpc/server";
import { Telegram } from "telegraf";

interface DeleteExpenseMessagesInput {
  chatId: number;
  telegramMessageId?: bigint | null;
  telegramUpdateBumpMessageIds?: bigint[];
}

/**
 * Deletes the original expense message and all update bump messages from Telegram
 * This function is best-effort and logs errors without throwing to ensure database
 * deletion can proceed even if Telegram message deletion fails
 */
export const deleteExpenseMessagesHandler = async (
  input: DeleteExpenseMessagesInput,
  teleBot: Telegram
): Promise<{ deletedCount: number; failedCount: number }> => {
  let deletedCount = 0;
  let failedCount = 0;

  // Collect all message IDs to delete
  const messageIdsToDelete: number[] = [];

  if (input.telegramMessageId) {
    messageIdsToDelete.push(Number(input.telegramMessageId));
  }

  if (
    input.telegramUpdateBumpMessageIds &&
    input.telegramUpdateBumpMessageIds.length > 0
  ) {
    messageIdsToDelete.push(
      ...input.telegramUpdateBumpMessageIds.map((id) => Number(id))
    );
  }

  // If no messages to delete, return early
  if (messageIdsToDelete.length === 0) {
    return { deletedCount: 0, failedCount: 0 };
  }

  // Delete each message individually
  // Telegram API doesn't support bulk message deletion for regular chats
  for (const messageId of messageIdsToDelete) {
    try {
      await teleBot.deleteMessage(input.chatId, messageId);
      deletedCount++;
    } catch (error) {
      failedCount++;
      console.error(
        `Failed to delete Telegram message ${messageId} in chat ${input.chatId}:`,
        error instanceof Error ? error.message : String(error)
      );

      // Continue with other deletions even if one fails
      // This handles cases where:
      // - Message is already deleted
      // - Message is too old (>48 hours in some cases)
      // - Bot doesn't have permission
      // - Message doesn't exist
    }
  }

  console.log(
    `Telegram message deletion summary for chat ${input.chatId}: ` +
      `${deletedCount} deleted, ${failedCount} failed out of ${messageIdsToDelete.length} total`
  );

  return { deletedCount, failedCount };
};
