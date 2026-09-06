# Per-leg currency for debt transfers

**Date:** 2026-09-07
**Status:** Approved, ready for implementation plan
**Related:** PR #338 (transfer-currency enumeration fix), #323 (native cross-group transfers)

## Problem

A `DebtTransfer` carries one `amount` and one `currency`, shared by the source chat and the target chat. The row is a debit in one group and a credit in the other, so any change to its currency changes both groups at once.

That makes currency conversion unworkable. Convert AUD to SGD in a group that received an AUD debt, and the group the debt came from silently switches to SGD too — a currency its members never chose, on a balance they never touched.

The current code avoids the problem by not converting transfers at all. `convertCurrencyBulk` updates expenses and settlements only. Two things follow:

- Converting a currency that exists in a group only via a transfer changes nothing, while the UI fires a success haptic. The balance sits there afterwards, apparently ignoring the conversion.
- Converting a currency that has both expenses and transfers converts part of the ledger and leaves the rest, so the group looks half-converted with no explanation.

## Goal

Each group holds its own denomination for a transfer. Converting a group's currency rewrites that group's side and nothing else.

## Non-goals

- Rate history, reconciliation reports, or undoing a conversion. Conversion stays destructive, matching how expenses and settlements already behave.
- Choosing a destination currency when moving a debt. Both sides start in the original currency.
- Snapshot share rendering. Deferred.
- N-way transfers.

## Data model

`DebtTransfer` gains four columns and loses two:

| Column | Type | Note |
|---|---|---|
| `sourceAmount` | `Decimal(12,2)` | what leaves the source chat |
| `sourceCurrency` | `String` | |
| `targetAmount` | `Decimal(12,2)` | what arrives in the target chat |
| `targetCurrency` | `String` | |
| ~~`amount`~~ | | dropped |
| ~~`currency`~~ | | dropped |

Both legs are equal at creation. They diverge only when a group converts.

Dropping the old columns rather than keeping them as mirrors is deliberate: any reader that still expects a single amount fails to compile instead of silently picking a leg.

### Migration

One migration, one PR. Downtime during deploy is acceptable and was confirmed with the user.

1. Add the four columns nullable.
2. Backfill: copy `amount` into both `sourceAmount` and `targetAmount`, `currency` into both currency columns.
3. Set the four columns `NOT NULL`.
4. Drop `amount` and `currency`.

The backfill is exact. No historical rate lookups, because both legs of every existing row are by definition the same figure the row already holds.

`deploy.yml` runs `migrate` before the app deploys, so old code briefly serves against the new schema and errors until the deploy lands. That is the accepted downtime. Rolling back after the migration requires a down migration, not just a revert — call that out in the PR description.

## Balance engine

Every balance entry point already takes a `chatId` and uses it to decide whether a transfer is settlement-like (the source chat, debt removed) or expense-like (the target chat, debt added). The same branch now also selects the leg.

One helper carries it:

```ts
legFor(transfer, chatId) // → { amount, currency }
// source leg when chatId === sourceChatId, target leg otherwise
```

`TransferRow` grows to hold both legs. Three kinds of call site change:

**Currency discovery.** A chat's currencies come from `sourceCurrency` where it is the source and `targetCurrency` where it is the target — not from one column matched in either direction. Four sites: `getDebtorsMultiCurrency`, `getCreditorsMultiCurrency`, `getSimplifiedDebtsMultiCurrency`, `getCurrenciesWithBalance`.

**Per-currency bucketing.** `getMemberBalanceSummary`, `getBulkChatDebts` and `getMyBalancesAcrossChats` bucket transfers by the leg's currency for the chat they are computing, rather than by a single row-level currency.

**Pair queries.** `getNetShare` and the solvency helper in `createTransfer` filter with `OR: [{ sourceChatId, sourceCurrency }, { targetChatId, targetCurrency }]`.

The last one closes a latent ambiguity. Today's predicate matches one currency against a transfer touching the chat either way; once legs can differ, that question has no single answer. Leg-scoped predicates make it well-formed.

`deleteTransfer` is unchanged — deleting the row removes both legs.

## Conversion

`convertCurrencyBulk` gains transfers as a third row type, scoped to the converting chat's own leg:

```
source legs: sourceChatId = chatId AND sourceCurrency = from → sourceAmount × rate, sourceCurrency = to
target legs: targetChatId = chatId AND targetCurrency = from → targetAmount × rate, targetCurrency = to
```

Same rate and same transaction as the expense and settlement updates. The counterpart group's leg never appears in the predicate.

The result count gains `convertedTransfers`, and the Telegram conversion notice reports it. Only the converting group is notified; the other group's ledger did not move.

`ConvertCurrenciesCell` changes with it: the confirm copy names transfers, and the `confirm()` / `alert()` calls move to `popup.open` and `Snackbar` to match the rest of the TMA. The success signal stops firing over a no-op, because every currency the picker offers now has rows the conversion will touch.

## Surfaces

Creation is unchanged for the user. `createTransfer` takes one amount and currency and writes both legs equal; `MoveDebtSheet` needs no new control.

Reads are leg-scoped, and chat-scoped surfaces get that for free:

- `getAllByChat` returns the requesting chat's leg as `amount` / `currency`, so `ChatTransferCell` and `TransferDetailsModal` keep their field names and render the right side.
- `getMyBalancesAcrossChats` and `getMyCounterpartyBalances` already iterate per chat and resolve the leg per iteration.
- `createTransfer` output exposes both legs. The Telegram transfer notice renders identically to today, since legs are equal at creation.
- CLI `list-transfers` shows the leg for the chat being listed. This is a CLI source change, so it needs a version bump, a SKILL.md update and a CHANGELOG entry in the same commit or the parity check blocks the merge.

Each group sees only its own leg. No counterpart amount and no conversion note crosses the boundary.

## Testing

Unit, against the existing mocked-Prisma pattern in `packages/trpc/src/routers/**/*.spec.ts`:

- `legFor` picks the correct leg for source, target, and a chat that is neither.
- The balance engine computes correct per-chat balances when legs have diverged.
- Currency discovery reports the leg currency, not the counterpart's.
- Conversion updates only the converting chat's leg and leaves the counterpart's row untouched.
- Existing transfer specs keep passing against the new shape.

Migration: the CI `Prisma schema ↔ migrations sync` check covers drift. Backfill correctness is verified against a seeded row before the drop step.

UAT, post-deploy, against real groups:

1. Move a debt between two groups, confirm both sides read the original currency.
2. Convert the source group. Source leg changes, target group unchanged.
3. Convert the target group to a third currency. Source leg unchanged.
4. Delete a diverged transfer; both groups return to their pre-transfer balances.
5. Settle a diverged balance from each side.

## Risks

- **Downtime window.** Accepted. Migration runs before the deploy; old code errors against the new schema until the deploy completes.
- **Rollback needs a down migration.** A plain revert of the merge will not restore the dropped columns.
- **Divergence is permanent and invisible across groups.** Two groups can legitimately disagree on the nominal figure. That follows from the design, not from a defect, but support questions will arrive eventually — the transfer detail modal is where an explanation would go if it becomes a problem.
