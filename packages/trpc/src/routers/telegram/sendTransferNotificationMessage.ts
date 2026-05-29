import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { type Logger } from "@repo/logger";
import { Db, trpcLogger } from "../../trpc.js";
import { Telegram } from "telegraf";
import { mentionMarkdown, escapeMarkdown } from "../../utils/telegram.js";
import { formatCurrencyWithCode } from "../../utils/financial.js";

export const inputSchema = z.object({
  chatId: z.number(),
  direction: z.enum(["out", "in"]),
  debtorId: z.number(),
  debtorName: z.string().min(1),
  creditorId: z.number(),
  creditorName: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().length(3).default("SGD"),
  counterpartChatTitle: z.string().min(1),
  threadId: z.number().optional(),
  force: z.boolean().default(false),
});

/**
 * Posts a transfer announcement into one group chat. Called once per affected
 * chat: the source chat (direction "out", debt removed) and the target chat
 * (direction "in", debt added). Gated on the chat's notifyOnTransfer
 * preference.
 */
export const sendTransferNotificationMessageHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db,
  teleBot: Telegram,
  log: Logger = trpcLogger
) => {
  if (input.chatId === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid chat ID. Cannot send message to chat ID 0.",
    });
  }

  if (!input.force) {
    const chat = await db.chat.findUnique({
      where: { id: BigInt(input.chatId) },
      select: { notifyOnTransfer: true },
    });
    if (!chat?.notifyOnTransfer) {
      return null;
    }
  }

  const formattedAmount = escapeMarkdown(
    formatCurrencyWithCode(input.amount, input.currency),
    2
  );
  const counterpart = escapeMarkdown(input.counterpartChatTitle, 2);

  const mentionOrName = (id: number, name: string) => {
    try {
      return mentionMarkdown(id, name, 2);
    } catch {
      return escapeMarkdown(name, 2);
    }
  };
  const debtorMention = mentionOrName(input.debtorId, input.debtorName);
  const creditorMention = mentionOrName(input.creditorId, input.creditorName);

  const heading =
    input.direction === "out"
      ? "↪ *Debt transferred out*"
      : "↩ *Debt transferred in*";
  const movement =
    input.direction === "out"
      ? `moved to *${counterpart}*`
      : `moved from *${counterpart}*`;

  const message = `${heading}\n${debtorMention} → ${creditorMention}: *${formattedAmount}* ${movement}\\.`;

  try {
    const sent = await teleBot.sendMessage(input.chatId, message, {
      parse_mode: "MarkdownV2",
      message_thread_id: input.threadId,
    });
    return sent.message_id;
  } catch (error) {
    log.error({ err: error }, "telegram.transferNotification.send.failed");
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to send transfer notification: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
      cause: error,
    });
  }
};
