import { Composer } from "grammy";
import { BotContext } from "../types.js";

export const snapshotViewFeature = new Composer<BotContext>();

type RichEditReplyMarkup = {
  inline_keyboard: Array<
    Array<
      { text: string; callback_data: string } | { text: string; url: string }
    >
  >;
};

/**
 * Edit the tapped message as a native rich message (Bot API 10.1
 * `editMessageText` with `rich_message`), matching the rich HTML used for
 * the initial share. `rich_message` isn't in this grammY version's typed
 * RawApi, so we call through a narrow cast. Throws if unsupported — callers
 * fall back to a classic MarkdownV2 edit.
 */
async function editRichSnapshotMessage(
  ctx: BotContext,
  html: string,
  replyMarkup: RichEditReplyMarkup
): Promise<void> {
  const chatId = ctx.chat?.id;
  const messageId = ctx.callbackQuery?.message?.message_id;
  if (chatId === undefined || messageId === undefined) {
    throw new Error("snapshot rich edit: no editable message in context");
  }
  const raw = ctx.api.raw as unknown as {
    editMessageText: (args: Record<string, unknown>) => Promise<unknown>;
  };
  await raw.editMessageText({
    chat_id: chatId,
    message_id: messageId,
    rich_message: { html },
    reply_markup: replyMarkup,
  });
}

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
  const runStart = Date.now();
  ctx.log.info({ snapshot_id: snapshotId, view }, "snapshot.view.start");
  try {
    const { text, html, replyMarkup } =
      await ctx.trpc.snapshot.renderSnapshotView({
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

    // Prefer a rich-message edit so the toggled view keeps the native
    // tables / collapsible blocks of the initial share. Any failure (e.g.
    // an environment without rich-message support) falls back to the
    // classic MarkdownV2 edit. A "message is not modified" rejection means
    // the active view was tapped — rethrow it so the outer catch treats it
    // as a silent success and leaves the rich message untouched (instead of
    // overwriting it with the MarkdownV2 fallback).
    try {
      await editRichSnapshotMessage(ctx, html, replyMarkup);
    } catch (richErr) {
      const rm = richErr instanceof Error ? richErr.message : String(richErr);
      if (rm.includes("message is not modified")) throw richErr;
      ctx.log.warn({ err: richErr }, "snapshot.view.rich.fallback");
      await ctx.editMessageText(text, {
        parse_mode: "MarkdownV2",
        reply_markup: replyMarkup,
      });
    }
    await ctx.answerCallbackQuery();
    ctx.log.info(
      { duration_ms: Date.now() - runStart, outcome: "ok" },
      "snapshot.view.end"
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // "message is not modified" means the user tapped the active view's
    // button — same content, same keyboard, Telegram rejects the edit.
    // Treat it as a silent success.
    if (message.includes("message is not modified")) {
      await ctx.answerCallbackQuery();
      ctx.log.info(
        { duration_ms: Date.now() - runStart, outcome: "not_modified" },
        "snapshot.view.end"
      );
      return;
    }
    ctx.log.error(
      { err, duration_ms: Date.now() - runStart },
      "snapshot.view.failed"
    );
    await ctx.answerCallbackQuery({
      text: "Could not switch view",
      show_alert: false,
    });
  }
});
