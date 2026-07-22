import { BotContext } from "../types.js";

// Group-side gate for the experimental AI agent. Private DMs are always
// allowed; groups must have opted in via Chat.agentEnabled. Fails closed:
// a broken lookup must not fire a flaky experimental feature.
export const isAgentAllowed = async (ctx: BotContext): Promise<boolean> => {
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
    ctx.log.error({ err, chat_id: ctx.chat.id }, "agent.gate.check.failed");
    return false;
  }
};
