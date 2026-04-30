import { BotContext } from "../types.js";

// Default-set emojis bots are usually allowed to use. Group admins can still
// restrict `available_reactions`, so we fall through the list and use whichever
// the chat accepts. Order = preference.
const DEFAULT_FALLBACK = ["🤔", "👀", "👍"] as const;

export async function reactWithFallback(
  ctx: BotContext,
  emojis: readonly string[] = DEFAULT_FALLBACK
) {
  for (const emoji of emojis) {
    try {
      await ctx.react(emoji as Parameters<typeof ctx.react>[0]);
      return;
    } catch (e) {
      console.warn(`[Reaction] react("${emoji}") rejected:`, e);
    }
  }
}
