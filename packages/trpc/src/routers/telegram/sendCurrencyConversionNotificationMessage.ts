import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db } from "../../trpc.js";
import { Telegram } from "telegraf";
import { mentionMarkdown, escapeMarkdown } from "../../utils/telegram.js";

const inputSchema = z.object({
  chatId: z.number(),
  actorUserId: z.number(),
  actorName: z.string().min(1, "Actor name is required"),
  actorUsername: z.string().optional(),
  fromCurrency: z.string().length(3, "fromCurrency must be a 3-letter code"),
  toCurrency: z.string().length(3, "toCurrency must be a 3-letter code"),
  rate: z.number().positive("Rate must be positive"),
  convertedExpenses: z.number().int().nonnegative(),
  convertedSettlements: z.number().int().nonnegative(),
  threadId: z.number().optional(),
  // Skip the message entirely when nothing actually got converted (caller
  // can short-circuit, but the flag keeps the contract explicit).
  force: z.boolean().default(false),
});

/**
 * Posts a "currency converted" announcement in the chat after a bulk
 * conversion completes. Skipped for private chats (no group to notify)
 * and when nothing was converted, unless `force` is set.
 */
export const sendCurrencyConversionNotificationMessageHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db,
  teleBot: Telegram
) => {
  if (input.chatId === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid chat ID. Cannot send message to chat ID 0.",
    });
  }

  const totalConverted = input.convertedExpenses + input.convertedSettlements;
  if (totalConverted === 0 && !input.force) {
    return null;
  }

  // Currency conversion in a personal chat is a self-action — no group
  // to notify. Skip silently to avoid sending a message to one's own DM.
  const chat = await db.chat.findUnique({
    where: { id: BigInt(input.chatId) },
    select: { type: true },
  });
  if (!chat) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Chat not found",
    });
  }
  if (chat.type === "private") {
    return null;
  }

  let actorMention: string;
  try {
    actorMention = mentionMarkdown(input.actorUserId, input.actorName, 2);
  } catch {
    actorMention = escapeMarkdown(input.actorName, 2);
  }

  const fromCode = escapeMarkdown(input.fromCurrency, 2);
  const toCode = escapeMarkdown(input.toCurrency, 2);
  const rateStr = escapeMarkdown(input.rate.toFixed(4), 2);

  const expensesLine =
    input.convertedExpenses === 1
      ? `${input.convertedExpenses} expense`
      : `${input.convertedExpenses} expenses`;
  const settlementsLine =
    input.convertedSettlements === 1
      ? `${input.convertedSettlements} settlement`
      : `${input.convertedSettlements} settlements`;
  const breakdown = escapeMarkdown(`${expensesLine}, ${settlementsLine}`, 2);

  const message =
    `💱 *Currency converted*\n\n` +
    `> 👤 • ${actorMention}\n` +
    `> 🌐 • ${fromCode} → ${toCode}\n` +
    `> 📊 • ${breakdown}\n` +
    `> 💱 • 1 ${fromCode} ≈ ${rateStr} ${toCode}`;

  try {
    const sentMessage = await teleBot.sendMessage(input.chatId, message, {
      parse_mode: "MarkdownV2",
      message_thread_id: input.threadId,
    });
    return sentMessage.message_id;
  } catch (error) {
    console.error(
      "Error sending currency conversion notification message:",
      error
    );
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to send currency conversion notification: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    });
  }
};
