# Record payment (ad-hoc settlements)

**Date:** 2026-09-26
**Status:** Approved design, awaiting spec review
**Related:** `settlement.createSettlement`, `ToPayModal` / `ToReceiveModal`, `MoveDebtEntry`, `deepLinkProtocol.ts`

## Problem

Users can only settle the exact debt the app has computed. `ToPayModal` and `ToReceiveModal` call `createSettlement` with `amount: absAmountOwed`, and the one-tap "Settled ✅" button records the full amount. There is no way to:

- pay part of a debt ("I owe Alice $50, here's $20 for now"), or
- record a payment when no debt exists (an advance, or paying someone back for something not tracked in the app).

The backend already allows both. `createSettlement` accepts any positive amount, any sender and receiver in the chat, any currency, and an optional description. It does not compare the amount to the computed debt. The gap is entirely in the UI.

## Goal

A member can record a payment of any amount between themselves and one other member, in either direction, from the group page or from the pay/receive popups.

## Non-goals

- Recording a payment between two other members. One side is always the current user.
- Editing a settlement after it is created. Delete and re-record, as today.
- CLI support (`--kind payment`). Deferred; it needs its own version bump, SKILL.md and CHANGELOG entry.
- Cross-group aggregate screens (`CounterpartyBalanceSheet` on the chat list).
- Schema changes. `Settlement` stays sender, receiver, amount, currency, description, date.

## Decisions

| Question | Decision |
|---|---|
| Which cases? | Both partial payment of a debt and payment with no debt behind it. |
| Who can record? | The payer or the receiver. Never a third member. |
| Form shape | Two steps, matching Add expense: Amount, then Who. |
| Step 2 pattern | `I paid / I received` toggle plus one member list with balances. |
| Summary line on step 2 | None. |
| Group page entry | Split the Add expense button: `[+ Add expense] [💸 Payment]`. |
| Popup entry | "Pay / Received a different amount" cell in a new "Other options" section below the QR. |
| Notification | New neutral message for recorded payments, with a "View payment" button. |
| Overpay / no-debt warning | None. The balance flips, which is the point. |
| Draft persistence | Yes, like Add expense. |

## UI

### New route: `/chat/$chatId/record-payment`

A two-step form built the same way as `AddExpensePage`: TanStack Form, `currentFormStep` in the search params, the progress bar with step labels ("Amount", "Who"), and the native Back and Main buttons.

Search params:

| Param | Type | Purpose |
|---|---|---|
| `prevTab` | `"balance" \| "transaction"` | where to return on close or submit |
| `currentFormStep` | `number` | 0 = Amount, 1 = Who |
| `direction` | `"paid" \| "received"` | prefill (optional) |
| `counterpartyId` | `number` | prefill (optional) |
| `amount` | `number` | prefill (optional) |
| `currency` | `string` | prefill (optional) |

