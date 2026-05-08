import { Composer, InlineKeyboard, Keyboard } from "grammy";
import { BotContext } from "../types.js";
import { BotMessages } from "./messages.js";
import { escapeMarkdownV2 } from "../utils/markdown.js";
import { ChatUtils } from "../utils/chat.js";
import { env } from "../env.js";
import { Decimal } from "decimal.js";
import { classifyCategory, resolveCategory } from "@repo/categories";
import { getAgentModel } from "@repo/agent";
import { encodeV1DeepLink, formatDateLabel } from "@dko/trpc";
import type { LanguageModel } from "ai";

interface LeanExpense {
  id: number;
  description: string;
  amount: number;
  currency: string;
  date: string | Date;
  categoryId: string | null;
}

export const expensesFeature = new Composer<BotContext>();

const CHASE_USER_REQUEST = 0;

expensesFeature.command("chase", async (ctx, next) => {
  if (ctx.chat.type !== "private") {
    return next();
  }

  const keyboard = new Keyboard()
    .requestUsers(BotMessages.CHASE_CHOOSE_USER_BUTTON, CHASE_USER_REQUEST, {
      user_is_bot: false,
      request_username: true,
      request_name: true,
    })
    .oneTime()
    .resized();

  await ctx.reply(BotMessages.CHASE_SELECT_USER, {
    reply_markup: keyboard,
  });
});

expensesFeature.on("message:users_shared", async (ctx) => {
  if (ctx.message.users_shared.request_id === CHASE_USER_REQUEST) {
    const sharedUser = ctx.message.users_shared.users[0];
    if (!sharedUser) return;

    const fromUsername =
      ctx.from?.username || ctx.from?.first_name || "Someone";

    const chaseMessage = BotMessages.CHASE_REMINDER.replace(
      "{from_username}",
      fromUsername
    );

    try {
      await ctx.api.sendMessage(sharedUser.user_id, chaseMessage);

      const username =
        sharedUser.username ||
        sharedUser.first_name ||
        String(sharedUser.user_id);
      const successMessage = BotMessages.SUCCESS_CHASE_SENT.replace(
        "{username}",
        username
      );

      await ctx.reply(successMessage, {
        reply_markup: { remove_keyboard: true },
      });
    } catch {
      await ctx.reply(
        `⚠️ Failed to send message to ${sharedUser.username || sharedUser.first_name || String(sharedUser.user_id)} as they do not have conversation yet.`,
        {
          reply_markup: { remove_keyboard: true },
        }
      );
    }
  }
});

import { getPeriodRange } from "../utils/date.js";

const LIST_PERIODS: Record<string, string> = {
  list_period_today: "Today",
  list_period_current_month: "Current month",
  list_period_last_month: "Last month",
  list_period_last_30_days: "Last 30 days",
  list_period_last_12_months: "Last 12 months",
  list_period_all_time: "All time",
  list_period_cancel: "Cancel",
};

const LIST_PAGE_CHAR_BUDGET = 3800;
const LIST_PAGE_HARD_LIMIT = 4080;

function buildDaySections(expenses: LeanExpense[]): string[] {
  const days: Record<string, LeanExpense[]> = {};
  const dayDates: Record<string, Date> = {};
  for (const exp of expenses) {
    const expDt = new Date(exp.date);
    const dayKey = `${expDt.getFullYear()}-${String(expDt.getMonth() + 1).padStart(2, "0")}-${String(expDt.getDate()).padStart(2, "0")}`;
    if (!days[dayKey]) {
      days[dayKey] = [];
      dayDates[dayKey] = expDt;
    }
    days[dayKey]!.push(exp);
  }

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const dayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  const daySections: string[] = [];
  for (const [dayKey, exps] of Object.entries(days)) {
    const dt = dayDates[dayKey];
    if (!dt) continue;
    const dayLabel = `${dt.getDate()} ${monthNames[dt.getMonth()]} ${dt.getFullYear()}, ${dayNames[dt.getDay()]}`;

    const dayTotals: Record<string, number> = {};
    for (const exp of exps) {
      dayTotals[exp.currency] = new Decimal(dayTotals[exp.currency] || 0)
        .plus(exp.amount)
        .toNumber();
    }

    const totalParts = Object.entries(dayTotals).map(
      ([cur, amt]) =>
        `\\-${escapeMarkdownV2(parseFloat(amt.toFixed(10)).toString())} ${escapeMarkdownV2(cur)}`
    );
    const escTotalStr = totalParts.join(", ");
    const escDayLabel = escapeMarkdownV2(dayLabel);

    const itemBranches = exps.map((exp) => {
      const escAmt = escapeMarkdownV2(
        parseFloat(exp.amount.toFixed(10)).toString()
      );
      const escCur = escapeMarkdownV2(exp.currency);
      const escDesc = escapeMarkdownV2(exp.description);
      return `${escAmt} ${escCur} — ${escDesc}`;
    });

    const lastIdx = itemBranches.length - 1;
    const blockLines = [
      `>📅 *${escDayLabel}* — ${escTotalStr}`,
      ...itemBranches.map((b, i) => `>${i === lastIdx ? "┗" : "┣"} ${b}`),
    ];
    daySections.push(blockLines.join("\n"));
  }
  return daySections;
}

