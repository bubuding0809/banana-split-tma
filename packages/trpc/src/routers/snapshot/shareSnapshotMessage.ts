import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Db, protectedProcedure } from "../../trpc.js";
import {
  escapeMarkdown,
  mentionMarkdown,
  createDeepLinkedUrl,
} from "../../utils/telegram.js";
import {
  toDecimal,
  formatCurrencyWithCode,
  isSignificantBalance,
} from "../../utils/financial.js";
import { encodeV1DeepLink } from "../../utils/deepLinkProtocol.js";
import { inlineKeyboard } from "telegraf/markup";
import { Telegram } from "telegraf";
import { Prisma } from "@dko/database";
import { getMultipleRatesHandler } from "../currency/getMultipleRates.js";
import { simplifyDebts } from "../../utils/debtSimplification.js";

const MAX_DISPLAYED_USERS = 15;

const inputSchema = z.object({
  snapshotId: z.string().uuid(),
});

export const shareSnapshotMessageHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db,
  teleBot: Telegram,
  userId: bigint
) => {
  // 1. Fetch snapshot details
  const snapshot = await db.expenseSnapshot.findUnique({
    where: { id: input.snapshotId },
    include: {
      chat: {
        include: {
          members: {
            where: { id: userId }, // Optimization: Only query current user
          },
        },
      },
      expenses: {
        include: {
          payer: true,
          shares: {
            include: { user: true },
          },
        },
      },
      creator: true,
    },
  });

  if (!snapshot) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Snapshot not found" });
  }

  // 2. Authorize
  const isMember = snapshot.chat.members.length > 0;
  if (!isMember) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Not a member of this chat",
    });
  }

  // 4. Calculate total spent and individual net balances
  let totalSpent = toDecimal(0);

  // Track member info to easily render mentions later
  const memberMap = new Map<bigint, { name: string; username?: string }>();

  // Track net balance for each user: positive = creditor, negative = debtor
  const netBalances = new Map<bigint, Prisma.Decimal>();

  // Track pairwise unsimplified debts: key is `${debtorId}_${creditorId}`
  const pairwiseDebts = new Map<string, Prisma.Decimal>();

  // Use chat's base currency if available, otherwise snapshot's, fallback to SGD
  const currencyCode = snapshot.chat.baseCurrency || snapshot.currency || "SGD";

  // 4a. Fetch conversion rates for foreign currencies
  const targetCurrencies = Array.from(
    new Set(
      snapshot.expenses
        .map((e) => e.currency)
        .filter((c) => c !== currencyCode && !!c)
    )
  );

  let ratesMap: Record<string, { rate: number }> = {};
  if (targetCurrencies.length > 0) {
    try {
      const rateResult = await getMultipleRatesHandler(
        {
          baseCurrency: currencyCode,
          targetCurrencies,
          fallbackBaseCurrency: "USD",
          autoRefresh: true,
        },
        db
      );
      ratesMap = rateResult.rates;
    } catch (error) {
      console.warn("Failed to fetch rates for snapshot sharing", error);
    }
  }

  snapshot.expenses.forEach((expense) => {
    // Determine conversion rate
    let rate = 1;
    if (expense.currency !== currencyCode) {
      rate = ratesMap[expense.currency]?.rate || 1;
    }

    // Convert amount to base currency
    const amountInBaseCurrency = toDecimal(expense.amount).dividedBy(rate);

    totalSpent = totalSpent.plus(amountInBaseCurrency);

    // Member tracking
    memberMap.set(expense.payerId, {
      name: expense.payer.firstName,
      username: expense.payer.username || undefined,
    });

    // Update payer net balance
    const payerBalance = netBalances.get(expense.payerId) || toDecimal(0);
    netBalances.set(expense.payerId, payerBalance.plus(amountInBaseCurrency));

    // Sum shares
    expense.shares.forEach((share) => {
      // Member tracking
      memberMap.set(share.userId, {
        name: share.user.firstName,
        username: share.user.username || undefined,
      });

      const shareAmount = share.amount ? toDecimal(share.amount) : toDecimal(0);
      const shareAmountInBaseCurrency = shareAmount.dividedBy(rate);

      // Update share net balance
      const shareBalance = netBalances.get(share.userId) || toDecimal(0);
      netBalances.set(
        share.userId,
        shareBalance.minus(shareAmountInBaseCurrency)
      );

      // Update unsimplified pairwise debts
      if (
        share.userId !== expense.payerId &&
        shareAmountInBaseCurrency.greaterThan(0)
      ) {
        const key1 = `${share.userId}_${expense.payerId}`; // A owes B
        const key2 = `${expense.payerId}_${share.userId}`; // B owes A

        const currentDebt = pairwiseDebts.get(key1) || toDecimal(0);
        const currentReverseDebt = pairwiseDebts.get(key2) || toDecimal(0);

        if (currentReverseDebt.greaterThan(0)) {
          if (currentReverseDebt.greaterThan(shareAmountInBaseCurrency)) {
            pairwiseDebts.set(
              key2,
              currentReverseDebt.minus(shareAmountInBaseCurrency)
            );
          } else {
            pairwiseDebts.delete(key2);
            if (shareAmountInBaseCurrency.greaterThan(currentReverseDebt)) {
              pairwiseDebts.set(
                key1,
                shareAmountInBaseCurrency.minus(currentReverseDebt)
              );
            }
          }
        } else {
          pairwiseDebts.set(key1, currentDebt.plus(shareAmountInBaseCurrency));
        }
      }
    });
  });

  // 5. Generate Debt Summary
  let debtSummary: Array<{
    debtorId: number;
    creditorId: number;
    amount: number;
  }> = [];

  if (snapshot.chat.debtSimplificationEnabled) {
    const numericBalances = new Map<number, number>();
    netBalances.forEach((balance, userId) => {
      numericBalances.set(Number(userId), balance.toNumber());
    });

    const simplified = simplifyDebts(numericBalances);
    debtSummary = simplified.map((debt) => ({
      debtorId: debt.fromUserId,
      creditorId: debt.toUserId,
      amount: debt.amount,
    }));
  } else {
    pairwiseDebts.forEach((amount, key) => {
      if (isSignificantBalance(amount)) {
        const [debtorStr, creditorStr] = key.split("_");
        if (debtorStr && creditorStr) {
          debtSummary.push({
            debtorId: Number(debtorStr),
            creditorId: Number(creditorStr),
            amount: amount.toNumber(),
          });
        }
      }
    });
  }

  // 6. Format Telegram Message
  const creatorMention = snapshot.creator.username
    ? `@${escapeMarkdown(snapshot.creator.username, 2)}`
    : mentionMarkdown(
        Number(snapshot.creatorId),
        snapshot.creator.firstName,
        2
      );

  const formattedTotal = formatCurrencyWithCode(
    totalSpent.toNumber(),
    currencyCode
  ).replace(/\u00A0/g, " ");
  const escapedTotal = escapeMarkdown(formattedTotal, 2);
  const escapedTitle = escapeMarkdown(snapshot.title, 2);

  // NOTE: Static formatting like `*` for bold must NOT be escaped, only the dynamic values and literal chars
  const messageLines: string[] = [
    `📊 *${escapedTitle}* shared by ${creatorMention}`,
    `Total spent: *${escapedTotal}* \\(${snapshot.expenses.length} expenses\\)`,
  ];

  if (debtSummary.length > 0) {
    // Group debts by debtor
    const debtsByDebtor = new Map<
      number,
      Array<{ creditorId: number; amount: number }>
    >();

    debtSummary.forEach((debt) => {
      if (!debtsByDebtor.has(debt.debtorId)) {
        debtsByDebtor.set(debt.debtorId, []);
      }
      debtsByDebtor.get(debt.debtorId)!.push(debt);
    });
    
    // Sort debtors by highest total debt first
    const sortedDebtors = Array.from(debtsByDebtor.keys()).sort((a, b) => {
      const totalA = debtsByDebtor.get(a)!.reduce((sum, d) => sum + d.amount, 0);
      const totalB = debtsByDebtor.get(b)!.reduce((sum, d) => sum + d.amount, 0);
      return totalB - totalA;
    });

    const topDebtors = sortedDebtors.slice(0, MAX_DISPLAYED_USERS);

    topDebtors.forEach((debtorId) => {
      const creditors = debtsByDebtor.get(debtorId)!;
      const debtor = memberMap.get(BigInt(debtorId));
      
      if (!debtor) return;

      let debtorMention = "";
      if (debtor.username) {
        debtorMention = `@${escapeMarkdown(debtor.username, 2)}`;
      } else {
        debtorMention = mentionMarkdown(
          debtorId,
          debtor.username || debtor.name || "Unknown",
          2
        );
      }

      messageLines.push(`\n🙇 ${debtorMention}`);

      // Sort creditors by name for consistent ordering
      creditors.sort((a, b) => {
        const creditorA = memberMap.get(BigInt(a.creditorId));
        const creditorB = memberMap.get(BigInt(b.creditorId));
        const nameA = creditorA?.username || creditorA?.name || "Unknown";
        const nameB = creditorB?.username || creditorB?.name || "Unknown";
        return nameA.localeCompare(nameB);
      });

      creditors.forEach((creditor, index) => {
        const creditorMember = memberMap.get(BigInt(creditor.creditorId));
        if (!creditorMember) return;

        const formattedAmount = escapeMarkdown(
          formatCurrencyWithCode(creditor.amount, currencyCode),
          2
        );
        const prefix = index === creditors.length - 1 ? "┗" : "┣";

        messageLines.push(
          `${prefix} Owes ${escapeMarkdown(creditorMember.name, 2)}: ${formattedAmount}`
        );
      });
    });

    if (sortedDebtors.length > MAX_DISPLAYED_USERS) {
      messageLines.push(
        `\nand ${escapeMarkdown((sortedDebtors.length - MAX_DISPLAYED_USERS).toString(), 2)} others\\.\\.\\.`
      );
    }
    
    if (snapshot.chat.debtSimplificationEnabled) {
      messageLines.push(
        "\n>Debts simplification is enabled\\. What you see is the minimal set of debts to settle among members\\."
      );
    }
  } else {
    messageLines.push("\n>✅ All debts are settled\\!");
  }

  const message = messageLines.join("\n");

  // 7. Generate deep link
  let payload = "";
  try {
    payload = encodeV1DeepLink(
      snapshot.chatId,
      snapshot.chat.type === "private" ? "p" : "g",
      "s",
      snapshot.id
    );
  } catch (e) {
    payload = "mock_payload";
  }

  const botInfo = await teleBot.getMe();
  const deepLink = createDeepLinkedUrl(botInfo.username, payload, "app");
  const keyboard = inlineKeyboard([
    { text: "View Snapshot 📊", url: deepLink },
  ]);

  // 8. Send message
  try {
    await teleBot.sendMessage(Number(snapshot.chatId), message, {
      parse_mode: "MarkdownV2",
      ...(snapshot.chat.threadId
        ? { message_thread_id: Number(snapshot.chat.threadId) }
        : {}),
      ...keyboard,
    });

    return { success: true };
  } catch (error) {
    console.error("Error sending snapshot message:", error);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to send message to Telegram",
    });
  }
};

export default protectedProcedure
  .input(inputSchema)
  .output(z.object({ success: z.boolean() }))
  .mutation(async ({ input, ctx }) => {
    if (!ctx.session.user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "User not authenticated",
      });
    }
    return shareSnapshotMessageHandler(
      input,
      ctx.db,
      ctx.teleBot,
      BigInt(ctx.session.user.id)
    );
  });
