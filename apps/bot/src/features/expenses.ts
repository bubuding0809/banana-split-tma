import { Composer, InlineKeyboard, Keyboard } from "grammy";
import { BotContext } from "../types.js";
import { BotMessages } from "./messages.js";
import { escapeMarkdownV2 } from "../utils/markdown.js";
import { ChatUtils } from "../utils/chat.js";
import { env } from "../env.js";
import { Decimal } from "decimal.js";

interface Expense {
  id: number;
  description: string;
  amount: number;
  currency: string;
  date: string | Date;
  creatorId: number;
  payerId: number;
  chatId: number;
  shares: {
    id: number;
    expenseId: number;
    userId: number;
    amount: number;
  }[];
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

  await ctx.answerCallbackQuery();

  if (callbackData === "list_period_cancel") {
    await ctx.editMessageText(BotMessages.LIST_CANCELLED, {
      parse_mode: "MarkdownV2",
    });
    return;
  }

  const periodName = LIST_PERIODS[callbackData] || "Unknown";

  try {
    const expenses = await ctx.trpc.expense.getAllExpensesByChat({
      chatId: ctx.chat!.id,
    });

    if (!expenses || expenses.length === 0) {
      await ctx.editMessageText(BotMessages.LIST_EMPTY, {
        parse_mode: "MarkdownV2",
      });
      return;
    }

    const { startDt, endDt } = getPeriodRange(
      callbackData.replace("list_period_", "")
    );

    const filtered = expenses.filter((exp: Expense) => {
      const expDt = new Date(exp.date);
      if (startDt && expDt < startDt) return false;
      if (endDt && expDt >= endDt) return false;
      return true;
    });

    if (filtered.length === 0) {
      await ctx.editMessageText(
        BotMessages.LIST_NO_EXPENSES_FOR_PERIOD.replace(
          "{period_name}",
          escapeMarkdownV2(periodName)
        ),
        { parse_mode: "MarkdownV2" }
      );
      return;
    }

    // Sort descending
    filtered.sort(
      (a: Expense, b: Expense) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    const days: Record<string, typeof filtered> = {};
    const dayDates: Record<string, Date> = {};

    for (const exp of filtered) {
      const expDt = new Date(exp.date);
      const dayKey = `${expDt.getFullYear()}-${String(expDt.getMonth() + 1).padStart(2, "0")}-${String(expDt.getDate()).padStart(2, "0")}`;
      if (!days[dayKey]) {
        days[dayKey] = [];
        dayDates[dayKey] = expDt;
      }
      days[dayKey].push(exp);
    }

    const daySections: string[] = [];
    for (const [dayKey, exps] of Object.entries(days)) {
      const dt = dayDates[dayKey];
      if (!dt) continue;

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
      const dayLabel = `${dt.getDate()} ${monthNames[dt.getMonth()]} ${dt.getFullYear()}, ${dayNames[dt.getDay()]}`;

      const dayTotals: Record<string, number> = {};
      for (const exp of exps) {
        dayTotals[exp.currency] = new Decimal(dayTotals[exp.currency] || 0)
          .plus(exp.amount)
          .toNumber();
      }

      const totalParts = Object.entries(dayTotals).map(
        ([cur, amt]) => `-${parseFloat(amt.toFixed(10))} ${cur}`
      );
      const totalStr = totalParts.join(", ");

      const escDayLabel = escapeMarkdownV2(dayLabel);
      const escTotalStr = escapeMarkdownV2(`(${totalStr})`);

      const itemLines = exps.map((exp: Expense) => {
        const escAmt = escapeMarkdownV2(
          parseFloat(exp.amount.toFixed(10)).toString()
        );
        const escCur = escapeMarkdownV2(exp.currency);
        const escDesc = escapeMarkdownV2(exp.description);
        return `➖ ${escAmt} ${escCur} — ${escDesc}`;
      });

      daySections.push(
        `*${escDayLabel}* ${escTotalStr}\n${itemLines.join("\n")}`
      );
    }

    const escPeriod = escapeMarkdownV2(periodName);
    let finalMessage =
      `*Expenses for ${escPeriod}*\n\n` + daySections.join("\n\n");

    const overallTotals: Record<string, number> = {};
    for (const exp of filtered) {
      overallTotals[exp.currency] = new Decimal(
        overallTotals[exp.currency] || 0
      )
        .plus(exp.amount)
        .toNumber();
    }

    if (Object.keys(overallTotals).length > 0) {
      const overallTotalParts = Object.entries(overallTotals).map(
        ([cur, amt]) => escapeMarkdownV2(`-${amt.toFixed(2)} ${cur}`)
      );
      finalMessage += `\n*Overall Total*\n${overallTotalParts.join("\n")}`;
    }

    await ctx.editMessageText(finalMessage, { parse_mode: "MarkdownV2" });
  } catch (error) {
    console.error("Error fetching list:", error);
    await ctx.editMessageText(BotMessages.ERROR_LIST_FAILED);
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
      return;
    }

    const expenseDate = parsed.date || new Date();

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
    });

    const currency = expense.currency;
    const escapedDesc = escapeMarkdownV2(parsed.description);
    const escapedCurrency = escapeMarkdownV2(currency);
    const formattedAmount = escapeMarkdownV2(parsed.amount.toFixed(2));

    const confirmation = BotMessages.EXPENSE_CREATED.replace(
      "{description}",
      escapedDesc
    )
      .replace("{currency}", escapedCurrency)
      .replace("{amount}", formattedAmount);

    const undoKeyboard = new InlineKeyboard().text(
      "🗑 Undo",
      `undo_expense:${expense.id}`
    );

    await ctx.reply(confirmation, {
      parse_mode: "MarkdownV2",
      reply_markup: undoKeyboard,
    });
  } catch (error) {
    console.error("Error creating personal expense:", error);
    await ctx.reply(BotMessages.ERROR_EXPENSE_CREATE_FAILED);
  }
});

expensesFeature.callbackQuery(/^undo_expense:(.+)$/, async (ctx) => {
  const expenseId = ctx.match[1];
  if (!expenseId) return;
  try {
    await ctx.answerCallbackQuery();
    await ctx.trpc.expense.deleteExpense({ expenseId });
    await ctx.editMessageText(BotMessages.EXPENSE_DELETED, {
      parse_mode: "MarkdownV2",
    });
  } catch (error) {
    console.error("Error undoing expense:", error);
    await ctx.editMessageText(BotMessages.ERROR_EXPENSE_DELETE_FAILED);
  }
});
