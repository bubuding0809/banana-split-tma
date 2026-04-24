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
import { Telegram } from "telegraf";
import { Prisma } from "@dko/database";
import { getMultipleRatesHandler } from "../currency/getMultipleRates.js";
import { resolveCategory } from "@repo/categories";

const MAX_DISPLAYED_USERS = 15;
// Cap on total expense lines rendered in the breakdown, to stay under
// Telegram's 4096-char message limit for very large snapshots.
const MAX_EXPENSE_LINES = 50;

/** Supported views for the snapshot share breakdown section. */
export const SNAPSHOT_VIEWS = ["cat", "date", "payer"] as const;
export type SnapshotView = (typeof SNAPSHOT_VIEWS)[number];

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
    return `${earliest.getDate()}–${latest.getDate()} ${MONTH_SHORT[latest.getMonth()]} ${latest.getFullYear()}`;
  }
  if (sameYear) {
    return `${formatShortDate(earliest)} – ${formatShortDate(latest)} ${latest.getFullYear()}`;
  }
  return `${formatShortDate(earliest)} ${earliest.getFullYear()} – ${formatShortDate(latest)} ${latest.getFullYear()}`;
};

// Intl.NumberFormat inserts non-breaking spaces between currency code
// and amount for some locales; MarkdownV2 escaping doesn't care, but
// we normalize to a regular space so the message reads consistently.
const stripNbsp = (s: string) => s.replace(/ /g, " ");

const fmtMoney = (n: number, code: string) =>
  stripNbsp(formatCurrencyWithCode(n, code));

const fmtBare = (n: number) =>
  n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

type NormalizedExpense = {
  description: string;
  date: Date;
  amountInBase: Prisma.Decimal;
  payerId: bigint;
  categoryKey: string; // "base:x" / "chat:uuid" / "__none__"
  categoryEmoji: string;
  categoryTitle: string;
};

export type SnapshotContext = {
  snapshotId: string;
  chatId: bigint;
  chatType: string;
  threadId: bigint | null;
  creatorId: bigint;
  creatorMention: string;
  title: string;
  currencyCode: string;
  totalSpent: Prisma.Decimal;
  expenses: NormalizedExpense[];
  memberMap: Map<bigint, { name: string; username?: string }>;
  shareByUser: Map<bigint, Prisma.Decimal>;
  deepLink: string;
};

/**
 * Resolve a user's display label as either `@username` (live, tappable
 * Telegram mention) or a deep-link mention pinned to their numeric id.
 * Both are MarkdownV2-safe.
 */
function mentionFor(
  uid: bigint,
  member: { name: string; username?: string } | undefined
): string {
  if (!member) return escapeMarkdown("unknown", 2);
  return member.username
    ? `@${escapeMarkdown(member.username, 2)}`
    : mentionMarkdown(Number(uid), member.name, 2);
}

/**
 * Fetch the snapshot and build the full rendering context in one pass.
 * Handles authorization, currency rates, live Telegram user lookups,
 * and per-expense normalization (category resolution, base-currency
 * amounts). Safe to call from both the share mutation and the
 * view-switch query.
 */
