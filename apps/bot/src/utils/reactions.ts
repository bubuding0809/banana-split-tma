import { BotContext } from "../types.js";
import { GrammyError } from "grammy";

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
      // 429 (rate-limited) and 403 (bot blocked / no permission) won't get
      // better by trying another emoji — bail so we don't 3x the API load.
      if (
        e instanceof GrammyError &&
        (e.error_code === 429 || e.error_code === 403)
      ) {
        console.warn(
          `[Reaction] react("${emoji}") aborted (${e.error_code}):`,
          e.description
        );
        return;
      }
      console.warn(`[Reaction] react("${emoji}") rejected:`, e);
    }
  }
}
