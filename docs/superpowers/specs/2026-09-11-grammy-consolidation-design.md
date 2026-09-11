# Consolidate Telegram clients on grammy

**Date:** 2026-09-11
**Status:** Approved, ready for implementation plan
**Related:** Bot API 10.1 / 10.3 rich messages (June and August 2026), follow-on `/summary` rich-message spike

## Problem

The repo talks to the Telegram Bot API through two libraries.

| Package | Library | Role |
|---|---|---|
| `apps/bot` | grammy 1.41.1 | Update handling: webhooks, commands, callback queries, command replies |
| `packages/trpc` | telegraf 4.16.3 | Bare API client only. `ctx.teleBot = new Telegram(botToken)` at `packages/trpc/src/trpc.ts:73`. 26 files import it. |
| `apps/lambda` | telegraf 4.16.3 | Bare API client in `avatar.ts`, `chat-photo.ts`, `recurring-expense-tick.ts`, `api/index.ts` |
| `packages/trpc` | node-telegram-bot-api 0.66.0 | Listed in deps, zero imports. Dead. |

Nothing uses telegraf's framework half. It is an HTTP client with types.

Telegram shipped rich messages in Bot API 10.1 and embedded buttons in 10.3. We want them, starting with `/summary`. telegraf 4.16.3 is the latest release on npm and stops at Bot API 7.x, so it has no `sendRichMessage`, no `rich_message` on `editMessageText`, and no `<tg-button>` typings. grammy 1.46.0 ships Bot API 10.3 typings in full.

Two paths: bolt a raw `callApi("sendRichMessage", …)` shim onto telegraf with hand-typed params, or move the client role to grammy's standalone `Api` class and retire telegraf. The user chose the second.

## Goal

One Telegram library across the workspace, at a version that exposes rich messages. Zero behavior change in this PR. Every message the bot sends today renders identically afterward.

## Non-goals

- Sending any rich message. That is the follow-on spike.
- Changing message content, formatting, or button layout.
- Replacing grammy's framework usage in `apps/bot`. Already grammy.
- Retiring `escapeMarkdown` / MarkdownV2. Rich HTML escaping arrives with the spike.

## Design

### Dependencies

- Add `grammy@^1.46.0` to `packages/trpc` and `apps/lambda`.
- Bump `apps/bot` from `^1.41.1` to `^1.46.0`. grammy 1.42 through 1.46 are minor releases with no documented breaking changes, deprecations, or Node floor changes. Engines: `^12.20.0 || >=14.13.1`. We run Node 24.
- Remove `telegraf` from `packages/trpc` and `apps/lambda`.
- Remove `node-telegram-bot-api` and `@types/node-telegram-bot-api` from `packages/trpc`.
- pnpm resolves one grammy version workspace-wide. `pnpm install` regenerates the lockfile.

### trpc context

`packages/trpc/src/trpc.ts:73` becomes `teleBot: new Api(botToken)`. The context field keeps its name. Every spec that passes `mockTeleBot as any` keeps working because the mocks are shape-only.

The 26 importing files change `import { Telegram } from "telegraf"` (or `import type`) to `import type { Api } from "grammy"` and the parameter type `Telegram` to `Api`.

### Call signature deltas

grammy's `Api` mirrors the Bot API method names and positional arguments. Most calls carry over unchanged:

`sendMessage`, `getMe`, `getChat`, `getChatMember`, `deleteMessage`, `sendPhoto`, `sendVideo`, `getUserProfilePhotos`.

Four differ. telegraf inserts an `inline_message_id` positional slot on edit methods that grammy does not have.

| Call | telegraf (today) | grammy (after) | Sites |
|---|---|---|---|
| `editMessageText` | `(chat, msg, undefined, text, extra)` | `(chat, msg, text, extra)` | `editExpenseNotificationMessage.ts:135`, `services/broadcastActions.ts:127` |
| `editMessageCaption` | `(chat, msg, undefined, caption, extra)` | `(chat, msg, { caption, ...extra })` | `services/broadcastActions.ts:137` |
| `editMessageMedia` | `(chat, msg, undefined, media, extra)` | `(chat, msg, media, extra)` | `services/broadcastActions.ts:142` |
| Media upload input | `{ source: buffer, filename }` | `new InputFile(buffer, filename)` | `services/broadcast.ts:108,121`, `services/broadcastActions.ts:148` |

`inlineKeyboard(buttons)` from `telegraf/markup` returns `{ reply_markup: { inline_keyboard: [buttons] } }`. Replace with a one-line helper of the same name and return shape in `packages/trpc/src/utils/telegram.ts`, so the three call sites (`sendGroupReminderMessage.ts:275`, `sendExpenseNotificationMessage.ts:271`, `editExpenseNotificationMessage.ts:132,197`) only change their import line. grammy's `InlineKeyboard` builder class is not needed for a single row of url buttons.

### Lambda

Four files swap `new Telegram(token)` for `new Api(token)`.

`getFileLink(fileId)` has no grammy equivalent. `avatar.ts:133` and `chat-photo.ts:101` use it to fetch photo bytes. Replace with:

