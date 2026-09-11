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

### New env var

`TELEGRAM_API_ROOT`, optional. Read in `packages/trpc` env schema and `apps/lambda/env`. When set, passed as `apiRoot` to the Telegram client. Exists only so the recording proxy in the Testing section can sit between the app and Telegram. Not set in any deployed environment.

### What does not change

Message text, `parse_mode: "MarkdownV2"`, `escapeMarkdown`, `mentionMarkdown`, deep-link creation, thread ids, all handler logic, all trpc procedure contracts, OpenAPI metadata, `apps/bot` feature code beyond the version bump.

## Testing

### Automated

Three layers, weakest to strongest.

**Compile.** `pnpm check-types` across the workspace. The type swap surfaces every positional-argument mismatch at compile time. Catches the four signature deltas and the media-input change. Does not catch serialization drift.

**Existing unit specs.** `pnpm test`. Five telegram router specs and two lambda tests assert on `mockTeleBot.*` call args and stay green. Specs that assert on `editMessageText` positional args need the `undefined` slot removed from their expectations. Lambda tests re-point `vi.mock`. Mocks are shape-only, so this layer cannot tell whether grammy puts different bytes on the wire.

**Recorded Telegram traffic, baseline vs branch.** Rendering in Telegram is a function of the JSON the Bot API receives, and Telegram's response to every send or edit is the full `Message` it will render, entities included. Record both on `main`, record both on the branch, diff.

**New helper tests.** `inlineKeyboard` returns `{ reply_markup: { inline_keyboard: [buttons] } }`. The file-URL helper builds the expected URL and returns null when `file_path` is absent.

### Recording proxy

One env var, `TELEGRAM_API_ROOT`, optional, default `https://api.telegram.org`. `withCreateTRPCContext` passes it to the client constructor (`new Telegram(token, { apiRoot })` today, `new Api(token, { apiRoot })` after), and the four lambda handlers do the same. Both libraries support the option. Production never sets it.

`scripts/telegram-recording-proxy.ts` starts a local HTTP server on `:8082` that forwards every request to `https://api.telegram.org`, streams the response back unchanged, and appends one line to a JSONL log:

```json
{ "seq": 1, "method": "sendMessage", "request": { …parsed body… }, "response": { …Telegram JSON… } }
```

Multipart requests (`sendPhoto`, `sendVideo`, `editMessageMedia`) are parsed into fields, with file parts replaced by `{ filename, bytes, sha256 }`. The bot token is stripped from the logged path.

### Automated staging UAT over HTTP

The dev server is the production code path: Express, auth middleware, `withCreateTRPCContext`, input parsing, then the handler. Calling it over HTTP exercises all of it. Calling `createCaller` in-process would skip the first three.

`scripts/uat-telegram-clients.ts`:

1. Starts the recording proxy.
2. Starts `apps/lambda` dev server (`pnpm --filter lambda dev`, port 8081) with `TELEGRAM_API_ROOT=http://localhost:8082` plus the usual `apps/lambda` env: staging bot token, local docker postgres, `API_KEY`. Waits for `GET /` to answer.
3. Calls procedures through `@trpc/client` against `http://localhost:8081/api/trpc` with the `x-api-key` header, the same way `apps/web` does. Admin broadcast goes through `POST /api/admin/broadcast` as multipart, avatar and chat photo through `GET /api/avatar` and `GET /api/chat-photo`.
4. Stops both servers, writes `<out>/uat-<git-sha>.jsonl`.

Target group: DEV-BOX-2 (`-1002371842523`). Steps:

| Step | HTTP call | Exercises |
|---|---|---|
| 1 | `telegram.sendGroupReminderMessage` | `sendMessage` + `inlineKeyboard` |
| 2 | `expense.create` with a fixed payload | `sendMessage` notification |
| 3 | `expense.update` amount | `editMessageText` |
| 4 | `expense.delete` | `deleteMessage` |
| 5 | `snapshot.share` then `snapshot.renderSnapshotView` per view | `sendMessage` with callback keyboard, and the handler a button tap invokes |
| 6 | `POST /api/admin/broadcast` to the runner's own user id with a fixture photo | `sendPhoto` + `InputFile`, multer path |
| 7 | `broadcast.editCaption` then `broadcast.editMedia` | `editMessageCaption`, `editMessageMedia` |
| 8 | `GET /api/avatar`, `GET /api/chat-photo` | `getUserProfilePhotos`, `getChat`, `getFile`, file download, `_redact` path |

Exact procedure names and the auth each route expects are confirmed in the plan. Any step where the dev server or Telegram returns an error fails the run. That is the runtime shape of a serialization regression: `can't parse entities`, `wrong file identifier`, `reply markup is invalid`.

**Diff.** `scripts/diff-telegram-recordings.ts <baseline.jsonl> <branch.jsonl>` pairs entries by `seq` and compares:

- Request side: `method`, `chat_id`, `text`, `parse_mode`, `reply_markup`, `message_thread_id`, `caption`, multipart fields and file `sha256`. Ignores `message_id`, which differs per run.
- Response side: `text`, `entities`, `reply_markup`, `caption`, `caption_entities`, `photo[].file_unique_id`. Ignores `message_id`, `date`, `edit_date`, `chat`, `from`.

Run the script once on `main` before the swap, once on the branch after. An empty diff is the pass. Both batches also sit adjacent in DEV-BOX-2, so the user's eyeball pass is one scroll rather than an eight-step walkthrough.

**Permanent guard.** Staging recordings depend on live DB state, so they are not replayable in CI. The committed guard is a vitest wire-snapshot spec in `packages/trpc`: each handler that talks to Telegram runs with a mocked DB against a fake Bot API server (the same body parser the proxy uses), and the recorded `{ method, body }` calls are `toMatchSnapshot()`. Snapshots are recorded while telegraf is still the client, and the swap commit must leave them byte-identical. Future message-format changes fail CI unless the snapshot is regenerated on purpose. Staging JSONL files stay local under `apps/lambda/.uat/`, gitignored.

**Cleanup.** The expense is deleted by step 4. Snapshot and broadcast rows are removed at the end. Sent messages stay in the group for the eyeball pass.

**Authorization.** Per the staging-test-groups note, an agent reading the bot token and calling `api.telegram.org` needs explicit in-chat authorization. The user gave it for this work on 2026-09-11. The token is read into the process from `.env`, never printed, and stripped from the proxy log.

## Rollout

Single PR. No schema change. One optional env var that no deployed environment sets. `deploy.yml` redeploys bot, lambda, and web on merge. Rollback is a plain revert.

## Follow-on: `/summary` rich-message spike

Out of scope for this spec, recorded so the plan sequences it correctly.

Convert `sendGroupReminderMessage` to `teleBot.sendRichMessage(chatId, { html })`. The `View Debts 💰` inline keyboard becomes an embedded `<tg-button-row align="center">` with one `type="url"` button. Rich HTML over Rich Markdown because escaping is only `& < >`. `mentionMarkdown` becomes `<a href="tg://user?id=…">`. Heading and blockquote for the simplification note come free.

Spike output is a rendering verdict across iOS, Android, Desktop, and one outdated client, plus whether the embedded button reads better than the inline keyboard. Code is throwaway until the user says keep.
