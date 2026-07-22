import { BotContext } from "../types.js";

// Multiple call sites (reactions middleware + the mention/command handlers)
// gate the same incoming update, which would otherwise fire the getChat
// lookup twice per update. Memoize per ctx object — grammY shares one ctx
// instance across all middleware/handlers processing a given update, so
// this naturally scopes the cache to a single update's lifetime without
// ever growing unbounded (WeakMap entries are GC'd with the ctx).
const gateCache = new WeakMap<object, Promise<boolean>>();

// Group-side gate for the experimental AI agent. Private DMs are always
// allowed; groups must have opted in via Chat.agentEnabled. Fails closed:
// a broken lookup must not fire a flaky experimental feature.
export const isAgentAllowed = (ctx: BotContext): Promise<boolean> => {
  const cached = gateCache.get(ctx as object);
  if (cached) return cached;

  const result = checkAgentAllowed(ctx);
  gateCache.set(ctx as object, result);
  return result;
};

const checkAgentAllowed = async (ctx: BotContext): Promise<boolean> => {
  if (!ctx.chat) return false;
  if (ctx.chat.type === "private") return true;

  try {
    const chat = await ctx.trpc.chat.getChat({ chatId: ctx.chat.id });
    if (!chat.agentEnabled) {
      ctx.log.info({ chat_id: ctx.chat.id }, "agent.gated");
      return false;
    }
    return true;
  } catch (err) {
    if (isNotFoundError(err)) {
      // Benign/expected: the chat row hasn't been created yet (e.g. bot
      // added to a group but /start never run). Not worth error-level noise.
      ctx.log.info({ chat_id: ctx.chat.id }, "agent.gated.no_chat");
      return false;
    }
    ctx.log.error({ err, chat_id: ctx.chat.id }, "agent.gate.check.failed");
    return false;
  }
};

function isNotFoundError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "NOT_FOUND"
  );
}