export async function loadSnapshotContext(
  db: Db,
  teleBot: Telegram,
  snapshotId: string,
  userId: bigint
): Promise<SnapshotContext> {
  const snapshot = await db.expenseSnapshot.findUnique({
    where: { id: snapshotId },
    include: {
      chat: {
        include: {
          members: {
            where: { id: userId },
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

  const isMember = snapshot.chat.members.length > 0;
  if (!isMember) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Not a member of this chat",
    });
  }

  const currencyCode = snapshot.chat.baseCurrency || snapshot.currency || "SGD";

  // Currency conversion rates for any non-base currency expenses
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

  // Fetch live Telegram user info for everyone referenced in the
  // message (creator, payers, share participants). DB records fall
  // back silently if the live lookup errors.
  const userIdsToRefresh = new Set<bigint>();
  userIdsToRefresh.add(snapshot.creatorId);
  for (const e of snapshot.expenses) {
    userIdsToRefresh.add(e.payerId);
    for (const s of e.shares) userIdsToRefresh.add(s.userId);
  }
  const liveUserMap = new Map<
    bigint,
    { firstName: string; username?: string }
  >();
  await Promise.all(
    Array.from(userIdsToRefresh).map(async (uid) => {
      try {
        const member = await teleBot.getChatMember(
          Number(snapshot.chatId),
          Number(uid)
        );
        liveUserMap.set(uid, {
          firstName: member.user.first_name,
          username: member.user.username || undefined,
        });
      } catch {
        // fall back to DB record in caller
      }
    })
  );
  const resolveUserInfo = (
    uid: bigint,
    fallbackName: string,
    fallbackUsername: string | null | undefined
  ) => {
    const live = liveUserMap.get(uid);
    return {
      name: live?.firstName ?? fallbackName,
      username: live?.username ?? fallbackUsername ?? undefined,
    };
  };

  // Normalize expenses in a single pass, accumulating totals + memberMap
  const memberMap = new Map<bigint, { name: string; username?: string }>();
  const shareByUser = new Map<bigint, Prisma.Decimal>();
  let totalSpent = toDecimal(0);
  const normalized: NormalizedExpense[] = [];

  for (const expense of snapshot.expenses) {
    let rate = 1;
    if (expense.currency !== currencyCode) {
      rate = ratesMap[expense.currency]?.rate || 1;
    }
    const amountInBase = toDecimal(expense.amount).dividedBy(rate);
    totalSpent = totalSpent.plus(amountInBase);

    memberMap.set(
      expense.payerId,
      resolveUserInfo(
        expense.payerId,
        expense.payer.firstName,
        expense.payer.username
      )
    );

    for (const share of expense.shares) {
      memberMap.set(
        share.userId,
        resolveUserInfo(share.userId, share.user.firstName, share.user.username)
      );
      const shareAmount = share.amount ? toDecimal(share.amount) : toDecimal(0);
      const shareInBase = shareAmount.dividedBy(rate);
      const current = shareByUser.get(share.userId) || toDecimal(0);
      shareByUser.set(share.userId, current.plus(shareInBase));
    }

    const resolved = resolveCategory(
      expense.categoryId,
      snapshot.chat.chatCategories
    );
    normalized.push({
      description: expense.description,
      date: expense.date,
      amountInBase,
      payerId: expense.payerId,
      categoryKey: resolved?.id ?? "__none__",
      categoryEmoji: resolved?.emoji ?? "❓",
      categoryTitle: resolved?.title ?? "Uncategorized",
    });
  }

  // Creator mention (live-name-aware)
  const creatorInfo = resolveUserInfo(
    snapshot.creatorId,
    snapshot.creator.firstName,
    snapshot.creator.username
  );
  const creatorMention = creatorInfo.username
    ? `@${escapeMarkdown(creatorInfo.username, 2)}`
    : mentionMarkdown(Number(snapshot.creatorId), creatorInfo.name, 2);

  // Deep link for the "View Snapshot" button
  let payload = "";
  try {
    payload = encodeV1DeepLink(
      snapshot.chatId,
      snapshot.chat.type === "private" ? "p" : "g",
      "s",
      snapshot.id
    );
  } catch {
    payload = "mock_payload";
  }
  const botInfo = await teleBot.getMe();
  const deepLink = createDeepLinkedUrl(botInfo.username, payload, "app");

  return {
    snapshotId: snapshot.id,
    chatId: snapshot.chatId,
    chatType: snapshot.chat.type,
    threadId: snapshot.chat.threadId ?? null,
    creatorId: snapshot.creatorId,
    creatorMention,
    title: snapshot.title,
    currencyCode,
    totalSpent,
    expenses: normalized,
    memberMap,
    shareByUser,
    deepLink,
  };
}

// ----- Rendering: header + shares are shared across all views -----

function renderHeader(ctx: SnapshotContext): string[] {
  const escapedTotal = escapeMarkdown(
    fmtMoney(ctx.totalSpent.toNumber(), ctx.currencyCode),
    2
  );
  const escapedTitle = escapeMarkdown(ctx.title, 2);
  const lines: string[] = [
    `📊 *${escapedTitle}* shared by ${ctx.creatorMention}`,
  ];
  if (ctx.expenses.length > 0) {
    const dates = ctx.expenses
      .map((e) => e.date)
      .sort((a, b) => a.getTime() - b.getTime());
    const earliest = dates[0]!;
    const latest = dates[dates.length - 1]!;
    const range = formatDateRange(earliest, latest);
    lines.push(
      `🗓 ${escapeMarkdown(range, 2)} · ${ctx.expenses.length} ${
        ctx.expenses.length === 1 ? "expense" : "expenses"
      }`
    );
  }
  lines.push(`Total spent: *${escapedTotal}*`);
  return lines;
}

function renderShares(ctx: SnapshotContext): string[] {
  const sortedShares = Array.from(ctx.shareByUser.entries())
    .filter(([, amount]) => isSignificantBalance(amount))
    .sort(([, a], [, b]) => b.comparedTo(a));

  if (sortedShares.length === 0) return [];

  const lines: string[] = [`🧾 *Shares*`];
  const topShares = sortedShares.slice(0, MAX_DISPLAYED_USERS);
  topShares.forEach(([uid, amount], index) => {
    const member = ctx.memberMap.get(uid);
    if (!member) return;
    const mention = mentionFor(uid, member);
    const formattedAmount = escapeMarkdown(
      fmtMoney(amount.toNumber(), ctx.currencyCode),
      2
    );
    const prefix = index === topShares.length - 1 ? "┗" : "┣";
    lines.push(`${prefix} ${mention}: ${formattedAmount}`);
  });
  if (sortedShares.length > MAX_DISPLAYED_USERS) {
    lines.push(
      `\nand ${escapeMarkdown((sortedShares.length - MAX_DISPLAYED_USERS).toString(), 2)} others\\.\\.\\.`
    );
  }
  return lines;
}

// ----- Breakdown renderers per view -----

type GroupedBreakdown = {
  key: string;
  header: string; // Fully formatted, MarkdownV2-escaped, without the leading `>`
  items: NormalizedExpense[];
  totalInBase: Prisma.Decimal;
};

function groupByCategory(ctx: SnapshotContext): GroupedBreakdown[] {
  const map = new Map<string, GroupedBreakdown>();
  for (const e of ctx.expenses) {
    const existing = map.get(e.categoryKey);
    if (existing) {
      existing.items.push(e);
      existing.totalInBase = existing.totalInBase.plus(e.amountInBase);
    } else {
      map.set(e.categoryKey, {
        key: e.categoryKey,
        header: `${e.categoryEmoji} *${escapeMarkdown(e.categoryTitle, 2)}* · ${escapeMarkdown(
          fmtMoney(0, ctx.currencyCode),
          2
        )}`, // placeholder amount — replaced after totalling
        items: [e],
        totalInBase: e.amountInBase,
      });
    }
  }
  // Rewrite headers with the real totals, then sort by total desc
  for (const g of map.values()) {
    const total = escapeMarkdown(
      fmtMoney(g.totalInBase.toNumber(), ctx.currencyCode),
      2
    );
    // Re-derive emoji + title from the first item (consistent per group)
    const first = g.items[0]!;
    g.header = `${first.categoryEmoji} *${escapeMarkdown(first.categoryTitle, 2)}* · ${total}`;
    g.items.sort((a, b) => b.date.getTime() - a.date.getTime());
  }
  return Array.from(map.values()).sort((a, b) =>
    b.totalInBase.comparedTo(a.totalInBase)
  );
}

function groupByDate(ctx: SnapshotContext): GroupedBreakdown[] {
  const map = new Map<string, GroupedBreakdown>();
  for (const e of ctx.expenses) {
    // Group by the calendar date as it *reads* in the per-row date
    // label (which uses `getDate()` / `getMonth()`), so the day a
    // user sees in the header matches the rows rolled up under it.
    const key = `${e.date.getFullYear()}-${e.date.getMonth()}-${e.date.getDate()}`;
    const existing = map.get(key);
    if (existing) {
      existing.items.push(e);
      existing.totalInBase = existing.totalInBase.plus(e.amountInBase);
    } else {
      map.set(key, {
        key,
        header: "", // set after totals known
        items: [e],
        totalInBase: e.amountInBase,
      });
    }
  }
  for (const g of map.values()) {
    const first = g.items[0]!;
    const dateLabel = escapeMarkdown(formatShortDate(first.date), 2);
    const total = escapeMarkdown(
      fmtMoney(g.totalInBase.toNumber(), ctx.currencyCode),
      2
    );
    g.header = `📅 *${dateLabel}* · ${total}`;
    // Within a day, sort by amount desc so largest items come first
    g.items.sort((a, b) => b.amountInBase.comparedTo(a.amountInBase));
  }
  // Groups sorted by date desc (most recent day first)
  return Array.from(map.values()).sort(
    (a, b) => b.items[0]!.date.getTime() - a.items[0]!.date.getTime()
  );
}

function groupByPayer(ctx: SnapshotContext): GroupedBreakdown[] {
  const map = new Map<string, GroupedBreakdown>();
  for (const e of ctx.expenses) {
    const key = e.payerId.toString();
    const existing = map.get(key);
    if (existing) {
      existing.items.push(e);
      existing.totalInBase = existing.totalInBase.plus(e.amountInBase);
    } else {
      map.set(key, {
        key,
        header: "",
        items: [e],
        totalInBase: e.amountInBase,
      });
    }
  }
  for (const g of map.values()) {
    const first = g.items[0]!;
    const member = ctx.memberMap.get(first.payerId);
    const mention = mentionFor(first.payerId, member);
    const total = escapeMarkdown(
      fmtMoney(g.totalInBase.toNumber(), ctx.currencyCode),
      2
    );
    const count = g.items.length;
    g.header = `${mention} paid *${total}* \\(${count} ${count === 1 ? "expense" : "expenses"}\\)`;
    g.items.sort((a, b) => b.date.getTime() - a.date.getTime());
  }
  return Array.from(map.values()).sort((a, b) =>
    b.totalInBase.comparedTo(a.totalInBase)
  );
}

function renderItemLine(
  ctx: SnapshotContext,
  item: NormalizedExpense,
  view: SnapshotView,
  prefix: string
): string {
  const desc = escapeMarkdown(item.description, 2);
  const amt = escapeMarkdown(fmtBare(item.amountInBase.toNumber()), 2);
  const dateStr = escapeMarkdown(formatShortDate(item.date), 2);
  const payer = ctx.memberMap.get(item.payerId);
  const payerLabel = mentionFor(item.payerId, payer);
  const catEmoji = item.categoryEmoji;
  // Row shape = description · cost · then the two dimensions *not*
  // used as the group header. Keeps width consistent across views.
  switch (view) {
    case "cat":
      // Category + date views drop the payer per-row: payer info is
      // already in the Shares block above, and including it here
      // pushes lines past mobile wrap width on long descriptions.
      return `>${prefix} ${desc} · ${amt} · ${dateStr}`;
    case "date":
      return `>${prefix} ${desc} · ${amt} · ${catEmoji}`;
    case "payer":
      // Payer *is* the group header here, so payer doesn't appear in
      // the row anyway — we keep category_emoji for context.
      return `>${prefix} ${desc} · ${amt} · ${dateStr} · ${catEmoji}`;
  }
}

function renderBreakdown(ctx: SnapshotContext, view: SnapshotView): string[] {
  const groups =
    view === "cat"
      ? groupByCategory(ctx)
      : view === "date"
        ? groupByDate(ctx)
        : groupByPayer(ctx);

  if (groups.length === 0) return [];

  let linesRemaining = MAX_EXPENSE_LINES;
  let truncatedExpenses = 0;
  let truncatedGroups = 0;
  const out: string[] = [];

  for (const group of groups) {
    if (linesRemaining <= 0) {
      truncatedExpenses += group.items.length;
      truncatedGroups += 1;
      continue;
    }
    if (out.length > 0) out.push(">"); // internal spacer between groups
    out.push(`>${group.header}`);

    const shown = group.items.slice(0, linesRemaining);
    const overflow = group.items.length - shown.length;
    truncatedExpenses += overflow;

    shown.forEach((item, i) => {
      const isLast = i === shown.length - 1 && overflow === 0;
      const prefix = isLast ? "┗" : "┣";
      out.push(renderItemLine(ctx, item, view, prefix));
    });

    if (overflow > 0) {
      out.push(`>┗ _…and ${escapeMarkdown(overflow.toString(), 2)} more_`);
    }
    linesRemaining -= shown.length;
  }

  if (truncatedExpenses > 0 && truncatedGroups > 0) {
    out.push(
      `\n_…and ${escapeMarkdown(truncatedExpenses.toString(), 2)} more expenses across ${escapeMarkdown(
        truncatedGroups.toString(),
        2
      )} groups not shown_`
    );
  }
  return out;
}

function legendFor(view: SnapshotView): string {
  switch (view) {
    case "cat":
      return `📋 *Expenses by category*`;
    case "date":
      return `📋 *Expenses by date*`;
    case "payer":
      return `📋 *Expenses by payer*`;
  }
}

// ----- Inline keyboard -----

const VIEW_BUTTONS: Array<{ view: SnapshotView; label: string }> = [
  { view: "cat", label: "📋 Category" },
  { view: "date", label: "📅 Date" },
  { view: "payer", label: "👤 Payer" },
];

type KeyboardButton =
  | { text: string; callback_data: string }
  | { text: string; url: string };

export type SnapshotReplyMarkup = {
  inline_keyboard: KeyboardButton[][];
};

function buildKeyboard(
  ctx: SnapshotContext,
  view: SnapshotView
): SnapshotReplyMarkup {
  const viewRow: KeyboardButton[] = VIEW_BUTTONS.map(({ view: v, label }) => ({
    text: v === view ? `✓ ${label}` : label,
    callback_data: `s:${ctx.snapshotId}:${v}`,
  }));
  return {
    inline_keyboard: [
      viewRow,
      [{ text: "View Snapshot 📊", url: ctx.deepLink }],
    ],
  };
}

// ----- Public: build the message for any view -----

export function buildSnapshotMessage(
  ctx: SnapshotContext,
  view: SnapshotView
): {
  text: string;
  replyMarkup: ReturnType<typeof buildKeyboard>;
} {
  const lines: string[] = [];
  lines.push(...renderHeader(ctx));
  const shares = renderShares(ctx);
  if (shares.length > 0) {
    lines.push("");
    lines.push(...shares);
  }
  const breakdown = renderBreakdown(ctx, view);
  if (breakdown.length > 0) {
    lines.push("");
    lines.push(legendFor(view));
    // No blank line between the section header and the quoted block —
    // they read as one contiguous section visually.
    lines.push(...breakdown);
  }
  return {
    text: lines.join("\n"),
    replyMarkup: buildKeyboard(ctx, view),
  };
}

// ----- Mutation handler: initial share -----

export const shareSnapshotMessageHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db,
  teleBot: Telegram,
  userId: bigint
) => {
  const ctx = await loadSnapshotContext(db, teleBot, input.snapshotId, userId);
  const { text, replyMarkup } = buildSnapshotMessage(ctx, "cat");

  try {
    await teleBot.sendMessage(Number(ctx.chatId), text, {
      parse_mode: "MarkdownV2",
      ...(ctx.threadId ? { message_thread_id: Number(ctx.threadId) } : {}),
      reply_markup: replyMarkup,
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
