import { randomUUID } from "node:crypto";
import { type Middleware } from "grammy";
import { createLogger, type Logger } from "@repo/logger";
import { type BotContext } from "../types.js";

export function makeLoggerMiddleware(log: Logger): Middleware<BotContext> {
  return async (ctx, next) => {
    const requestId = randomUUID();
    const updateId = ctx.update.update_id;
    const chatId = ctx.chat?.id?.toString();
    const userId = ctx.from?.id?.toString();
    const username = ctx.from?.username;

    const child = log.child({
      request_id: requestId,
      update_id: updateId,
      chat_id: chatId,
      user_id: userId,
      username,
    });

    ctx.log = child;
    ctx.requestId = requestId;

    let action: string | undefined;
    if (ctx.message?.text) action = ctx.message.text;
    else if (ctx.callbackQuery?.data) action = `cb:${ctx.callbackQuery.data}`;
    else if (ctx.inlineQuery?.query) action = `inline:${ctx.inlineQuery.query}`;
    else if (ctx.myChatMember) action = "my_chat_member";

    child.info(
      { action, update_type: action ? action.split(":")[0] : "other" },
      "bot.update.start"
    );

    const start = Date.now();
    try {
      await next();
      child.info({ duration_ms: Date.now() - start }, "bot.update.end");
    } catch (err) {
      child.error(
        { err, duration_ms: Date.now() - start },
        "bot.update.unhandled"
      );
      throw err;
    }
  };
}

export const loggerMiddleware = makeLoggerMiddleware(createLogger("bot"));
