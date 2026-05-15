# Recurring Expense Notification Distinction

**Date:** 2026-05-15
**Status:** Design — pending plan
**Owner:** bubu (@bubuding0809)
**Branch:** `feat/recurring-expense-notification-distinction`

## Problem

The Telegram group notification for a new expense looks identical whether a human submitted it or the recurring-expense lambda fired it on schedule. Members can't tell at a glance that a `Broadband · S$39.90` line they didn't approve was auto-created, and there's no path from the notification to the schedule that produced it. The only affordance is `View Expense`, which lands on the expense detail screen — useful for review, useless for pausing or editing the schedule.

User-reported via screenshot 2026-05-15: two adjacent notifications, one manual (`fairprice · Groceries`), one auto-fired (`Broadband · Utilities`), visually indistinguishable.

## Goals

- **Visible distinction** in the Telegram message body when an expense was auto-created from a `RecurringExpenseTemplate`.
- **One-tap path** from the notification to the specific template that fired it.
- **Preserved on edits** — if a user later edits a recurring-origin expense, the distinction and schedule shortcut stay in the updated message.
- **No regression** for manual expenses: their message and single-button keyboard are unchanged.

## Non-goals

- Visual distinction inside the TMA expense list (`ExpensesList`, snapshot views). Out of scope; this spec covers Telegram-surface notifications only.
- Pause/cancel/skip controls inside the Telegram message itself. The View Schedule button hands off to the existing TMA edit screen, which already owns those controls.
- A separate "your recurring expense fired" DM to the template owner. The group notification is the touchpoint.
- Backfilling old notifications. The change applies to messages sent on/after deploy.

## Trigger flow (no change)

Both surfaces converge on the same handler — that's the seam.

```
Manual:    user submit
        → createExpenseWithRecurrence / createExpense
        → createExpenseHandler
        → sendExpenseNotificationMessageHandler   ◀── seam

Recurring: EventBridge Scheduler
        → external RecurringExpenseLambda (HMAC-signed)
        → POST /recurring-expense-tick           (apps/lambda/api/recurring-expense-tick.ts)
        → createExpenseHandler (with recurringTemplateId)
        → sendExpenseNotificationMessageHandler   ◀── same seam
```

`Expense.recurringTemplateId` (schema.prisma:117) is the source of truth — non-null ⇒ auto-created.

## Message change

### Manual expense (unchanged)

```
🧾 New Expense by 🌸ting

[receipt card: description, category, date]
Total: SGD 32.10

💸 Splits
├ Ruoqian: SGD 16.05
└ 🌸ting:  SGD 16.05

[ View Expense ]
```

### Recurring expense (new)

```
🧾 New Expense by 🌸ting

[receipt card: description, category, date]
Total: SGD 39.90

💸 Splits
├ Ruoqian: SGD 19.95
└ 🌸ting:  SGD 19.95

> 🔁 Auto-created from a recurring schedule

[ View Expense ]  [ View Schedule ]
```

Two diffs vs. manual:

1. **Blockquote footer**: a single Telegram `>` blockquote line under the splits block, above the inline keyboard. Plain text — the schedule button carries the action, so no inline link is needed.
2. **Second inline-keyboard button**: `View Schedule`, side-by-side with `View Expense`. Same row.

### Edit case

When a user edits a recurring-origin expense, the title flips to `Expense Update by <user>` (existing behaviour). The footer line and the `View Schedule` button are preserved because they're derived from `expense.recurringTemplateId` at render time, not stored on the message.

## Inline keyboard layout

Telegram inline keyboards are a 2-D array. Both buttons share row 1 (max ~30 chars combined fits comfortably on a phone):

```ts
// manual
[[ { text: "View Expense", url: viewExpenseUrl } ]]

// recurring
[[
  { text: "View Expense",  url: viewExpenseUrl  },
  { text: "View Schedule", url: viewScheduleUrl },
]]
```

No fallback needed if labels grow — Telegram wraps to a second visual row automatically on narrow widths.

## Deep links

### Existing — View Expense

`packages/trpc/src/routers/telegram/sendExpenseNotificationMessage.ts:225–236` already builds:

```
https://t.me/{bot}?startapp=v1_{g|p}_{chatId}__e_{expenseId}
```

### New — View Schedule

A new entity type `rt` (recurring template) carrying the template UUID:

```
https://t.me/{bot}?startapp=v1_{g|p}_{chatId}__rt_{templateId}
```

**Encoder:** extend `encodeV1DeepLink` (`packages/trpc/src/utils/deepLinkProtocol.ts:10–30`) to accept `"rt"` alongside `"e"`, `"s"`, `"p"`, `"c"`. Base62-encode the UUID, same as existing entities.

**TMA router:** in `apps/web/src/routes/_tma/`, find the start_param parser and add a branch:

```
v1_g_<chatId>_rt_<templateId> → /chat/$chatId/edit-recurring/$templateId
```

The edit-recurring route already exists at `apps/web/src/routes/_tma/chat.$chatId_.edit-recurring.$templateId.tsx`.

### Deep-link discipline — TDD, no regressions

The encoder/decoder is shared infrastructure (`e`, `s`, `p`, `c` entities all flow through it; counterparty deep links and snapshot share URLs depend on it). Any change is a load-bearing edit. Therefore:

