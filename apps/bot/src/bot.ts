import { Bot } from "grammy";
import { env } from "./env.js";
import { BotContext } from "./types.js";

export const bot = new Bot<BotContext>(env.TELEGRAM_BOT_TOKEN);

// Basic catch-all error handler
bot.catch((err) => {
  console.error(
    "Error while handling update",
    err.ctx.update.update_id,
    err.error
  );
});
