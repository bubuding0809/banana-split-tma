import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../../trpc.js";
import { Telegram } from "telegraf";
import {
  escapeMarkdown,
  mentionMarkdown,
  createDeepLinkedUrl,
} from "../../utils/telegram.js";
import { formatCurrencyWithCode } from "../../utils/financial.js";
import { inlineKeyboard } from "telegraf/markup";
import { getChatHandler } from "../chat/getChat.js";
import { getSimplifiedDebtsHandler } from "../chat/getSimplifiedDebts.js";
import { getBulkChatDebtsHandler } from "../chat/getBulkChatDebts.js";
import { getMembersHandler } from "../chat/getMembers.js";
import { getCurrenciesWithBalanceHandler } from "../currency/getCurrenciesWithBalance.js";

const inputSchema = z.object({
  chatId: z.string().min(1, "Chat ID is required"),
});

const outputSchema = z.object({
  messageId: z
    .number()
    .nullable()
    .describe("ID of the sent message, null if no message was sent"),
  success: z.boolean().describe("Whether the operation was successful"),
  timestamp: z.date().describe("When the operation was completed"),
  reason: z
    .string()
    .optional()
    .describe("Reason why no message was sent (when messageId is null)"),
});

export const sendGroupReminderMessageHandler = async (
  input: z.infer<typeof inputSchema>,
  teleBot: Telegram,
  db: any
) => {
  // Convert string chatId to number for database queries
  let chatIdNumber: number;
  try {
    chatIdNumber = parseInt(input.chatId, 10);
    if (isNaN(chatIdNumber)) {
      throw new Error("Invalid chat ID format");
    }
  } catch (error) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Invalid chat ID: ${input.chatId}. Must be a numeric string.`,
    });
  }

  // Parallel fetch of initial data for better performance
  const [chat, currenciesWithBalance, members] = await Promise.all([
    getChatHandler({ chatId: chatIdNumber }, db),
    getCurrenciesWithBalanceHandler(
      { userId: BigInt(0), chatId: BigInt(chatIdNumber) }, // Use dummy userId since we want all currencies
      db
    ),
    getMembersHandler({ chatId: chatIdNumber }, db),
  ]);

  if (!chat) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `Chat not found: ${input.chatId}`,
    });
  }

  if (currenciesWithBalance.length === 0) {
    return {
      messageId: null,
      success: true,
      timestamp: new Date(),
      reason: "No currencies with balances found in chat",
    };
  }

  if (!members || members.length === 0) {
    return {
      messageId: null,
      success: true,
      timestamp: new Date(),
      reason: "No members found in chat",
    };
  }

  const memberMap = new Map(members.map((m) => [Number(m.id), m]));

  let debtSummary: Array<{
    debtorId: number;
    creditorId: number;
    amount: number;
    currency: string;
  }> = [];

  // Conditional debt fetching based on debtSimplificationEnabled
  if (chat.debtSimplificationEnabled) {
    // Use simplified debts with parallel processing
    const currencies = currenciesWithBalance.map((c) => c.currency.code);
    const simplifiedDebtsResults = await Promise.all(
      currencies.map((currency) =>
        getSimplifiedDebtsHandler({ chatId: chatIdNumber, currency }, db)
      )
    );

    // Process all simplified debts results
    simplifiedDebtsResults.forEach((result, index) => {
      const currency = currencies[index];
      if (!currency) return;

      for (const debt of result.simplifiedDebts) {
        if (debt.amount > 0.01) {
          // Only include significant amounts
          debtSummary.push({
            debtorId: debt.fromUserId,
            creditorId: debt.toUserId,
            amount: debt.amount,
            currency,
          });
        }
      }
    });
  } else {
    // Use bulk debt calculation - MUCH faster than individual queries
    const currencies = currenciesWithBalance.map((c) => c.currency.code);
    const bulkDebtsResult = await getBulkChatDebtsHandler(
      { chatId: chatIdNumber, currencies },
      db
    );

    debtSummary = bulkDebtsResult.debts;
  }

  if (debtSummary.length === 0) {
    return {
      messageId: null,
      success: true,
      timestamp: new Date(),
      reason: "No pending debts found in chat",
    };
  }

  // Group debts by debtor
  const debtsByDebtor = new Map<
    number,
    Array<{ creditorId: number; amount: number; currency: string }>
  >();

  for (const debt of debtSummary) {
    if (!debtsByDebtor.has(debt.debtorId)) {
      debtsByDebtor.set(debt.debtorId, []);
    }
    debtsByDebtor.get(debt.debtorId)!.push({
      creditorId: debt.creditorId,
      amount: debt.amount,
      currency: debt.currency,
    });
  }

  // Format the message
  let messageLines = ["⏰ *Looks like there are still pending debts here\\!*"];

  for (const [debtorId, creditors] of debtsByDebtor.entries()) {
    const debtor = memberMap.get(debtorId);
    if (!debtor) continue;

    // Create user mention for debtor
    let debtorMention: string;
    try {
      debtorMention = mentionMarkdown(
        debtorId,
        debtor.username || debtor.firstName || "Unknown",
        2
      );
    } catch (error) {
      debtorMention = escapeMarkdown(
        debtor.username || debtor.firstName || "Unknown",
        2
      );
    }

    messageLines.push(`\n${debtorMention}`);

    // Sort creditors by name for consistent ordering
    creditors.sort((a, b) => {
      const creditorA = memberMap.get(a.creditorId);
      const creditorB = memberMap.get(b.creditorId);
      const nameA = creditorA?.username || creditorA?.firstName || "Unknown";
      const nameB = creditorB?.username || creditorB?.firstName || "Unknown";
      return nameA.localeCompare(nameB);
    });

    creditors.forEach((creditor, index) => {
      const creditorMember = memberMap.get(creditor.creditorId);
      if (!creditorMember) return;

      const creditorName =
        creditorMember.username || creditorMember.firstName || "Unknown";
      const formattedAmount = escapeMarkdown(
        formatCurrencyWithCode(creditor.amount, creditor.currency),
        2
      );
      const prefix = index === creditors.length - 1 ? "└" : "├";

      messageLines.push(
        `${prefix} Owes ${escapeMarkdown(creditorName, 2)}: ${formattedAmount}`
      );
    });
  }

  const messageContent = messageLines.join("\n");

  // Create deep link to mini app
  const chatContext = {
    chat_id: chatIdNumber,
    chat_type: "g",
  };
  const base64EncodedChatContext = btoa(JSON.stringify(chatContext));
  const botInfo = await teleBot.getMe();
  const deepLink = createDeepLinkedUrl(
    botInfo.username,
    base64EncodedChatContext,
    "app"
  );
  const keyboard = inlineKeyboard([{ text: "View Debts 💰", url: deepLink }]);

  try {
    const sentMessage = await teleBot.sendMessage(
      chatIdNumber,
      messageContent,
      {
        parse_mode: "MarkdownV2",
        message_thread_id: chat.threadId || undefined,
        ...keyboard,
      }
    );

    return {
      messageId: sentMessage.message_id,
      success: true,
      timestamp: new Date(),
    };
  } catch (error) {
    console.error("Error sending group reminder message:", error);

    // Handle specific Telegram API errors
    if (error instanceof Error) {
      if (error.message.includes("chat not found")) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Chat not found: ${input.chatId}`,
        });
      }
      if (error.message.includes("bot is not a member")) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Bot is not a member of chat: ${input.chatId}`,
        });
      }
      if (error.message.includes("group is deactivated")) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Group is deactivated: ${input.chatId}`,
        });
      }
    }

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to send group reminder message: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
};

export default protectedProcedure
  .meta({
    openapi: {
      method: "POST",
      path: "/telegram/group-reminder/send",
      tags: ["telegram", "reminders"],
      summary: "Send group reminder message",
      description:
        "Sends a reminder message to a Telegram group. Can be used by automated systems like AWS Lambda to send scheduled reminders.",
    },
  })
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    return sendGroupReminderMessageHandler(input, ctx.teleBot, ctx.db);
  });
