import { Composer, InlineKeyboard, Keyboard } from "grammy";
import { BotContext } from "../types.js";
import { BotMessages } from "./messages.js";
import { escapeMarkdownV2 } from "../utils/markdown.js";
import { ChatUtils } from "../utils/chat.js";
import { env } from "../env.js";

export const expensesFeature = new Composer<BotContext>();

const CHASE_USER_REQUEST = 0;

expensesFeature.command("chase", async (ctx) => {
  if (ctx.chat.type !== "private") {
    return ctx.reply(BotMessages.ERROR_CHASE_PRIVATE_ONLY);
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
    } catch (error) {
      await ctx.reply(
        `⚠️ Failed to send message to ${sharedUser.username || sharedUser.first_name || String(sharedUser.user_id)} as they do not have conversation yet.`,
        {
          reply_markup: { remove_keyboard: true },
        }
      );
    }
  }
});

const LIST_PERIODS: Record<string, string> = {
  list_period_today: "Today",
  list_period_current_month: "Current month",
  list_period_last_month: "Last month",
  list_period_last_30_days: "Last 30 days",
  list_period_last_12_months: "Last 12 months",
  list_period_all_time: "All time",
  list_period_cancel: "Cancel",
};

expensesFeature.command("list", async (ctx) => {
  if (ctx.chat.type !== "private") return;
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

function getPeriodRange(periodKey: string): [Date | null, Date | null] {
  const now = new Date();
  let startDt: Date | null = null;
  let endDt: Date | null = null;

  switch (periodKey) {
    case "list_period_today":
      startDt = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      endDt = new Date(startDt);
      endDt.setDate(endDt.getDate() + 1);
      break;
    case "list_period_current_month":
      startDt = new Date(now.getFullYear(), now.getMonth(), 1);
      endDt = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      break;
    case "list_period_last_month":
      startDt = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      endDt = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "list_period_last_30_days":
      startDt = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
      endDt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      break;
    case "list_period_last_12_months":
      startDt = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      endDt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      break;
    case "list_period_all_time":
    case "list_period_cancel":
    default:
      startDt = null;
      endDt = null;
      break;
  }
  return [startDt, endDt];
}

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

    const [startDt, endDt] = getPeriodRange(callbackData);

    const filtered = expenses.filter((exp: any) => {
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
      (a: any, b: any) =>
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
        dayTotals[exp.currency] = (dayTotals[exp.currency] || 0) + exp.amount;
      }

      const totalParts = Object.entries(dayTotals).map(
        ([cur, amt]) => `-${parseFloat(amt.toFixed(10))} ${cur}`
      );
      const totalStr = totalParts.join(", ");

      const escDayLabel = escapeMarkdownV2(dayLabel);
      const escTotalStr = escapeMarkdownV2(`(${totalStr})`);

      const itemLines = exps.map((exp: any) => {
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
    const finalMessage =
      `*Expenses for ${escPeriod}*\n\n` + daySections.join("\n\n");

    await ctx.editMessageText(finalMessage, { parse_mode: "MarkdownV2" });
  } catch (error) {
    console.error("Error fetching list:", error);
    await ctx.editMessageText(BotMessages.ERROR_LIST_FAILED);
  }
});

expensesFeature.command("balance", async (ctx) => {
  if (ctx.chat.type === "private") return;
  const messageThreadId = ctx.message?.message_thread_id;

  const deepLinkUrl = ChatUtils.createMiniAppUrl(
    env.MINI_APP_DEEPLINK,
    ctx.me.username,
    "group",
    "compact"
  );

  try {
    const [members, debtsResult] = await Promise.all([
      ctx.trpc.chat.getMembers({ chatId: ctx.chat.id }),
      ctx.trpc.chat.getBulkChatDebts({ chatId: ctx.chat.id }),
    ]);

    if (!members) {
      await ctx.reply("No members found.", {
        message_thread_id: messageThreadId,
      });
      return;
    }

    const membersMap = new Map();
    for (const member of members) {
      membersMap.set(Number(member.id), member);
    }

    const balanceMessages: string[] = [];

    for (const member of members) {
      const memberId = Number(member.id);
      const memberDebts = debtsResult.debts.filter(
        (d: any) => d.debtorId === memberId
      );

      const name = member.firstName || String(memberId);
      const userMention = `[${escapeMarkdownV2(name)}](tg://user?id=${memberId})`;

      let userMessage = `🔵 *${userMention}* • [🧾𝔹𝕣𝕖𝕒𝕜𝕕𝕠𝕨𝕟🧾](${deepLinkUrl})\n`;

      if (memberDebts.length > 0) {
        for (const debt of memberDebts) {
          const creditor = membersMap.get(debt.creditorId);
          const creditorName = creditor
            ? creditor.firstName || String(debt.creditorId)
            : String(debt.creditorId);
          const formattedAmount = escapeMarkdownV2(
            parseFloat(debt.amount.toFixed(10)).toString()
          );
          const currency = escapeMarkdownV2(debt.currency);
          userMessage += `> Owes ${escapeMarkdownV2(creditorName)} ${formattedAmount} ${currency}\n`;
        }
      } else {
        userMessage += `> All settled up!\n`;
      }
      balanceMessages.push(userMessage);
    }

    const text = `*Current Balances*:\n\n` + balanceMessages.join("\n\n");

    await ctx.reply(text, {
      parse_mode: "MarkdownV2",
      link_preview_options: { is_disabled: true },
      message_thread_id: messageThreadId,
    });
  } catch (error) {
    console.error("Error fetching balance:", error);
    await ctx.reply("⚠️ Failed to fetch balance. Please try again.", {
      message_thread_id: messageThreadId,
    });
  }
});