function buildOverallTotalBlock(expenses: LeanExpense[]): string {
  const overallTotals: Record<string, number> = {};
  for (const exp of expenses) {
    overallTotals[exp.currency] = new Decimal(overallTotals[exp.currency] || 0)
      .plus(exp.amount)
      .toNumber();
  }
  const entries = Object.entries(overallTotals);
  if (entries.length === 0) return "";
  const lastIdx = entries.length - 1;
  const lines = [
    `>💰 *Overall Total*`,
    ...entries.map(([cur, amt], i) => {
      const branch = i === lastIdx ? "┗" : "┣";
      return `>${branch} \\-${escapeMarkdownV2(amt.toFixed(2))} ${escapeMarkdownV2(cur)}`;
    }),
  ];
  return lines.join("\n");
}

function buildExpenseListPages(
  expenses: LeanExpense[],
  periodName: string
): string[] {
  const sections = buildDaySections(expenses);
  const overallBlock = buildOverallTotalBlock(expenses);
  const escPeriod = escapeMarkdownV2(periodName);

  const chunks: string[][] = [[]];
  let currentLen = 0;
  const headerReserve = 80;

  for (const section of sections) {
    const sectionLen = section.length + 2;
    const lastChunk = chunks[chunks.length - 1]!;
    if (lastChunk.length === 0) {
      lastChunk.push(section);
      currentLen = sectionLen;
    } else if (
      currentLen + sectionLen + headerReserve >
      LIST_PAGE_CHAR_BUDGET
    ) {
      chunks.push([section]);
      currentLen = sectionLen;
    } else {
      lastChunk.push(section);
      currentLen += sectionLen;
    }
  }

  if (overallBlock) {
    const last = chunks[chunks.length - 1]!;
    const lastLen = last.join("\n\n").length + headerReserve;
    if (lastLen + overallBlock.length + 2 > LIST_PAGE_CHAR_BUDGET) {
      chunks.push([]);
    }
  }

  const totalPages = chunks.length;
  return chunks.map((sectionList, idx) => {
    const header =
      totalPages === 1
        ? `🧾 *Expenses for ${escPeriod}*\n\n`
        : `🧾 *Expenses for ${escPeriod}* \\(Page ${idx + 1} of ${totalPages}\\)\n\n`;
    const body = sectionList.join("\n\n");
    const isLast = idx === totalPages - 1;
    let text = header + body;
    if (isLast && overallBlock) text += `\n\n${overallBlock}`;
    if (text.length > LIST_PAGE_HARD_LIMIT) {
      text = text.slice(0, LIST_PAGE_HARD_LIMIT - 16) + "\n\\.\\.\\.truncated";
    }
    return text;
  });
}

function buildListPageKeyboard(
  periodKey: string,
  pageIdx: number,
  totalPages: number
): InlineKeyboard | undefined {
  if (totalPages <= 1) return undefined;
  const kb = new InlineKeyboard();
  if (pageIdx > 0) {
    kb.text("◀ Prev", `list_page_${periodKey}_${pageIdx - 1}`);
  }
  kb.text(`${pageIdx + 1}/${totalPages}`, "list_page_noop");
  if (pageIdx < totalPages - 1) {
    kb.text("Next ▶", `list_page_${periodKey}_${pageIdx + 1}`);
  }
  return kb;
}

