# Broadcast History & Stateful Actions — Design

**Date:** 2026-04-19
**Status:** Draft for review
**Related:** extends the admin broadcast tool introduced in earlier PRs.

## Goal

Track every admin broadcast and every per-recipient delivery so the admin can later **retract**, **edit**, or **resend** messages — whole-broadcast or per-recipient. Replaces today's fire-and-forget send with a persisted, stateful history.

## Scope

**In:** persistence + history UI + retract + edit (text/caption + media swap) + resend.
**Out (future work):** full audit trail of every edit, undo-retract, multi-broadcast bulk actions, async job runner, admin RBAC beyond current allowlist.

## Architecture

A single Postgres database (existing `packages/database` / Prisma) gains two tables: `Broadcast` (one row per admin send action) and `BroadcastDelivery` (one row per recipient, with the Telegram `message_id` needed for later edit/delete).

The send path changes from "send + return result" to "persist intent → send → update rows → return result". Retract/edit/resend are new tRPC mutations that read from and mutate `BroadcastDelivery`.

The admin app gains a sidebar shell + two sub-routes inside a `Broadcast` section: `/broadcast/compose` (existing composer) and `/broadcast/history` with a `/:broadcastId` detail sheet.

## Tech stack

- **Backend:** Prisma migration + tRPC v11 mutations/queries in `packages/trpc/src/routers/admin/`. Telegram API calls via the existing `ctx.teleBot` (telegraf).
- **Frontend:** Vite + React 19 admin app, adds `react-router-dom` for sidebar routing. Reuses existing shadcn primitives (Dialog, Sheet, DropdownMenu).
- **Auth:** existing `requireSession` guard — no new roles.

---

## 1. UI Shell + Navigation

The admin app moves from a single view to a sidebar layout. Broadcast is the first (and only) section today; additional tools slot in later as sibling items. Inside the broadcast section, two sub-items: **Compose** and **History**.

```
┌──────────────────┬──────────────────────────────────────────┐
│ 🍌 Admin         │                                          │
│                  │   (content area renders current route)   │
│ ▼ Broadcast      │                                          │
│     Compose      │                                          │
│     History      │                                          │
│                  │                                          │
│ (future items…)  │                                          │
│                  │                                          │
│ ──────────────── │                                          │
│ @bubuding0809    │                                          │
│ Logout           │                                          │
└──────────────────┴──────────────────────────────────────────┘
```

- Add `react-router-dom` to `apps/admin`.
- Routes: `/broadcast/compose` (default redirect from `/`), `/broadcast/history`, `/broadcast/history/:broadcastId`.
- New `AdminShell.tsx` wraps the router outlet with the sidebar and the existing session chip.
- Sidebar is a plain flex layout using current Tailwind patterns — no shadcn `Sidebar` install.
- Sub-nav is collapsible-capable but renders expanded when there's only one section. Ready for 3+ siblings later with zero refactor.

## 2. Data Model

```prisma
model Broadcast {
  id                  String            @id @default(cuid())
  createdByTelegramId BigInt
  createdAt           DateTime          @default(now())

  // content snapshot — immutable. Edits mutate Deliveries, not this row.
  text                String
  mediaKind           BroadcastMediaKind?  // PHOTO | VIDEO | null
  mediaFileId         String?              // Telegram file_id for reuse
  mediaFileName       String?

  status              BroadcastStatus   @default(SENDING)

  // resend lineage
  parentBroadcastId   String?
  parent              Broadcast?        @relation("Resend", fields: [parentBroadcastId], references: [id])
  children            Broadcast[]       @relation("Resend")

  deliveries          BroadcastDelivery[]

  @@index([createdAt])
  @@index([createdByTelegramId, createdAt])
}

model BroadcastDelivery {
  id                String            @id @default(cuid())
  broadcastId       String
  broadcast         Broadcast         @relation(fields: [broadcastId], references: [id], onDelete: Cascade)

  // recipient snapshot (names at send time — user may rename later)
  userId            BigInt            // soft ref to User.id, no FK (supports deleted users)
  username          String?
  firstName         String

  telegramChatId    BigInt            // private chat id (== userId for DMs; stored explicitly for clarity)
  telegramMessageId BigInt?           // null until status = SENT

  status            DeliveryStatus    @default(PENDING)
  error             String?

  sentAt            DateTime?
  lastEditedAt      DateTime?
  retractedAt       DateTime?

  // shallow edit snapshot (most recent only — full history is out of scope)
  editedText        String?
  editedMediaFileId String?

  @@unique([broadcastId, userId])
  @@index([userId, sentAt])
  @@index([status])
}

enum BroadcastMediaKind { PHOTO VIDEO }
enum BroadcastStatus    { SENDING SENT FAILED }
enum DeliveryStatus     { PENDING SENT FAILED RETRACTED EDITED }
```

