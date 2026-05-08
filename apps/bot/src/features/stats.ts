import { Composer, InlineKeyboard } from "grammy";
import { BotContext } from "../types.js";
import { BotMessages } from "./messages.js";
import { escapeMarkdownV2 } from "../utils/markdown.js";
import { Decimal } from "decimal.js";
import { resolveCategory } from "@repo/categories";

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

interface StatsExpense {
  currency: string;
  amount: number;
  date: Date | string;
  categoryId: string | null;
}

const UNCATEGORIZED_KEY = "__uncategorized__";

statsFeature.on("callback_query:data", async (ctx, next) => {
  const data = ctx.callbackQuery.data;
  if (!data.startsWith("stats_period_")) {
    return next();
  }

  const runStart = Date.now();
  ctx.log.info({ period: data }, "stats.fetch.start");

  await ctx.answerCallbackQuery();

  if (data === "stats_period_cancel") {
    await ctx.editMessageText(BotMessages.STATS_CANCELLED, {
      parse_mode: "MarkdownV2",
    });
    ctx.log.info(
      { duration_ms: Date.now() - runStart, outcome: "cancelled" },
      "stats.fetch.end"
    );
    return;
  }

  const periodName = STATS_PERIODS[data] || "Unknown";

  try {
    // Awaited so the final edit can never race ahead of the loader.
    try {
      await ctx.editMessageText(
        BotMessages.STATS_LOADING.replace(
          "{period_name}",
          escapeMarkdownV2(periodName)
        ),
        { parse_mode: "MarkdownV2" }
      );
    } catch (err) {
      ctx.log.warn({ err }, "stats.fetch.loader_edit.failed");
    }

    const periodKey = data.replace("stats_period_", "");
    const { startDt, endDt } = getPeriodRange(periodKey);
    const isAllTime = periodKey === "all_time";

    const chatId = ctx.chat?.id || 0;
    const [filtered, chatCategoryList] = await Promise.all([
      ctx.trpc.expense.listByChatLean({
        chatId,
        ...(isAllTime
          ? {}
          : {
              ...(startDt ? { startDt } : {}),
              ...(endDt ? { endDt } : {}),
            }),
      }) as Promise<StatsExpense[]>,
      ctx.trpc.category.listByChat({ chatId }),
    ]);

    const chatRows = chatCategoryList.items
      .filter((c) => c.kind === "custom")
      .map((c) => ({
        id: c.id.replace(/^chat:/, ""),
        emoji: c.emoji,
        title: c.title,
        chatId: BigInt(chatId),
      }));

    if (filtered.length === 0) {
      const emptyMessage = isAllTime
        ? BotMessages.STATS_EMPTY
        : BotMessages.STATS_NO_EXPENSES_FOR_PERIOD.replace(
            "{period_name}",
            escapeMarkdownV2(periodName)
          );
      await ctx.editMessageText(emptyMessage, {
        parse_mode: "MarkdownV2",
      });
      ctx.log.info(
        {
          duration_ms: Date.now() - runStart,
          outcome: isAllTime ? "empty" : "empty_for_period",
          filtered_count: 0,
        },
        "stats.fetch.end"
      );
      return;
    }

    // Group by currency, then by category within currency.
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
      const byCategory: Record<string, Decimal> = {};
      for (const exp of exps) {
        curTotal = curTotal.plus(exp.amount);
        const key = exp.categoryId ?? UNCATEGORIZED_KEY;
        byCategory[key] = (byCategory[key] ?? new Decimal(0)).plus(exp.amount);
      }
      const formattedTotal = parseFloat(curTotal.toFixed(10)).toFixed(2);
      const escCurTotal = escapeMarkdownV2(formattedTotal);

      const sortedCategories = Object.entries(byCategory).sort(([, a], [, b]) =>
        b.comparedTo(a)
      );

      const branches = sortedCategories.map(([key, amount]) => {
        let emoji = "❓";
        let title = "Uncategorized";
        if (key !== UNCATEGORIZED_KEY) {
          const resolved = resolveCategory(key, chatRows);
          if (resolved) {
            emoji = resolved.emoji;
            title = resolved.title;
          }
        }
        const pct = curTotal.isZero()
          ? 0
          : amount.dividedBy(curTotal).times(100).toNumber();
        const formattedAmount = parseFloat(amount.toFixed(10)).toFixed(2);
        return `${emoji} ${escapeMarkdownV2(title)} — ${escapeMarkdownV2(formattedAmount)} \\(${pct.toFixed(0)}%\\)`;
      });

      // Tree style matches sendBatchExpenseSummary / formatExpenseMessage:
      // every line is a blockquote (`>`), header has no branch glyph,
      // category rows use ┣, Total closes with ┗.
      const blockLines = [
        `>📊 *${escCurrency}*`,
        ...branches.map((b) => `>┣ ${b}`),
        `>┗ *Total* — ${escCurTotal} ${escCurrency}`,
      ];

      currencySections.push(blockLines.join("\n"));
    }

    const lines = [
      `📊 *Statistics for ${escPeriod}*`,
      "",
      currencySections.join("\n\n"),
    ];

    await ctx.editMessageText(lines.join("\n"), {
      parse_mode: "MarkdownV2",
    });

    ctx.log.info(
      {
        duration_ms: Date.now() - runStart,
        outcome: "ok",
        filtered_count: filtered.length,
        currency_count: Object.keys(byCurrency).length,
      },
      "stats.fetch.end"
    );
  } catch (err) {
    ctx.log.error(
      { err, duration_ms: Date.now() - runStart },
      "stats.fetch.failed"
    );
    await ctx.editMessageText(BotMessages.ERROR_STATS_FAILED);
  }
});