expensesFeature.command("list", async (ctx, next) => {
  if (ctx.chat.type !== "private") return next();
  await ctx.replyWithChatAction("typing");

  const keyboard = new InlineKeyboard()
    .text("Today", "list_period_today")
    .row()
    .text("Current month", "list_period_current_month")
    .row()
    .text("Last month", "list_period_last_month")
    .row()
    .text("Last 30 days", "list_period_last_30_days")
    .row()
    .text("Last 12 months", "list_period_last_12_months")
    .row()
    .text("All time", "list_period_all_time")
    .row()
    .text("Cancel", "list_period_cancel");

  await ctx.reply(BotMessages.LIST_CHOOSE_PERIOD, {
    reply_markup: keyboard,
  });
});

expensesFeature.callbackQuery(/^list_period_/, async (ctx) => {
  const callbackData = ctx.callbackQuery.data;
  if (!callbackData) return;

  const runStart = Date.now();
  ctx.log.info({ period: callbackData }, "expense.list.start");

  await ctx.answerCallbackQuery();

  if (callbackData === "list_period_cancel") {
    await ctx.editMessageText(BotMessages.LIST_CANCELLED, {
      parse_mode: "MarkdownV2",
    });
    ctx.log.info(
      { duration_ms: Date.now() - runStart, outcome: "cancelled" },
      "expense.list.end"
    );
    return;
  }

  const periodName = LIST_PERIODS[callbackData] || "Unknown";

  // Awaited so the final edit can never race ahead of the loader.
  try {
    await ctx.editMessageText(
      BotMessages.LIST_LOADING.replace(
        "{period_name}",
        escapeMarkdownV2(periodName)
      ),
      { parse_mode: "MarkdownV2" }
    );
  } catch (err) {
    ctx.log.warn({ err }, "expense.list.loader_edit.failed");
  }

  try {
    const { startDt, endDt } = getPeriodRange(
      callbackData.replace("list_period_", "")
    );
    // Push the period filter to the DB. Skip start filter when it's epoch-0
    // ("all_time") so we don't add a no-op where clause to the query.
    const dbStartDt = startDt && startDt.getTime() > 0 ? startDt : undefined;
    const dbEndDt = endDt ?? undefined;

    const expenses = (await ctx.trpc.expense.listByChatLean({
      chatId: ctx.chat!.id,
      startDt: dbStartDt,
      endDt: dbEndDt,
    })) as LeanExpense[];
    const formatStart = Date.now();

    if (!expenses || expenses.length === 0) {
      // For "all_time" with no rows, the chat has zero expenses ever — show
      // the onboarding hint. For any bounded period, show the period-specific
      // empty message.
      const isAllTime = !dbStartDt && !dbEndDt;
      const emptyMessage = isAllTime
        ? BotMessages.LIST_EMPTY
        : BotMessages.LIST_NO_EXPENSES_FOR_PERIOD.replace(
            "{period_name}",
            escapeMarkdownV2(periodName)
          );
      await ctx.editMessageText(emptyMessage, { parse_mode: "MarkdownV2" });
      ctx.log.info(
        {
          duration_ms: Date.now() - runStart,
          outcome: isAllTime ? "empty" : "empty_for_period",
          filtered_count: 0,
        },
        "expense.list.end"
      );
      return;
    }

    const pages = buildExpenseListPages(expenses, periodName);
    const periodKey = callbackData.replace("list_period_", "");
    const firstPage = pages[0]!;
    const keyboard = buildListPageKeyboard(periodKey, 0, pages.length);

    const formatEnd = Date.now();
    ctx.log.info(
      {
        filtered_count: expenses.length,
        text_len: firstPage.length,
        total_count: pages.length,
        format_duration_ms: formatEnd - formatStart,
      },
      "expense.list.format"
    );

    await ctx.editMessageText(firstPage, {
      parse_mode: "MarkdownV2",
      reply_markup: keyboard,
    });

    ctx.log.info(
      {
        duration_ms: Date.now() - runStart,
        send_ms: Date.now() - formatEnd,
        outcome: "ok",
        total_count: expenses.length,
        filtered_count: expenses.length,
      },
      "expense.list.end"
    );
  } catch (err) {
    ctx.log.error(
      { err, duration_ms: Date.now() - runStart },
      "expense.list.failed"
    );
    await ctx.editMessageText(BotMessages.ERROR_LIST_FAILED);
  }
});

