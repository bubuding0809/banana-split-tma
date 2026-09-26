import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { type Logger } from "@repo/logger";
import { Db, protectedProcedure, trpcLogger } from "../../trpc.js";
import { assertNotChatScoped } from "../../middleware/chatScope.js";
import type { Api } from "grammy";
import {
  mentionMarkdown,
  escapeMarkdown,
  createDeepLinkedUrl,
  inlineKeyboard,
} from "../../utils/telegram.js";
import { encodeV1DeepLink } from "../../utils/deepLinkProtocol.js";
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
  kind: z.enum(["settle_up", "payment"]).default("settle_up"),
  debtorUserId: z.number().optional(),
  mentionTarget: z.enum(["creditor", "debtor"]).default("creditor"),
  settlementId: z.string().uuid().optional(),
});

export const sendSettlementNotificationMessageHandler = async (
  input: z.input<typeof inputSchema>,
  db: Db,
  teleBot: Api,
  log: Logger = trpcLogger
) => {
  const kind = input.kind ?? "settle_up";
  const mentionTarget = input.mentionTarget ?? "creditor";
  const currency = input.currency ?? "SGD";

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
    formatCurrencyWithCode(input.amount, currency),
    2
  );

  const safeMention = (userId: number | undefined, name: string) => {
    if (userId === undefined) return escapeMarkdown(name, 2);
    try {
      return mentionMarkdown(userId, name, 2);
    } catch {
      return escapeMarkdown(name, 2);
    }
  };

  const descriptionPart = input.description
    ? ` \\(${escapeMarkdown(input.description, 2)}\\)`
    : "";

  let message: string;
  if (kind === "payment") {
    const tagDebtor = mentionTarget === "debtor";
    const payer = tagDebtor
      ? safeMention(input.debtorUserId, input.debtorName)
      : escapeMarkdown(input.debtorName, 2);
    const receiver = tagDebtor
      ? escapeMarkdown(input.creditorName, 2)
      : safeMention(input.creditorUserId, input.creditorName);
    message = `💸 ${payer} paid ${receiver} ${formattedAmount}${descriptionPart}`;
  } else {
    const creditorMention = safeMention(
      input.creditorUserId,
      input.creditorName
    );
    const escapedDebtorName = escapeMarkdown(input.debtorName, 2);
    message = `✅ Great news ${creditorMention}\\!\n${escapedDebtorName} has settled their debt of ${formattedAmount}${descriptionPart}\\!`;
  }

  let keyboard = {};
  if (input.settlementId) {
    try {
      const botInfo = await teleBot.getMe();
      const chatTypeCode = input.chatId < 0 ? "g" : "p";
      const payload = encodeV1DeepLink(
        BigInt(input.chatId),
        chatTypeCode,
        "st",
        input.settlementId
      );
      keyboard = inlineKeyboard([
        {
          text: "View payment",
          url: createDeepLinkedUrl(botInfo.username, payload, "app"),
        },
      ]);
    } catch (error) {
      log.warn({ err: error }, "telegram.settlementNotification.button.failed");
    }
  }

  try {
    const sentMessage = await teleBot.sendMessage(input.chatId, message, {
      parse_mode: "MarkdownV2",
      message_thread_id: input.threadId,
      ...keyboard,
    });

    return sentMessage.message_id;
  } catch (error) {
    log.error({ err: error }, "telegram.settlementNotification.send.failed");
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to send settlement notification: ${error instanceof Error ? error.message : "Unknown error"}`,
      cause: error,
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
      ctx.teleBot,
      ctx.log
    );
  });
