import { BotContext } from "../types.js";
import { NextFunction } from "grammy";
import { reactWithFallback } from "../utils/reactions.js";
import { isAgentAllowed } from "../utils/agentGate.js";

// Acknowledge any message intended for the bot with an instant reaction so the
// user sees something happen even before the actual handler runs. We don't
// react to every message in a group — only ones routed at the bot.
//
// Agent-bound triggers (mention, reply-to-bot, `/ask`, `/do`) share the
// per-group opt-in gate with the actual handlers in group.ts/agent.ts: a
// gated group must get a fully silent ignore (spec decision), so we can't
// tip our hand with a reaction here either. Non-agent triggers (other
// commands) are unaffected by the gate.
export async function reactionsMiddleware(ctx: BotContext, next: NextFunction) {
  const trigger = getReactionTrigger(ctx);

  if (trigger === "agent") {
    if (await isAgentAllowed(ctx)) {
      // Fire-and-forget so we don't block downstream handlers.
      void reactWithFallback(ctx);
    }
  } else if (trigger === "other") {
    void reactWithFallback(ctx);
  }

  await next();
}

type ReactionTrigger = "agent" | "other" | null;

function getReactionTrigger(ctx: BotContext): ReactionTrigger {
  if (!ctx.message) return null;

  // Linked-channel posts auto-forward into the discussion group. We don't
  // want to react to those even if they happen to contain `/` or `@bot`.
  if (ctx.message.is_automatic_forward) return null;

  if (ctx.chat?.type === "private") {
    // Private DM: any user message (text/photo/etc.) is bot-targeted by
    // definition, and always routes to the agent (isAgentAllowed is a no-op
    // allow for private chats, so gating here is free).
    return "agent";
  }

  const text = ctx.message.text || ctx.message.caption || "";
  const botUsername = ctx.me?.username;

  // A `/cmd@target_bot` is bot-targeted ONLY if `target_bot` matches us. A
  // bare `/cmd` (no @target) is still ambiguous in multi-bot groups; we
  // accept it because grammY treats it that way and other handlers will
  // ignore it if not theirs.
  let isCommand = text.startsWith("/");
  let commandName: string | undefined;
  if (isCommand) {
    const firstToken = text.split(/\s+/)[0] ?? "";
    const target = firstToken.split("@")[1];
    if (
      botUsername &&
      target &&
      target.toLowerCase() !== botUsername.toLowerCase()
    ) {
      isCommand = false;
    } else {
      commandName = firstToken.split("@")[0]?.slice(1).toLowerCase();
    }
  }

  if (isCommand) {
    // `/ask` and `/do` are agent entry points gated the same as mentions;
    // every other command reacts unconditionally.
    return commandName === "ask" || commandName === "do" ? "agent" : "other";
  }

  const isMentioned = botUsername
    ? new RegExp(`@${botUsername}\\b`, "i").test(text)
    : false;
  const isReplyToBot = ctx.message.reply_to_message?.from?.id === ctx.me?.id;

  return isMentioned || isReplyToBot ? "agent" : null;
}