**Step 1: Amount.** Reuses the AmountFormStep pieces: currency cell (opens `CurrencySelectionModal`, featuring the chat's base currency), amount input, then a Details section with description (placeholder "e.g. Concert tickets") and Transaction Date (max today). It leaves out Repeat, End date, category and the "Apply SGD" conversion cell. The Main button reads **Next** and is enabled when the amount is > 0.

**Step 2: Who.** A segmented control `I paid | I received`, then a large section header that follows the toggle ("Paid to?" or "Received from?"), then a radio list of every chat member except the current user. Each row shows `ChatMemberAvatar`, the name, and the member's balance with the current user *in the currency picked on step 1*:

- red "you owe {amount}" when the user owes them,
- green "owes you {amount}" when they owe the user,
- grey "settled up" otherwise.

No summary line under the list. The Main button reads **Record payment** and is enabled once a member is selected.

**Submit.**

- `I paid` means sender = current user, receiver = selected member.
- `I received` means sender = selected member, receiver = current user.

It calls `settlement.createSettlement` with `notificationKind: "payment"`, `sendNotification: true`, and the existing name fields and `threadId`. On success: success haptic, clear the draft, invalidate `getDebtorsMultiCurrency`, `getCreditorsMultiCurrency`, `getSimplifiedDebtsMultiCurrency` and the transactions query, then navigate back to `/chat/$chatId` on `prevTab`. On error: error haptic and a `popup.open` message; the form keeps its values.

**Draft.** Stored in sessionStorage under `record-payment:{chatId}`, following the `add-expense:{chatId}` pattern. A prefilled entry from a popup replaces any existing draft.

### Group page entry

`GroupPage` replaces the single `AddExpenseButton` with a two-button row: primary `+ Add expense` (unchanged link) and secondary `💸 Payment` linking to `record-payment` with `prevTab` and `title: "💸 Record payment"`. `UserPage` (personal chat) keeps the single button, since there is nobody to pay.

### Pay/receive popups

`ToPayModal` and `ToReceiveModal` get an "Other options" `Section` below the PayNow QR (or directly below the header when there is no QR). It holds two cells:

1. **Pay a different amount** (ToPay) or **Received a different amount** (ToReceive), which opens `record-payment` prefilled with `direction`, `counterpartyId`, `amount` = the full debt, `currency`, and `currentFormStep: 0` so the user lands on the amount.
2. **Move to another group**, the existing `MoveDebtEntry`, moved into this section.

The section gets bottom padding (about 24px plus the safe-area inset) so the native Copy Phone / Settled bar does not cover it. Today "Move to another group" sits hard against that bar and is easy to miss.

The one-tap "Settled ✅" main button and the Copy Phone / Remind secondary button are unchanged.

## Backend

### `createSettlement`

New optional input:

```ts
notificationKind: z.enum(["settle_up", "payment"]).default("settle_up"),
```

The default keeps every existing caller (the one-tap Settled buttons, `settleAllDebts`, CLI, API keys) on today's behaviour.

When `sendNotification` is true:

- `settle_up` sends the existing "Great news" message, now with a View payment button.
- `payment` sends the new neutral message. The tagged user is whichever of sender and receiver is **not** the caller (`ctx` user). If there is no user context (API-key calls), it tags the receiver.

Both still respect `chat.notifyOnSettlement` and `threadId`, and store the sent message id in `settlement.telegramMessageId` so `deleteSettlement` keeps cleaning up.

### Messages

Existing, unchanged text plus a button:

```
✅ Great news @Bob!
Alice has settled their debt of SGD 50.00!
[ View payment ]
```

New, for `payment`:

```
💸 Alice paid @Bob SGD 20.00 (Concert tickets)
[ View payment ]
```

The description part is omitted when empty. Names are MarkdownV2-escaped the same way the existing handler does it. When the receiver records it, the payer is tagged instead: `💸 @Alice paid Bob SGD 20.00`.

The button is an inline URL button to the TMA with a v1 start param carrying entity `st` and the settlement id.

### Deep link: entity `st`

- `packages/trpc/src/utils/deepLinkProtocol.ts`: add `"st"` to the entity union.
- `apps/web/src/hooks/useStartParams.ts`: add `"st"` to the zod enum.
- `apps/web/src/routes/_tma/chat.$chatId.tsx`: on `entity_type === "st"`, use the same consume-once sessionStorage guard and navigate to `/chat/$chatId` with `selectedTab: "transaction"` and `selectedSettlement: <id>`. Add `selectedSettlement` to the route's search schema.
- `ChatTransactionTab`: scroll to `selectedSettlement` on first load, the same way it handles `selectedExpense` (`scrollToTransaction` takes any transaction id).
- `ChatSettlementCell`: auto-open `SettlementDetailsModal` when its id equals `selectedSettlement`, and clear the param on close, mirroring `ChatExpenseCell`.

`s` stays snapshot. `st` was chosen so no existing link changes meaning.

## Testing

### Unit (TDD)

- **Deep link.** First, lock round-trip tests for the existing `s`, `e`, `rt`, `c` and `p` links (skip any that already exist). Then add `st` test-first: encode, decode, same UUID back. `useStartParams` accepts `st`.
- **`createSettlementHandler`.**
  - Default `notificationKind` sends the existing text.
  - `payment` sends the neutral text and tags the non-recorder, falling back to the receiver without a user context.
  - Both messages carry a View payment button whose payload decodes to `st` + the settlement id.
  - `telegramMessageId` is stored.
  - Nothing is sent when `notifyOnSettlement` is false.
- **Web.**
  - Step 2 maps the toggle to sender and receiver correctly.
  - The popup prefill fills amount, currency, member and direction.
  - `GroupPage` renders both buttons, and `UserPage` renders one.

### Automated staging UAT

Run against the real dev server over HTTP (not an in-process caller), with the dev stack confirmed running first:

- Record a payment in both directions, a partial payment and a no-debt payment.
- Assert the settlement rows, the balance changes, the Bot API message text, and the button payload.
- Delete one and assert the group message is removed.
- Confirm existing `e`, `s` and `rt` links still resolve.

### Manual UAT

One step at a time through AskUserQuestion, in Telegram:

- the split button,
- both form steps and the prefilled entry,
- the "Other options" section clearing the native bar,
- how both messages render,
- tapping View payment to open the settlement's details popup.

## Risks

- **Mis-recorded payments.** Either side can now change a balance by any amount. Mitigation: the message tags the other party, and settlements can be deleted.
- **Two-button row width.** "Add expense" loses half its width on small phones. The label stays short; check it in manual UAT on the narrowest device available.
- **Balance subtitles in a currency with no activity** show "settled up". That is accurate, but it may look odd for a member who has a debt in another currency. Acceptable for v1.
