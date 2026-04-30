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

  // Linked-channel posts auto-forward into the discussion group. We don't
  // want to react to those even if they happen to contain `/` or `@bot`.
  if (ctx.message.is_automatic_forward) return false;

  if (ctx.chat?.type === "private") {
    // Private DM: any user message (text/photo/etc.) is bot-targeted by definition.
    return true;
  }

  const text = ctx.message.text || ctx.message.caption || "";
  const botUsername = ctx.me?.username;

  // A `/cmd@target_bot` is bot-targeted ONLY if `target_bot` matches us. A
  // bare `/cmd` (no @target) is still ambiguous in multi-bot groups; we
  // accept it because grammY treats it that way and other handlers will
  // ignore it if not theirs.
  let isCommand = text.startsWith("/");
  if (isCommand && botUsername) {
    const firstToken = text.split(/\s+/)[0] ?? "";
    const target = firstToken.split("@")[1];
    if (target && target.toLowerCase() !== botUsername.toLowerCase()) {
      isCommand = false;
    }
  }

  const isMentioned = botUsername
    ? new RegExp(`@${botUsername}\\b`, "i").test(text)
    : false;
  const isReplyToBot = ctx.message.reply_to_message?.from?.id === ctx.me?.id;

  return isCommand || isMentioned || isReplyToBot;
}
