# Move debt to another group — TMA UI

**Date:** 2026-06-29
**Status:** Approved (brainstorm), pre-plan

## Problem

The cross-group debt transfer feature exists end-to-end in the backend and CLI
(`banana create-transfer` / `list-transfers` / `delete-transfer`), but the
Telegram Mini App only exposes two of the three operations:

| Operation | CLI | TMA |
|-----------|-----|-----|
| List transfers | `list-transfers` | ✅ shown in transaction feed (`ChatTransferCell`) |
| Transfer details | — | ✅ `TransferDetailsModal` |
| Delete / reverse | `delete-transfer` | ✅ `TransferDetailsModal` secondary button |
| **Create** | `create-transfer` | ❌ **missing** |

A user can see and undo transfers in the app, but can only *create* one from the
command line. This spec covers the missing create flow.

## What create-transfer does (recap)

`debtTransfer.createTransfer` moves an outstanding debt for a single
debtor→creditor pair from a **source** chat to a **target** chat, without logging
any consumption spending in either group. Backend invariants
(`packages/trpc/src/routers/debtTransfer/index.ts`):

- Source ≠ target; debtor ≠ creditor.
- Creator, debtor, and creditor must all be members of **both** chats.
- Debtor must already owe creditor at least the moved amount in the source chat
  (solvency check, simplification-aware, advisory-locked against TOCTOU).
- On success, both groups get a Telegram notification (out of source, in to
  target) — best effort, already implemented.

## Design

### Principle

No new route, no free-text form, no amount entry. The move is a **modal of
tappable cells** launched from a debt the user is already looking at. Every
parameter is fixed by the row the user tapped; the only choice is *which group
to move it to*.

### Entry point

`UserBalancesTab` → tap a counterparty → `CounterpartyBalanceSheet` already shows
that counterparty's balance broken down per chat+currency (the `byChat`
section). Today those breakdown rows are display-only.

**Change:** make each per-chat+currency breakdown row tappable. Tapping opens the
new `MoveDebtSheet`, pre-loaded from that row:

- `sourceChatId`, `sourceChatTitle` ← row's chat
- `currency` ← row's currency
- `amount` ← `Math.abs(row.nativeNet)` (full owed amount, full-only)
- direction → debtor/creditor:
  - `nativeNet < 0` (caller owes counterparty): `debtor = caller`, `creditor = counterparty`
  - `nativeNet > 0` (counterparty owes caller): `debtor = counterparty`, `creditor = caller`

A zero-net row is not transferable and stays non-interactive.

### `MoveDebtSheet` (new component)

A `Modal` (telegram-ui), matching the visual language of `TransferDetailsModal`.
Contents top-to-bottom:

1. **Recap section** (read-only) — `Section header="Moving"`, reusing the
   `TransferDetailsModal` movement/who-owes-whom cell layout: avatar, debtor →
   creditor, amount, "from {sourceChatTitle}". No inputs.
2. **Target list** — `Section header="Move to"` of tappable `Cell`s, one per
   eligible group: `ChatMemberAvatar`/group avatar + group title. Loading →
   `Skeleton` rows. Empty → centered `Caption` "No shared groups with {name} to
   move this to."
3. **Confirm** — tapping a target group calls `popup.open.ifAvailable`:
   > **Move this debt?**
   > Moves {amount} {currency} from "{source}" to "{target}". Removes it here,
   > adds it there.
   > [Move] [Cancel]

   On confirm → `createTransfer.mutate`. No mainButton submit step.

### Mutation wiring

`trpc.debtTransfer.createTransfer.useMutation`, payload:

```
{
  sourceChatId, targetChatId,
  debtorId, creditorId,
  amount,            // row nativeNet, abs
  currency,          // row currency
  description: undefined,   // no note field
}
```

`onSuccess`: haptic success, close sheet, and invalidate the same caches
`TransferDetailsModal` delete already invalidates:
`debtTransfer.getAllByChat`, `currency.getCurrenciesWithBalance`,
`chat.getBulkChatDebts`, `expenseShare.getMyBalancesAcrossChats`,
plus `expenseShare.getMyCounterpartyBalances` (the sheet's own source) so the
breakdown refreshes. `onError`: haptic error + `Snackbar` with `error.message`
(surfaces backend solvency/membership rejections).

### New backend query

`expenseShare.getEligibleTransferTargets` (protected, user-scoped):

- **Input:** `{ counterpartyUserId: number, sourceChatId: number }`
- **Logic:** `db.chat.findMany` where members include both caller and
  counterparty, `id != sourceChatId`. Reuses the `members: { some: { id } }`
  membership pattern from `getMyBalancesAcrossChats`.
- **Output:** `[{ chatId, chatTitle }]`.
- Currency is *not* a filter — eligibility is membership-only; the solvency
  check stays server-side in `createTransfer`. Pre-filtering to shared groups
  removes the most common failed-submit case (non-shared group) but the backend
  remains the source of truth.

## Components used

- `Modal`, `Section`, `Cell`, `Skeleton`, `Caption`, `Text`, `Snackbar`,
  `Info` — `@telegram-apps/telegram-ui` (mirrors existing Chat feature modals).
- `popup`, `hapticFeedback` — `@telegram-apps/sdk-react`.
- `ChatMemberAvatar`, `formatCurrencyWithCode`, `getBalanceColorClass`,
  `ArrowRight` (lucide) — existing project helpers, same as
  `TransferDetailsModal` / `CounterpartyBalanceSheet`.

No raw `<div style>`, no native `<select>`, no `window.confirm`/`alert` —
consistent with the in-group visual rhythm.

## Out of scope (YAGNI)

- Partial-amount moves (full-only by decision).
- Free-text note/description (no input fields by decision).
- Standalone "new transfer" form / power-user blank entry.
- Editing an existing transfer (delete + recreate covers it).
- Multi-currency move in one action (each currency row moves independently).

## Files

- **New:** `apps/web/src/components/features/Chat/MoveDebtSheet.tsx`
- **Edit:** `CounterpartyBalanceSheet.tsx` (tappable breakdown rows + sheet host)
- **New:** `packages/trpc/src/routers/expenseShare/getEligibleTransferTargets.ts`
  (+ register in `expenseShare/index.ts`, + spec)
- **Tests:** new query handler spec; `MoveDebtSheet` interaction test following
  existing Chat component test patterns.
