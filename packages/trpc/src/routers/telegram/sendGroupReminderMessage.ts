import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../../trpc.js";
import { Telegram } from "telegraf";
import { escapeMarkdown, mentionMarkdown } from "../../utils/telegram.js";
import { formatCurrencyWithCode } from "../../utils/financial.js";
import { getChatHandler } from "../chat/getChat.js";
import { getSimplifiedDebtsHandler } from "../chat/getSimplifiedDebts.js";
import { getNetShareHandler } from "../expenseShare/getNetShare.js";
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

  // Get chat details including threadId and debtSimplificationEnabled
  const chat = await getChatHandler({ chatId: chatIdNumber }, db);

  if (!chat) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `Chat not found: ${input.chatId}`,
    });
  }

  // Get currencies used in this chat
  const currenciesWithBalance = await getCurrenciesWithBalanceHandler(
    { userId: BigInt(0), chatId: BigInt(chatIdNumber) }, // Use dummy userId since we want all currencies
    db
  );

  if (currenciesWithBalance.length === 0) {
    return {
      messageId: null,
      success: true,
      timestamp: new Date(),
      reason: "No currencies with balances found in chat",
    };
  }

  // Get chat members for name resolution
  const members = await getMembersHandler({ chatId: chatIdNumber }, db);

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
    // Use simplified debts
    for (const currencyInfo of currenciesWithBalance) {
      const simplifiedDebts = await getSimplifiedDebtsHandler(
        { chatId: chatIdNumber, currency: currencyInfo.currency.code },
        db
      );

      for (const debt of simplifiedDebts.simplifiedDebts) {
        if (debt.amount > 0.01) {
          // Only include significant amounts
          debtSummary.push({
            debtorId: debt.fromUserId,
            creditorId: debt.toUserId,
            amount: debt.amount,
            currency: currencyInfo.currency.code,
          });
        }
      }
    }
  } else {
    // Use normal debts - calculate net shares between all member pairs
    for (const currencyInfo of currenciesWithBalance) {
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          const member1 = members[i];
          const member2 = members[j];
          if (!member1 || !member2) continue;

          const member1Id = Number(member1.id);
          const member2Id = Number(member2.id);

          const netShare = await getNetShareHandler(
            {
              mainUserId: member1Id,
              targetUserId: member2Id,
              chatId: chatIdNumber,
              currency: currencyInfo.currency.code,
            },
            db
          );

          if (Math.abs(netShare) > 0.01) {
            // Only include significant amounts
            if (netShare > 0) {
              // member2 owes member1
              debtSummary.push({
                debtorId: member2Id,
                creditorId: member1Id,
                amount: netShare,
                currency: currencyInfo.currency.code,
              });
            } else {
              // member1 owes member2
              debtSummary.push({
                debtorId: member1Id,
                creditorId: member2Id,
                amount: Math.abs(netShare),
                currency: currencyInfo.currency.code,
              });
            }
          }
        }
      }
    }
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
  let messageLines = ["⏰ *Looks like there are still pending debts here!"];

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

  try {
    const sentMessage = await teleBot.sendMessage(
      chatIdNumber,
      messageContent,
      {
        parse_mode: "MarkdownV2",
        message_thread_id: chat.threadId || undefined,
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
