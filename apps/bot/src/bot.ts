import { Bot } from "grammy";
import { env } from "./env.js";
import { BotContext } from "./types.js";
import { trpcMiddleware } from "./middleware/trpc.js";
import { loggerMiddleware } from "./middleware/logger.js";
import { userFeature } from "./features/user.js";
import { groupFeature } from "./features/group.js";
import { expensesFeature } from "./features/expenses.js";

export const bot = new Bot<BotContext>(env.TELEGRAM_BOT_TOKEN);

bot.use(loggerMiddleware);
bot.use(trpcMiddleware);
bot.use(userFeature);
bot.use(groupFeature);
bot.use(expensesFeature);

// Basic catch-all error handler
bot.catch((err) => {
  console.error(
    "Error while handling update",
    err.ctx.update.update_id,
    err.error
  );
});
