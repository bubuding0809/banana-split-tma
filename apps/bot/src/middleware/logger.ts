import { Middleware } from "grammy";
import { BotContext } from "../types.js";

export const loggerMiddleware: Middleware<BotContext> = async (ctx, next) => {
  const start = Date.now();
  const updateId = ctx.update.update_id;

  // Try to extract useful info about what happened
  let action = "Unknown Update";

  if (ctx.message?.text) {
    action = `Message: "${ctx.message.text}"`;
  } else if (ctx.callbackQuery?.data) {
    action = `Callback: "${ctx.callbackQuery.data}"`;
  } else if (ctx.inlineQuery?.query) {
    action = `Inline Query: "${ctx.inlineQuery.query}"`;
  } else if (ctx.myChatMember) {
    action = `Chat Member Update`;
  }

  const user = ctx.from
    ? `@${ctx.from.username || ctx.from.id}`
    : "Unknown User";
  const chat = ctx.chat ? `[Chat ${ctx.chat.id}]` : "";

  console.log(
    `[${new Date().toISOString()}] ⬇️ [${updateId}] ${user} ${chat} - ${action}`
  );

  try {
    await next();
    const ms = Date.now() - start;
    console.log(
      `[${new Date().toISOString()}] ✅ [${updateId}] Handled in ${ms}ms`
    );
  } catch (error) {
    const ms = Date.now() - start;
    console.error(
      `[${new Date().toISOString()}] ❌ [${updateId}] Failed in ${ms}ms`,
      error
    );
    throw error;
  }
};
