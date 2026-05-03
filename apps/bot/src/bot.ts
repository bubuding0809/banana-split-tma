import { Bot, session } from "grammy";
import { createLogger, type Logger } from "@repo/logger";
import { env } from "./env.js";
import { BotContext, SessionData } from "./types.js";
import { trpcMiddleware } from "./middleware/trpc.js";
import { loggerMiddleware } from "./middleware/logger.js";
import { reactionsMiddleware } from "./middleware/reactions.js";
import { userFeature } from "./features/user.js";
import { groupFeature } from "./features/group.js";
import { expensesFeature } from "./features/expenses.js";
import { statsFeature } from "./features/stats.js";
import { agentFeature } from "./features/agent.js";
import { botEventsFeature } from "./features/bot_events.js";
import { snapshotViewFeature } from "./features/snapshotView.js";

const botLog = createLogger("bot");

export const bot = new Bot<BotContext>(env.TELEGRAM_BOT_TOKEN);

function initial(): SessionData {
  return {};
}

bot.use(session({ initial }));

bot.use(loggerMiddleware);
bot.use(reactionsMiddleware);
bot.use(trpcMiddleware);
bot.use(agentFeature);
bot.use(groupFeature);
bot.use(userFeature);
bot.use(expensesFeature);
bot.use(statsFeature);
bot.use(snapshotViewFeature);
bot.use(botEventsFeature);

// Catch-all for errors that bypass the logger middleware (e.g. thrown
// before bot.use(loggerMiddleware) ran). The middleware already logs
// bot.update.unhandled and rethrows, so when ctx.log is present we
// don't log again — preventing 2x event count for normal handler errors.
// A separate event name (bot.update.uncaught) makes the rare
// pre-middleware case clearly distinguishable in Axiom.
bot.catch((err) => {
  const log: Logger | undefined = (err.ctx as unknown as { log?: Logger }).log;
  if (log) return; // middleware already logged bot.update.unhandled
  botLog.error(
    {
      err: err.error,
      update_id: err.ctx.update.update_id,
      chat_id: err.ctx.chat?.id?.toString(),
    },
    "bot.update.uncaught"
  );
});
