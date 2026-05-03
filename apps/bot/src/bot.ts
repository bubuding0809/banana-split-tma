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

// Basic catch-all error handler
bot.catch((err) => {
  // Use ctx.log if the logger middleware ran (most cases); fall back to
  // the module-level logger otherwise (e.g. errors thrown before middleware).
  const log = (err.ctx as unknown as { log?: Logger }).log;
  if (log) {
    log.error({ err: err.error }, "bot.update.unhandled");
  } else {
    botLog.error(
      {
        err: err.error,
        update_id: err.ctx.update.update_id,
        chat_id: err.ctx.chat?.id?.toString(),
      },
      "bot.update.unhandled"
    );
  }
});