**Rationale:**
- `Broadcast` content is a snapshot and never mutates, giving a durable audit anchor.
- `BroadcastDelivery.userId` is a soft reference (no FK) so retracts still work if a user is later removed.
- `@@unique([broadcastId, userId])` prevents duplicate deliveries per recipient per broadcast.
- `parentBroadcastId` threads resend lineage for traceability.

## 3. Send Flow

`broadcast.create(input: { text, targetUserIds?, media? })` replaces today's broadcast mutation.

1. Resolve targets (today's `resolveTargets` logic — all users or the listed IDs).
2. In a single DB transaction: insert `Broadcast` (status=SENDING) + N `BroadcastDelivery` rows (status=PENDING).
3. Iterate deliveries (100ms spacing, as today):
   - Call the appropriate Telegram method (`sendMessage` / `sendPhoto` / `sendVideo`).
   - On success: update delivery → `status=SENT, telegramMessageId, sentAt`.
   - On failure: update delivery → `status=FAILED, error`.
4. After loop: flip `Broadcast.status` → `SENT` (or `FAILED` if zero successes).
5. Response returns `{ broadcastId, successCount, failCount, successes[], failures[] }` — super-set of today's `BroadcastResult`, so today's `BroadcastResultsDialog` keeps working unchanged.

**Why pre-insert before sending?** If the request times out or the admin refreshes, the History page shows "12 of 50 sent" instead of nothing. Retract/edit mutations read from the same rows — no dual source of truth.

## 4. tRPC Surface

```ts
broadcast.create({ text, targetUserIds?, media? })        // returns BroadcastResult
broadcast.list({ cursor?, limit? })                        // paginated history (25/page)
broadcast.get(broadcastId)                                 // broadcast + all deliveries
broadcast.retract({ broadcastId, deliveryIds? })           // returns per-delivery results
broadcast.edit({ broadcastId, deliveryIds?, text?, media? })
broadcast.resend({ broadcastId, deliveryIds?, text?, media? })  // same shape as create; sets parentBroadcastId
```

All mutations go through the existing `requireSession` guard + allowlist check.

## 5. History + Detail UI

### History list (`/broadcast/history`)

Table of past broadcasts, newest first, cursor-paginated (25/page).

```
┌──────────────┬─────────────────────────────┬─────┬──────┬─────────────────────────┐
│ Sent         │ Preview                     │ 📎  │ Sent │ Status                  │
├──────────────┼─────────────────────────────┼─────┼──────┼─────────────────────────┤
│ 2m ago       │ Heads up — v2 ships tonight…│     │ 47/50│ ✓ Sent    [··· actions] │
│ 2h ago       │ [Photo] Beta invite          │ 🖼  │ 12/12│ ✓ Sent    [··· actions] │
│ Yesterday    │ Weekly digest               │     │ 48/50│ ⚠ 1 retr. [··· actions] │
│ Mar 10       │ Maintenance tonight…        │     │ 50/50│ ✎ 50 edit [··· actions] │
└──────────────┴─────────────────────────────┴─────┴──────┴─────────────────────────┘
```

- **Preview**: first 60 chars of text, ellipsised.
- **Sent column**: `successCount / totalRecipients`. Cell turns amber on any failure.
- **Status cell** is computed from delivery rows: "Sent", "N retracted", "N edited", "Partial failure", "Interrupted".
- **Row actions menu** (`···`): Retract all, Edit all, Resend all, Resend to failures, Open detail. Destructive actions confirm first.
- Clicking anywhere else on a row opens the detail sheet.
- Top-of-page filters: "Show failed only" toggle, free-text search on preview.

### Detail sheet (`/broadcast/history/:broadcastId`)

Right-side shadcn `Sheet` over the history table. URL-addressable; closes with Escape.

```
┌─────────────────────────────────────────┐
│  ← Broadcast details                  ✕ │
│                                         │
│  Sent by @bubuding0809 • Mar 10, 14:22  │
│  Status: Sent • 47/50 delivered         │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │ Heads up — v2 ships tonight…      │  │
│  │ (full message, MarkdownV2)        │  │
│  └───────────────────────────────────┘  │
│                                         │
│  [Edit all]  [Retract all]  [Resend…]   │
│                                         │
│  ─── Recipients ──────────────────── N  │
│  Filter: [All ▾] [Sent] [Failed] [Retr] │
│                                         │
│  ☐ @alice      Alice Tan   ✓ Sent       │
│  ☐ @bob        Bob Lee     ✎ Edited 2×  │
│  ☐ @carol      Carol Mah   ⌫ Retracted  │
│  ☐ (no user)   Dave Ong    ✗ blocked    │
│                                         │
│  [2 selected]  [Retract] [Edit] [Resend]│
└─────────────────────────────────────────┘
```

- Delivery row: checkbox, username/firstName chip, status badge, per-row kebab menu for single-target actions.
- Status filter chips narrow the list (client-side — all deliveries already loaded).
- **Footer action bar** appears when ≥1 row is checked; its actions apply only to selected rows.
- Resend from detail opens the composer dialog pre-filled with the original text, media, and recipient set.

**Data fetching:**
- `broadcast.list` returns list rows only (no deliveries) — small payload.
- `broadcast.get(broadcastId)` pulls the broadcast + all deliveries in one query. At the 500-recipient ceiling this stays under a few hundred KB.
- No delivery-level pagination or server-side filter push-down; defer until volume demands it.

## 6. Action Mechanics

### Retract

```
broadcast.retract({ broadcastId, deliveryIds? })
  → { results: [{ deliveryId, userId, username, firstName, ok, error? }] }
```

Per targeted delivery:
1. Load row; verify it belongs to `broadcastId`.
2. Skip if `status !== SENT && status !== EDITED`; report as skipped, not errored.
3. `ctx.teleBot.deleteMessage(telegramChatId, Number(telegramMessageId))`.
4. On success: `status=RETRACTED, retractedAt=now()`. On failure: keep status, write `error`.

100ms spacing between calls, via a shared `withRateLimit(100)` helper extracted from the existing send loop in `packages/trpc/src/services/broadcast.ts`. All three mutations (send, retract, edit) reuse it.

### Edit

```
broadcast.edit({ broadcastId, deliveryIds?, text?, media? })
  → { results: [...] }
```

Server picks the Telegram method per delivery:

| Current | Change | Method |
|---|---|---|
| Text | text only | `editMessageText` |
| Photo/Video | caption only | `editMessageCaption` |
| Photo/Video | media (± caption) | `editMessageMedia` |
| Text → add media | rejected | `{ ok: false, error: "cannot_add_media_to_text" }` |
| Media → remove media | rejected | `{ ok: false, error: "cannot_remove_media" }` |

Rejections surface as `skipped` in the result so the UI can show a clear "Retract and resend instead" callout. On success: `status=EDITED, lastEditedAt=now(), editedText/editedMediaFileId` updated. `Broadcast` snapshot never mutates.

### Resend

```
broadcast.resend({ broadcastId, deliveryIds?, text?, media? })
  → same shape as broadcast.create
```

Wrapper over the same internal `createBroadcast` helper used by `broadcast.create`:
1. Resolve targets: if `deliveryIds` given, map them to their recipient `userId`s on the source broadcast; else use every delivery's `userId` on the source.
2. If `text`/`media` omitted in the input, copy from the source `Broadcast`'s content snapshot.
3. Call `createBroadcast({ text, media, targetUserIds, parentBroadcastId: source.id })`.

UI entry points:
- **"Resend to failures"** — one-click row action, targets deliveries where `status=FAILED`, reuses original content.
- **"Resend…"** — opens the composer dialog pre-filled with original content + target set.

The new broadcast appears as its own row in History with a small "↳ Resent from" link to the parent.

### Authorization

Every mutation goes through `requireSession` → allowlist check. No new roles.

### Concurrency

Concurrent edits/retracts on the same delivery: the second mutation sees the updated `status` and reports `skipped`. No distributed locking required at this scale.

### Confirmation gates

- Whole-broadcast retract: confirm dialog with recipient count.
- Per-recipient retract: confirm with selected count.
- Edit: single confirm-and-save button inside the edit dialog.
- Resend to failures: confirm with target count.
- Resend via composer: existing `ConfirmBroadcastDialog` reused.

## 7. Error Handling + Edge Cases

| Scenario | Handling |
|---|---|
| Bot can't DM user who never `/start`ed it | Delivery row → `status=FAILED, error="blocked_by_user"`. "Blocked" badge in detail. |
| Telegram 429 rate limit | Back off per `retry_after` in the error payload; retry once. Existing 100ms spacing keeps this rare. |
| `deleteMessage` on a private chat | No 48h restriction for bots in DMs — no special handling. |
| `editMessage*` time limit | No time limit for bots editing their own messages — no special handling. |
| Text↔media edit attempted | Server rejects early with a structured error code; UI shows "Retract and resend instead." |
| `editMessageMedia` payload error (bad format, too large) | Per-delivery error surfaces; other deliveries still proceed. |
| Crash after transaction, before/mid send | `Broadcast.status=SENDING` older than 10 min → History row shows "Interrupted" status and the row-actions menu offers **Resume send**, which processes remaining `PENDING` deliveries only. No auto-retry. |
| User deleted between send and retract | `BroadcastDelivery` holds `telegramChatId` directly — retract still works. |
| Duplicate user IDs in input | Server filters duplicates before the insert transaction; `@@unique([broadcastId, userId])` is the safety net. |

### Input validation (server-side, boundary)

- `text`: 1–4096 chars (Telegram message limit).
- `media.buffer`: ≤10MB photo, ≤50MB video.
- `targetUserIds`: 1–500 (raising today's cap of 200 to match the UI ceiling).
- `deliveryIds`: all must belong to the referenced `broadcastId`; cross-broadcast IDs → 400.

### Observability

- Per-delivery errors land in `BroadcastDelivery.error`. Admin reads them in the detail panel.
- Broadcast-level audit: `createdByTelegramId` + `createdAt` on `Broadcast`; resend chain via `parentBroadcastId`.
- No separate logging infra added.

## 8. Testing Scope

- **Unit:** Telegram method selection (edit decision table), duplicate dedup, action guards (skipped vs errored vs ok), `Broadcast.status` transitions.
- **Integration:** full send + retract + edit + resend round trip against a mocked Telegraf.
- **Manual UAT:** walk through compose → send → view history → retract → edit → resend, step-by-step via AskUserQuestion once deployed.

## Open Items for Implementation

None blocking. Migration naming will follow existing convention (`YYYYMMDDhhmmss_add_broadcast_tables`).