```ts
const file = await teleBot.getFile(fileId);
if (!file.file_path) return res.status(404).end();
const url = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
const upstream = await fetch(url);
```

Put the URL builder in a small `_telegramFile.ts` helper shared by both handlers. `_redact.ts` already scrubs `bot<token>` from error strings on this path and stays as is. Its doc comment references telegraf; update the wording.

`_avatar.test.ts:33` and `_chat-photo.test.ts:34` mock `"telegraf"`. They mock `"grammy"` instead, exposing an `Api` class whose instances carry `getFile`, `getUserProfilePhotos`, `getChat` as `vi.fn()`.

### Error handling

grammy throws `GrammyError` for API-level failures with `description` and `error_code`, and `HttpError` for transport failures. Existing catch blocks match on `error.message.includes("chat not found")` and similar. `GrammyError.message` is `Call to 'sendMessage' failed! (400: Bad Request: chat not found)`, so the substring checks keep matching. No catch-block changes.

### What does not change

Message text, `parse_mode: "MarkdownV2"`, `escapeMarkdown`, `mentionMarkdown`, deep-link creation, thread ids, all handler logic, all trpc procedure contracts, OpenAPI metadata, `apps/bot` feature code beyond the version bump.

## Testing

### Automated

Three layers, weakest to strongest.

**Compile.** `pnpm check-types` across the workspace. The type swap surfaces every positional-argument mismatch at compile time. Catches the four signature deltas and the media-input change. Does not catch serialization drift.

**Existing unit specs.** `pnpm test`. Five telegram router specs and two lambda tests assert on `mockTeleBot.*` call args and stay green. Specs that assert on `editMessageText` positional args need the `undefined` slot removed from their expectations. Lambda tests re-point `vi.mock`. Mocks are shape-only, so this layer cannot tell whether grammy puts different bytes on the wire.

**Wire-level golden fixtures.** Rendering in Telegram is a function of the JSON the Bot API receives. Lock that directly.

- Both libraries accept a custom `apiRoot`. A vitest helper starts a local HTTP server that records `{ method, body }` per request and answers with a canned `{ ok: true, result: { message_id: 1, … } }`.
- Step one, on `main` before the swap: run every handler that calls `teleBot` (all 14 `sendMessage` sites, both `editMessageText` sites, `editMessageCaption`, `editMessageMedia`, `sendPhoto`, `sendVideo`, `deleteMessage`) against that server with fixed DB mocks. Write recorded bodies to `packages/trpc/src/__fixtures__/telegram-wire/<handler>.json`. Commit.
- Step two, after the swap: same tests read the same fixtures and assert deep equality on `chat_id`, `text`, `parse_mode`, `reply_markup`, `message_thread_id`, `message_id`, `caption`. Multipart bodies for `sendPhoto`, `sendVideo`, and `editMessageMedia` are parsed and compared field by field, file bytes included.
- Any diff is a regression found before staging. The fixtures stay in the repo as a permanent guard for future message-format changes.

**New helper tests.** `inlineKeyboard` returns `{ reply_markup: { inline_keyboard: [buttons] } }`. The file-URL helper builds the expected URL and returns null when `file_path` is absent.

### Staging UAT on `@BananaSplitzStgBot`

Local dev against the staging bot per `AGENTS.md`. One pass per changed code path:

| Path | Action | Expect |
|---|---|---|
| `sendMessage` + `inlineKeyboard` | `/summary` in a group with debts | Same text, same "View Debts 💰" button, deep link opens TMA |
| `editMessageText` | Add an expense, then edit its amount in TMA | Notification message updates in place, buttons intact |
| `deleteMessage` | Delete that expense | Notification removed |
| Callback path | Snapshot share, toggle view button | View switches, no error toast |
| `sendPhoto` + `InputFile` | Admin broadcast with photo attachment to self | Photo arrives, caption renders |
| `editMessageCaption` / `editMessageMedia` | Edit that broadcast's caption, then swap media | Both edits land |
| `getFile` | Load TMA member list | Avatars render via `/api/avatar` |
| `getChat` + `getFile` | Load TMA group header | Group photo renders via `/api/chat-photo` |

Backend and DB assertions go to a general-purpose subagent. Message rendering is confirmed by the user one step at a time.

## Rollout

Single PR. No schema change, no env change. `deploy.yml` redeploys bot, lambda, and web on merge. Rollback is a plain revert.

## Follow-on: `/summary` rich-message spike

Out of scope for this spec, recorded so the plan sequences it correctly.

Convert `sendGroupReminderMessage` to `teleBot.sendRichMessage(chatId, { html })`. The `View Debts 💰` inline keyboard becomes an embedded `<tg-button-row align="center">` with one `type="url"` button. Rich HTML over Rich Markdown because escaping is only `& < >`. `mentionMarkdown` becomes `<a href="tg://user?id=…">`. Heading and blockquote for the simplification note come free.

Spike output is a rendering verdict across iOS, Android, Desktop, and one outdated client, plus whether the embedded button reads better than the inline keyboard. Code is throwaway until the user says keep.