- **Write tests first.** Before touching `deepLinkProtocol.ts`, add unit tests that lock the existing behaviour: round-trip for `e`, `s`, `p`, `c`; rejection of malformed payloads; the 64-character `startapp` cap. These tests must pass against the unchanged code.
- **Then add the failing `rt` test.** Round-trip a `rt` payload with a real-shaped UUID; assert the encoded form matches `v1_{g|p}_<base62Chat>__rt_<base62Uuid>` and decodes back to the same fields.
- **Only then change the encoder.** Make the failing test pass without breaking any of the existing-entity tests.
- **Same discipline for the TMA start_param parser.** Lock existing branches (`e`, `s`, `p`, `c`) with tests first, then add the `rt` branch.
- **Manual regression on existing deep links** at UAT time: open one expense via View Expense deep link (no change expected), open one snapshot share URL, open one counterparty deep link. Any of these breaking is a release-blocker.

The bar is: every existing deep link in the wild must continue to resolve to the same screen with the same parameters. The new `rt` type is additive only.

## Plumbing

### `sendExpenseNotificationMessage.ts` (the renderer)

Add to input schema:

```ts
recurringTemplateId: z.string().uuid().nullish(),
```

`formatExpenseMessage()` (L94–177) appends the blockquote when set:

```ts
if (input.recurringTemplateId) {
  lines.push("");
  lines.push("> 🔁 Auto-created from a recurring schedule");
}
```

`sendExpenseNotificationMessageHandler()` (L179–255) builds a second button when set:

```ts
const buttons = [{ text: "View Expense", url: viewExpenseUrl }];
if (input.recurringTemplateId) {
  const sched = encodeV1DeepLink(BigInt(input.chatId), chatType, "rt", input.recurringTemplateId);
  buttons.push({ text: "View Schedule", url: createDeepLinkedUrl(bot, sched, "app") });
}
reply_markup: { inline_keyboard: [buttons] };
```

### `createExpenseHandler` (the caller — `createExpense.ts:441–468`)

Pass through whatever it already has. The handler accepts `recurringTemplateId` on the way in (used to set `Expense.recurringTemplateId`); forward the same value to the notification:

```ts
await sendExpenseNotificationMessageHandler({
  ...existing,
  recurringTemplateId: input.recurringTemplateId ?? null,
});
```

### Edit-expense path

Find the edit handler that re-renders the notification (re-uses `formatExpenseMessage` with `isUpdate: true`). Load `expense.recurringTemplateId` from the DB row and pass it the same way. No caller-side branching — single source of truth is the row.

## Data model

No schema change. Every signal needed already exists:

| Field | Where | Used for |
|-------|-------|----------|
| `Expense.recurringTemplateId` | schema.prisma:117 | Truthy ⇒ render footer + 2nd button |
| `RecurringExpenseTemplate.id` | schema.prisma:330 | Target of `View Schedule` deep link |
| `RecurringExpenseTemplate.status` | schema.prisma:342 | Not consulted at render time — even `ENDED` templates get linked from past notifications, edit screen handles read-only state |

## Edge cases

- **Template deleted after notification was sent.** The button still renders; the edit-recurring TMA route handles the not-found case (existing behaviour — show a "this schedule no longer exists" empty state).
- **Notification edit after expense edit.** Same as today; `formatExpenseMessage` rebuilds the entire body, so the footer reflects current state.
- **Manual expense that user later attaches to a recurring template.** Out of scope — no such flow exists today. If added later, the next edit-notification render will include the footer naturally.
- **Recurring template's first occurrence** (created inline during `createExpenseWithRecurrence`). Same path — `recurringTemplateId` is set on the expense row before `createExpenseHandler` notifies, so the footer + button render on the very first notification too. This is the desired behaviour: it tells the group "this is a recurring expense" from the start.

## Telegram-surface verification

Manual smoke test post-deploy:

1. Create a recurring expense in a test chat → verify first notification has footer + 2 buttons.
2. Wait for lambda fire (or trigger via `aws lambda invoke` — see `feedback_recurring_uat_lambda_fire`) → verify second occurrence's notification has the same shape.
3. Tap `View Schedule` → verify TMA lands on the edit-recurring screen for the correct template.
4. Edit one of those expenses' amount in TMA → verify the updated notification preserves the footer + buttons.
5. Create a manual expense in the same chat → verify only one button, no footer.

### Deep-link regression check (mandatory)

6. Tap `View Expense` from a pre-existing (pre-deploy) notification → must land on the same expense detail screen as before.
7. Open a snapshot share URL in the wild → must resolve unchanged.
8. Open a counterparty deep link (from a cross-group nudge or balance sheet) → must resolve unchanged.

If any of steps 6–8 break, roll back before troubleshooting.

## Open questions

- **Button label.** "View Schedule" vs. "Manage Schedule" vs. "Edit Schedule". Current pick: "View Schedule" — neutral, matches the read-first verb of "View Expense". Owner: bubu.
- **Footer icon.** 🔁 — matches lucide's `Repeat` icon (horizontal loop) used in `RecurringExpenseBadge.tsx` and `RecurrencePickerSheet.tsx`. Resolved.

## Out of scope (followups)

- Cross-group recurring summary view in the personal-chat TMA. Tracked separately.
- Per-member opt-out of recurring notifications (currently `chat.notifyOnExpense` is chat-wide).