expensesFeature.callbackQuery(/^list_page_/, async (ctx) => {
  const callbackData = ctx.callbackQuery.data;
  if (!callbackData) return;

  if (callbackData === "list_page_noop") {
    await ctx.answerCallbackQuery();
    return;
  }

  const runStart = Date.now();
  await ctx.answerCallbackQuery();

  const rest = callbackData.replace("list_page_", "");
  const lastUnderscore = rest.lastIndexOf("_");
  if (lastUnderscore === -1) return;
  const periodKey = rest.substring(0, lastUnderscore);
  const pageIdx = parseInt(rest.substring(lastUnderscore + 1), 10);
  if (isNaN(pageIdx) || pageIdx < 0) return;

  const periodName = LIST_PERIODS[`list_period_${periodKey}`] || "Unknown";
  ctx.log.info({ period: periodKey, page: pageIdx }, "expense.list.page.start");

  try {
    const { startDt, endDt } = getPeriodRange(periodKey);
    const dbStartDt = startDt && startDt.getTime() > 0 ? startDt : undefined;
    const dbEndDt = endDt ?? undefined;

    const expenses = (await ctx.trpc.expense.listByChatLean({
      chatId: ctx.chat!.id,
      startDt: dbStartDt,
      endDt: dbEndDt,
    })) as LeanExpense[];

    if (!expenses || expenses.length === 0) {
      await ctx.editMessageText(BotMessages.LIST_EMPTY, {
        parse_mode: "MarkdownV2",
      });
      ctx.log.info(
        { duration_ms: Date.now() - runStart, outcome: "empty" },
        "expense.list.page.end"
      );
      return;
    }

    const pages = buildExpenseListPages(expenses, periodName);
    const safePageIdx = Math.min(Math.max(pageIdx, 0), pages.length - 1);
    const pageText = pages[safePageIdx]!;
    const keyboard = buildListPageKeyboard(
      periodKey,
      safePageIdx,
      pages.length
    );

    await ctx.editMessageText(pageText, {
      parse_mode: "MarkdownV2",
      reply_markup: keyboard,
    });

    ctx.log.info(
      {
        duration_ms: Date.now() - runStart,
        page: safePageIdx,
        total_count: pages.length,
        filtered_count: expenses.length,
        outcome: "ok",
      },
      "expense.list.page.end"
    );
  } catch (err) {
    ctx.log.error(
      { err, duration_ms: Date.now() - runStart },
      "expense.list.page.failed"
    );
  }
});

import { parseExpense } from "../utils/parseExpense.js";

