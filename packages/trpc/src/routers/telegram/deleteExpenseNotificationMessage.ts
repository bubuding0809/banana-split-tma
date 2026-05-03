import { TRPCError } from "@trpc/server";
import { Telegram } from "telegraf";
import { type Logger } from "@repo/logger";
import { trpcLogger } from "../../trpc.js";

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
  teleBot: Telegram,
  log: Logger = trpcLogger
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
      log.error(
        {
          err: error,
          message_id: messageId,
          chat_id: input.chatId,
        },
        "telegram.expenseMessage.delete.failed"
      );

      // Continue with other deletions even if one fails
      // This handles cases where:
      // - Message is already deleted
      // - Message is too old (>48 hours in some cases)
      // - Bot doesn't have permission
      // - Message doesn't exist
    }
  }

  log.info(
    {
      chat_id: input.chatId,
      deleted_count: deletedCount,
      failed_count: failedCount,
      total: messageIdsToDelete.length,
    },
    "telegram.expenseMessage.deleteBatch.done"
  );

  return { deletedCount, failedCount };
};
