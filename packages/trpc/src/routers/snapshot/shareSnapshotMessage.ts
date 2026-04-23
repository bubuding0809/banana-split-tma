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
import { resolveCategory } from "@repo/categories";

const MAX_DISPLAYED_USERS = 15;
// Total line-item cap across all categories, to keep messages under
// Telegram's 4096-char limit. We truncate per-category when hit.
const MAX_EXPENSE_LINES = 50;

const inputSchema = z.object({
  snapshotId: z.string().uuid(),
});

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const formatShortDate = (d: Date): string =>
  `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;

const formatDateRange = (earliest: Date, latest: Date): string => {
  const sameYear = earliest.getFullYear() === latest.getFullYear();
  const sameMonth = sameYear && earliest.getMonth() === latest.getMonth();
  if (sameMonth) {
    // "1–20 Apr 2026"
    return `${earliest.getDate()}–${latest.getDate()} ${MONTH_SHORT[latest.getMonth()]} ${latest.getFullYear()}`;
  }
  if (sameYear) {
    // "28 Mar – 20 Apr 2026"
    return `${formatShortDate(earliest)} – ${formatShortDate(latest)} ${latest.getFullYear()}`;
  }
  // "28 Dec 2025 – 20 Jan 2026"
  return `${formatShortDate(earliest)} ${earliest.getFullYear()} – ${formatShortDate(latest)} ${latest.getFullYear()}`;
};

type CategoryGroup = {
  key: string; // category id ("base:x", "chat:uuid") or "__none__"
  emoji: string;
  title: string;
  total: Prisma.Decimal;
  items: Array<{
    description: string;
    date: Date;
    amountInBase: Prisma.Decimal;
  }>;
};

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
          chatCategories: {
            select: { id: true, emoji: true, title: true },
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

  // 3. Calculate total spent, per-user share totals, category groupings
  let totalSpent = toDecimal(0);
  const memberMap = new Map<bigint, { name: string; username?: string }>();
  const shareByUser = new Map<bigint, Prisma.Decimal>();
  const categoryMap = new Map<string, CategoryGroup>();

  // Use chat's base currency if available, otherwise snapshot's, fallback to SGD
  const currencyCode = snapshot.chat.baseCurrency || snapshot.currency || "SGD";

  // 3a. Fetch conversion rates for foreign currencies
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

  const chatCategoryRows = snapshot.chat.chatCategories;

  snapshot.expenses.forEach((expense) => {
    // Determine conversion rate
    let rate = 1;
    if (expense.currency !== currencyCode) {
      rate = ratesMap[expense.currency]?.rate || 1;
    }

    // Convert amount to base currency
    const amountInBaseCurrency = toDecimal(expense.amount).dividedBy(rate);
    totalSpent = totalSpent.plus(amountInBaseCurrency);

    // Member tracking (payer)
    memberMap.set(expense.payerId, {
      name: expense.payer.firstName,
      username: expense.payer.username || undefined,
    });

    // Accumulate per-user shares in base currency
    expense.shares.forEach((share) => {
      memberMap.set(share.userId, {
        name: share.user.firstName,
        username: share.user.username || undefined,
      });

      const shareAmount = share.amount ? toDecimal(share.amount) : toDecimal(0);
      const shareInBase = shareAmount.dividedBy(rate);
      const current = shareByUser.get(share.userId) || toDecimal(0);
      shareByUser.set(share.userId, current.plus(shareInBase));
    });

    // Category grouping
    const resolved = resolveCategory(expense.categoryId, chatCategoryRows);
    const key = resolved?.id ?? "__none__";
    const emoji = resolved?.emoji ?? "❓";
    const title = resolved?.title ?? "Uncategorized";
    const existing = categoryMap.get(key);
    if (existing) {
      existing.total = existing.total.plus(amountInBaseCurrency);
      existing.items.push({
        description: expense.description,
        date: expense.date,
        amountInBase: amountInBaseCurrency,
      });
    } else {
      categoryMap.set(key, {
        key,
        emoji,
        title,
        total: amountInBaseCurrency,
        items: [
          {
            description: expense.description,
            date: expense.date,
            amountInBase: amountInBaseCurrency,
          },
        ],
      });
    }
  });

  // 4. Format Telegram Message
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
  ).replace(/ /g, " ");
  const escapedTotal = escapeMarkdown(formattedTotal, 2);
  const escapedTitle = escapeMarkdown(snapshot.title, 2);

  // Date range line (only if there's at least one expense)
  let dateRangeLine = "";
  if (snapshot.expenses.length > 0) {
    const dates = snapshot.expenses
      .map((e) => e.date)
      .sort((a, b) => a.getTime() - b.getTime());
    const earliest = dates[0]!;
    const latest = dates[dates.length - 1]!;
    const range = formatDateRange(earliest, latest);
    dateRangeLine = `🗓 ${escapeMarkdown(range, 2)} · ${snapshot.expenses.length} ${
      snapshot.expenses.length === 1 ? "expense" : "expenses"
    }`;
  }

  // NOTE: Static formatting like `*` for bold must NOT be escaped, only the dynamic values and literal chars
  const messageLines: string[] = [
    `📊 *${escapedTitle}* shared by ${creatorMention}`,
  ];
  if (dateRangeLine) messageLines.push(dateRangeLine);
  messageLines.push(`Total spent: *${escapedTotal}*`);

  // 5. Per-pax share breakdown, sorted by share desc
  const sortedShares = Array.from(shareByUser.entries())
    .filter(([, amount]) => isSignificantBalance(amount))
    .sort(([, a], [, b]) => b.comparedTo(a));

  if (sortedShares.length > 0) {
    messageLines.push(`\n🧾 *Shares*`);

    const topShares = sortedShares.slice(0, MAX_DISPLAYED_USERS);
    topShares.forEach(([uid, amount], index) => {
      const member = memberMap.get(uid);
      if (!member) return;

      const mention = member.username
        ? `@${escapeMarkdown(member.username, 2)}`
        : mentionMarkdown(Number(uid), member.name, 2);

      const formattedAmount = escapeMarkdown(
        formatCurrencyWithCode(amount.toNumber(), currencyCode).replace(
          / /g,
          " "
        ),
        2
      );
      const prefix = index === topShares.length - 1 ? "┗" : "┣";
      messageLines.push(`${prefix} ${mention}: ${formattedAmount}`);
    });

    if (sortedShares.length > MAX_DISPLAYED_USERS) {
      messageLines.push(
        `\nand ${escapeMarkdown((sortedShares.length - MAX_DISPLAYED_USERS).toString(), 2)} others\\.\\.\\.`
      );
    }
  }

  // 6. Per-category expense listing, categories sorted by total desc.
  // Within each category, items sorted by date desc (most recent first).
  // Rendered as a single continuous MarkdownV2 blockquote (every line
  // prefixed with `>`) so the whole breakdown reads as a muted / tighter
  // block next to the Shares section.
  const sortedCategories = Array.from(categoryMap.values()).sort((a, b) =>
    b.total.comparedTo(a.total)
  );

  let linesRemaining = MAX_EXPENSE_LINES;
  let truncatedExpenses = 0;
  let truncatedFromCategories = 0;
  const breakdownLines: string[] = [];

  for (const group of sortedCategories) {
    if (linesRemaining <= 0) {
      truncatedExpenses += group.items.length;
      truncatedFromCategories += 1;
      continue;
    }

    const items = [...group.items].sort(
      (a, b) => b.date.getTime() - a.date.getTime()
    );

    const groupTotal = escapeMarkdown(
      formatCurrencyWithCode(group.total.toNumber(), currencyCode).replace(
        / /g,
        " "
      ),
      2
    );
    const groupTitle = escapeMarkdown(group.title, 2);

    // Internal separator between categories (a `>` alone keeps the
    // blockquote continuous while adding vertical breathing room).
    if (breakdownLines.length > 0) breakdownLines.push(">");
    breakdownLines.push(`>${group.emoji} *${groupTitle}* · ${groupTotal}`);

    const shownItems = items.slice(0, linesRemaining);
    const overflowInGroup = items.length - shownItems.length;
    truncatedExpenses += overflowInGroup;

    shownItems.forEach((item, idx) => {
      const isLast = idx === shownItems.length - 1 && overflowInGroup === 0;
      const prefix = isLast ? "┗" : "┣";
      const desc = escapeMarkdown(item.description, 2);
      const dateStr = escapeMarkdown(formatShortDate(item.date), 2);
      const amt = escapeMarkdown(
        formatCurrencyWithCode(
          item.amountInBase.toNumber(),
          currencyCode
        ).replace(/ /g, " "),
        2
      );
      breakdownLines.push(`>${prefix} ${desc} · ${dateStr} · ${amt}`);
    });

    if (overflowInGroup > 0) {
      breakdownLines.push(
        `>┗ _…and ${escapeMarkdown(overflowInGroup.toString(), 2)} more_`
      );
    }

    linesRemaining -= shownItems.length;
  }

  if (breakdownLines.length > 0) {
    messageLines.push("");
    messageLines.push(...breakdownLines);
  }

  if (truncatedExpenses > 0 && truncatedFromCategories > 0) {
    messageLines.push(
      `
_…and ${escapeMarkdown(truncatedExpenses.toString(), 2)} more expenses across ${escapeMarkdown(
        truncatedFromCategories.toString(),
        2
      )} categories not shown_`
    );
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