expensesFeature.on("message:text", async (ctx, next) => {
  if (ctx.chat.type !== "private" || ctx.message.text.startsWith("/")) {
    return next();
  }

  const text = ctx.message.text;
  const parsed = parseExpense(text);

  if (!parsed) {
    await ctx.reply(BotMessages.ERROR_INVALID_EXPENSE_FORMAT, {
      parse_mode: "MarkdownV2",
    });
    return;
  }

  const runStart = Date.now();
  ctx.log.info(
    { amount: parsed.amount, currency: parsed.currency },
    "expense.create.start"
  );

  await ctx.replyWithChatAction("typing");

  try {
    let exists = false;
    try {
      await ctx.trpc.user.getUser({ userId: ctx.from.id });
      exists = true;
    } catch (err: unknown) {
      if ((err as any).code !== "NOT_FOUND") {
        throw err;
      }
    }

    if (!exists) {
      await ctx.reply(BotMessages.ERROR_EXPENSE_NOT_REGISTERED);
      ctx.log.info(
        { duration_ms: Date.now() - runStart, outcome: "not_registered" },
        "expense.create.end"
      );
      return;
    }

    const expenseDate = parsed.date || new Date();

    // Try to auto-assign a category. Null on LLM failure is acceptable — expense
    // still creates, just without a category.
    let categoryId: string | null = null;
    let chatRows: {
      id: string;
      title: string;
      emoji: string;
      chatId: bigint;
    }[] = [];
    const classifyStart = Date.now();
    ctx.log.info({}, "expense.create.ai_classify.start");
    try {
      const chatCategories = await ctx.trpc.category.listByChat({
        chatId: ctx.from.id,
      });
      chatRows = chatCategories.items
        .filter((c) => c.kind === "custom")
        .map((c) => ({
          id: c.id.replace(/^chat:/, ""),
          emoji: c.emoji,
          title: c.title,
          chatId: BigInt(ctx.from.id),
        }));
      const suggestion = await classifyCategory({
        description: parsed.description,
        chatCategories: chatRows,
        model: getAgentModel() as unknown as LanguageModel,
      });
      categoryId = suggestion?.categoryId ?? null;
      ctx.log.info(
        {
          duration_ms: Date.now() - classifyStart,
          outcome: "ok",
          category_id: categoryId,
        },
        "expense.create.ai_classify.end"
      );
    } catch (err) {
      ctx.log.warn(
        { err, duration_ms: Date.now() - classifyStart, outcome: "fallback" },
        "expense.create.ai_classify.end"
      );
    }

    const expense = await ctx.trpc.expense.createExpense({
      chatId: ctx.from.id,
      creatorId: ctx.from.id,
      payerId: ctx.from.id,
      description: parsed.description,
      amount: parsed.amount,
      date: expenseDate,
      splitMode: "EQUAL",
      participantIds: [ctx.from.id],
      sendNotification: false,
      currency: parsed.currency,
      categoryId: categoryId ?? undefined,
    });

    const currency = expense.currency;
    const escapedDesc = escapeMarkdownV2(parsed.description);
    const escapedCurrency = escapeMarkdownV2(currency);
    const formattedAmount = escapeMarkdownV2(parsed.amount.toFixed(2));

    // Style mirrors the group notification (see formatExpenseMessage)
    // minus the shares block. Category is optional — if classification
    // failed we skip that row.
    let categoryLine = "";
    const resolved = resolveCategory(categoryId, chatRows);
    if (resolved) {
      categoryLine = `> 🏷 • ${resolved.emoji} ${escapeMarkdownV2(resolved.title)}\n`;
    }
    const dateLabel = escapeMarkdownV2(formatDateLabel(expenseDate));

    const confirmation = BotMessages.EXPENSE_CREATED.replace(
      "{description}",
      escapedDesc
    )
      .replace("{currency}", escapedCurrency)
      .replace("{amount}", formattedAmount)
      .replace("{category_line}", categoryLine)
      .replace("{date_label}", dateLabel);

    // Personal expenses live on chatId === userId. The deep link opens
    // the TMA at the user's personal transactions tab and auto-opens
    // the expense modal — same shape used by the group "View Expense"
    // CTA, just with chat_type "p".
    const deepLinkPayload = encodeV1DeepLink(
      BigInt(ctx.from.id),
      "p",
      "e",
      expense.id
    );
    const viewExpenseUrl = ChatUtils.createMiniAppUrl(
      env.MINI_APP_DEEPLINK,
      ctx.me.username,
      deepLinkPayload
    );

    const keyboard = new InlineKeyboard()
      .url("View Expense", viewExpenseUrl)
      .row()
      .text("🗑 Undo", `undo_expense:${expense.id}`);

    const sent = await ctx.reply(confirmation, {
      parse_mode: "MarkdownV2",
      reply_markup: keyboard,
    });

    // Persist the message ID so deleting the expense from the TMA can
    // also clean up this confirmation message via the existing
    // deleteExpense → deleteExpenseMessages best-effort path. Failure
    // is non-fatal — the expense + the visible message are both fine,
    // we just lose the auto-cleanup on app delete.
    try {
      await ctx.trpc.expense.attachTelegramMessage({
        expenseId: expense.id,
        telegramMessageId: sent.message_id,
      });
    } catch (err) {
      ctx.log.warn(
        { err, outcome: "fallback" },
        "expense.create.attach_message.failed"
      );
    }

    ctx.log.info(
      {
        duration_ms: Date.now() - runStart,
        outcome: "ok",
        expense_id: expense.id,
        category_id: categoryId,
      },
      "expense.create.end"
    );
  } catch (err) {
    ctx.log.error(
      { err, duration_ms: Date.now() - runStart },
      "expense.create.failed"
    );
    await ctx.reply(BotMessages.ERROR_EXPENSE_CREATE_FAILED);
  }
});

expensesFeature.callbackQuery(/^undo_expense:(.+)$/, async (ctx) => {
  const expenseId = ctx.match[1];
  if (!expenseId) return;
  const runStart = Date.now();
  ctx.log.info({ expense_id: expenseId }, "expense.undo.start");
  try {
    await ctx.answerCallbackQuery();
    await ctx.trpc.expense.deleteExpense({ expenseId });
    await ctx.editMessageText(BotMessages.EXPENSE_DELETED, {
      parse_mode: "MarkdownV2",
    });
    ctx.log.info(
      { duration_ms: Date.now() - runStart, outcome: "ok" },
      "expense.undo.end"
    );
  } catch (err) {
    ctx.log.error(
      { err, duration_ms: Date.now() - runStart, expense_id: expenseId },
      "expense.undo.failed"
    );
    await ctx.editMessageText(BotMessages.ERROR_EXPENSE_DELETE_FAILED);
  }
});
