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

  // 4. Calculate total spent and individual sum of shares
  let totalSpent = toDecimal(0);
  const userShares = new Map<
    bigint,
    { name: string; username?: string; amount: Prisma.Decimal }
  >();

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

    // Sum shares
    expense.shares.forEach((share) => {
      const shareAmount = share.amount ? toDecimal(share.amount) : toDecimal(0);
      const shareAmountInBaseCurrency = shareAmount.dividedBy(rate);

      const shareData = userShares.get(share.userId) || {
        name: share.user.firstName,
        username: share.user.username || undefined,
        amount: toDecimal(0),
      };
      shareData.amount = shareData.amount.plus(shareAmountInBaseCurrency);
      userShares.set(share.userId, shareData);
    });
  });

  // 5. Filter for users who have non-zero shares and sort by highest spent
  const damageList = Array.from(userShares.entries())
    .filter(([_, data]) => isSignificantBalance(data.amount))
    .map(([id, data]) => ({
      id,
      name: data.name,
      username: data.username,
      amount: data.amount,
    }))
    .sort((a, b) => b.amount.comparedTo(a.amount));

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
  let message = `📊 *${escapedTitle}* shared by ${creatorMention}\n`;
  message += `Total spent: *${escapedTotal}* \\(${snapshot.expenses.length} expenses\\)\n`;

  if (damageList.length > 0) {
    message += `\n📉 *Group Damage:*\n`;

    // Truncate to top MAX_DISPLAYED_USERS
    const topUsers = damageList.slice(0, MAX_DISPLAYED_USERS);

    topUsers.forEach((user) => {
      const mention = user.username
        ? `@${escapeMarkdown(user.username, 2)}`
        : mentionMarkdown(Number(user.id), user.name, 2);

      const formattedDamage = formatCurrencyWithCode(
        user.amount.toNumber(),
        currencyCode
      ).replace(/\u00A0/g, " ");
      const escapedDamage = escapeMarkdown(formattedDamage, 2);

      message += `• ${mention}: ${escapedDamage}\n`;
    });

    if (damageList.length > MAX_DISPLAYED_USERS) {
      message += `and ${escapeMarkdown((damageList.length - MAX_DISPLAYED_USERS).toString(), 2)} others\\.\\.\\.\n`;
    }
  }

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
