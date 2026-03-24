import { Composer, InlineKeyboard } from "grammy";
import { BotContext } from "../types.js";
import { BotMessages } from "./messages.js";
import { escapeMarkdownV2 } from "../utils/markdown.js";
import { Decimal } from "decimal.js";

export const statsFeature = new Composer<BotContext>();

const STATS_PERIODS: Record<string, string> = {
  stats_period_today: "Today",
  stats_period_current_month: "Current month",
  stats_period_last_month: "Last month",
  stats_period_last_30_days: "Last 30 days",
  stats_period_last_12_months: "Last 12 months",
  stats_period_all_time: "All time",
};

statsFeature.command("stats", async (ctx, next) => {
  if (ctx.chat.type !== "private") return next();
  await ctx.api.sendChatAction(ctx.chat.id, "typing");

  const keyboard = new InlineKeyboard()
    .text("Today", "stats_period_today")
    .row()
    .text("Current month", "stats_period_current_month")
    .row()
    .text("Last month", "stats_period_last_month")
    .row()
    .text("Last 30 days", "stats_period_last_30_days")
    .row()
    .text("Last 12 months", "stats_period_last_12_months")
    .row()
    .text("All time", "stats_period_all_time")
    .row()
    .text("Cancel", "stats_period_cancel");

  await ctx.reply(BotMessages.STATS_CHOOSE_PERIOD, {
    reply_markup: keyboard,
    message_thread_id: ctx.message?.message_thread_id,
  });
});

import { getPeriodRange } from "../utils/date.js";

// Just typing what trpc returns for the frontend stats array
interface StatsExpense {
  currency: string;
  amount: number;
  date: Date | string;
}

statsFeature.on("callback_query:data", async (ctx, next) => {
  const data = ctx.callbackQuery.data;
  if (!data.startsWith("stats_period_")) {
    return next();
  }

  await ctx.answerCallbackQuery();

  if (data === "stats_period_cancel") {
    await ctx.editMessageText(BotMessages.STATS_CANCELLED, {
      parse_mode: "MarkdownV2",
    });
    return;
  }

  const periodName = STATS_PERIODS[data] || "Unknown";

  try {
    const expenses = await ctx.trpc.expense.getAllExpensesByChat({
      chatId: ctx.chat?.id || 0,
    });

    if (!expenses || expenses.length === 0) {
      await ctx.editMessageText(BotMessages.STATS_EMPTY, {
        parse_mode: "MarkdownV2",
      });
      return;
    }

    const { startDt, endDt } = getPeriodRange(
      data.replace("stats_period_", "")
    );

    const filtered = expenses.filter((exp: StatsExpense) => {
      const expDt = new Date(exp.date);
      if (startDt && expDt < startDt) return false;
      if (endDt && expDt >= endDt) return false;
      return true;
    });

    if (filtered.length === 0) {
      const text = BotMessages.STATS_NO_EXPENSES_FOR_PERIOD.replace(
        "{period_name}",
        escapeMarkdownV2(periodName)
      );
      await ctx.editMessageText(text, {
        parse_mode: "MarkdownV2",
      });
      return;
    }

    // Group by currency
    const byCurrency: Record<string, StatsExpense[]> = {};
    for (const exp of filtered) {
      const exps = byCurrency[exp.currency] || [];
      exps.push(exp);
      byCurrency[exp.currency] = exps;
    }

    const escPeriod = escapeMarkdownV2(periodName);
    const currencySections: string[] = [];

    for (const [currency, exps] of Object.entries(byCurrency)) {
      const escCurrency = escapeMarkdownV2(currency);
      let curTotal = new Decimal(0);
      for (const exp of exps) {
        curTotal = curTotal.plus(exp.amount);
      }
      const formattedTotal = parseFloat(curTotal.toFixed(10)).toFixed(2);
      const escCurTotal = escapeMarkdownV2(formattedTotal);

      currencySections.push(
        `*${escCurrency}*\nTotal: ${escCurTotal} ${escCurrency}`
      );
    }

    const lines = [
      `*Statistics for ${escPeriod}*`,
      "",
      `*➖ Expenses*`,
      "",
      currencySections.join("\n\n"),
    ];

    await ctx.editMessageText(lines.join("\n"), {
      parse_mode: "MarkdownV2",
    });
  } catch (error) {
    console.error("Error generating stats:", error);
    await ctx.editMessageText(BotMessages.ERROR_STATS_FAILED);
  }
});
