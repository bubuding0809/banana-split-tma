import { Composer } from "grammy";
import { BotContext } from "../types.js";

export const snapshotViewFeature = new Composer<BotContext>();

// Callback data shape: `s:<uuid>:<view>`
// Kept short so we stay well under Telegram's 64-byte callback_data cap.
const CALLBACK_RE = /^s:([0-9a-f-]{36}):(cat|date|payer)$/;

snapshotViewFeature.on("callback_query:data", async (ctx, next) => {
  const data = ctx.callbackQuery.data;
  const match = data.match(CALLBACK_RE);
  if (!match) return next();

  const [, snapshotId, view] = match as [
    string,
    string,
    "cat" | "date" | "payer",
  ];

  // Always answer the callback so the user's tap spinner clears, even
  // if the edit below fails. Non-await on the error path is intentional
  // — we don't want the ack to block on a slow Telegram response.
  try {
    const { text, replyMarkup } = await ctx.trpc.snapshot.renderSnapshotView({
      snapshotId,
      // Legacy `payer` callback_data still matches the regex above so
      // old in-history messages aren't silently swallowed — the tRPC
      // call rejects `payer` at the zod boundary, throws, and surfaces
      // the "Could not switch view" toast in the catch block below.
      view: view as "cat" | "date",
      // Forward the tapper's id — the bot's tRPC caller authenticates
      // via superadmin API key, so `ctx.session.user` is null. Passing
      // `userId` lets the procedure authorize the tapper against the
      // chat without relying on session auth.
      userId: ctx.callbackQuery.from.id,
    });

    await ctx.editMessageText(text, {
      parse_mode: "MarkdownV2",
      reply_markup: replyMarkup,
    });
    await ctx.answerCallbackQuery();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // "message is not modified" means the user tapped the active view's
    // button — same content, same keyboard, Telegram rejects the edit.
    // Treat it as a silent success.
    if (message.includes("message is not modified")) {
      await ctx.answerCallbackQuery();
      return;
    }
    console.error("Snapshot view switch failed", err);
    await ctx.answerCallbackQuery({
      text: "Could not switch view",
      show_alert: false,
    });
  }
});
