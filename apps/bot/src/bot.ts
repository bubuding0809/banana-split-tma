import { Bot, session } from "grammy";
import { env } from "./env.js";
import { BotContext, SessionData } from "./types.js";
import { trpcMiddleware } from "./middleware/trpc.js";
import { loggerMiddleware } from "./middleware/logger.js";
import { userFeature } from "./features/user.js";
import { groupFeature } from "./features/group.js";
import { expensesFeature } from "./features/expenses.js";
import { statsFeature } from "./features/stats.js";
import { agentFeature } from "./features/agent.js";
import { botEventsFeature } from "./features/bot_events.js";
import { snapshotViewFeature } from "./features/snapshotView.js";

export const bot = new Bot<BotContext>(env.TELEGRAM_BOT_TOKEN);

function initial(): SessionData {
  return {};
}

bot.use(session({ initial }));

bot.use(loggerMiddleware);
bot.use(trpcMiddleware);
bot.use(agentFeature);
bot.use(groupFeature);
bot.use(userFeature);
bot.use(expensesFeature);
bot.use(statsFeature);
bot.use(snapshotViewFeature);
bot.use(botEventsFeature);

// Basic catch-all error handler
bot.catch((err) => {
  console.error(
    "Error while handling update",
    err.ctx.update.update_id,
    err.error
  );
});
