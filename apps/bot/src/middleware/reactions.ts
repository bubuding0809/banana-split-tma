import { BotContext } from "../types.js";
import { NextFunction } from "grammy";
import { reactWithFallback } from "../utils/reactions.js";

// Acknowledge any message intended for the bot with an instant reaction so the
// user sees something happen even before the actual handler runs. We don't
// react to every message in a group — only ones routed at the bot.
export async function reactionsMiddleware(ctx: BotContext, next: NextFunction) {
  if (shouldReact(ctx)) {
    // Fire-and-forget so we don't block downstream handlers.
    void reactWithFallback(ctx);
  }
  await next();
}

function shouldReact(ctx: BotContext): boolean {
  if (!ctx.message) return false;

  const text = ctx.message.text || ctx.message.caption || "";
  const isCommand = text.startsWith("/");

  if (ctx.chat?.type === "private") {
    // Private DM: any user message (text/photo/etc.) is bot-targeted by definition.
    return true;
  }

  // Group / supergroup / channel: only react when the bot is being addressed.
  const botUsername = ctx.me?.username;
  const isMentioned = botUsername
    ? new RegExp(`@${botUsername}\\b`, "i").test(text)
    : false;
  const isReplyToBot = ctx.message.reply_to_message?.from?.id === ctx.me?.id;

  return isCommand || isMentioned || isReplyToBot;
}
