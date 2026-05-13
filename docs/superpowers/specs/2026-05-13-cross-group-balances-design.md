# Cross-Group Balances (Person-first)

**Date:** 2026-05-13
**Status:** Design — pending plan
**Owner:** bubu (@bubuding0809)

## Problem

Today expenses are siloed per group. A user with 5 active groups must open each one to manage debts. As a "super user" the author manages cross-group balances via the CLI + an Anthropic agent (`me list-my-balances`), but ordinary users have no such tool. The `Groups` tab inside the personal-chat TMA is a stub (`UserBalancesTab.tsx` — "Coming soon").

This spec defines a v1 cross-group balance view that answers one question fast: **"How much does each person owe me (or do I owe them), netted across every group we share?"** And lets the user act on it (settle, nudge) without group-hopping.

## Goals

- **One number per counterparty**, in the user's chosen base currency, summed across every group + currency they share.
- **Drill-down** to see the constituent native-currency balances per (group, currency).
- **One-tap full settle** that writes back per-chat settlement rows in native currency, zeroing every bucket with that person.
- **Nudge** to DM the debtor a private reminder via the bot.
- **Bot DM notification** to the counterparty when a cross-group settle completes.
- **CLI parity** for both new operations.

## Non-goals (v1)

- Partial settle from the cross-group view (per-bucket toggle / arbitrary amount). Per-group screens already support partial; this view is "all or nothing".
- A `CrossGroupSettlement` parent record / "cross-group settlement history" view. Each settle writes plain per-chat `Settlement` rows; the cross-group grouping isn't persisted.
- Rate snapshots / freezing FX at expense or settlement time. Conversion is **live, computed at view time**.
- "Mark as paid externally" with a free-text note.
- Auto-suggestions ("you and Sean haven't settled in 90 days").
- Multi-counterparty bulk settle ("settle with everyone at once").

## Mental model

Top-level list = **people** the user shares at least one non-zero balance with. Each row shows one signed amount in the user's base currency. Tap the row → bottom sheet with the per-(group, currency) breakdown and the action buttons.

Tab lives in the personal-chat TMA at `chat.index.tsx` (`selectedTab === "groups"`). Tab label decision deferred (see Open Questions).

## UX

### List view

```
┌ Balances ──────────────────────────────────┐
│ Base: [SGD ▾]                              │
│ ┌────────────────────────────────────────┐ │
│ │ Net across all groups                  │ │
│ │   + S$182.50 owed to you               │ │
│ │   − S$ 45.00 you owe                   │ │
│ └────────────────────────────────────────┘ │
│ PEOPLE                                     │
│ ┌ Sean       3 groups       +S$99.42  ▸  ┐ │
│ ┌ Alice      2 groups       +S$83.08  ▸  ┐ │
│ ┌ Charlie    Bali Trip      −S$45.00  ▸  ┐ │
└────────────────────────────────────────────┘
```

- Base currency dropdown at the top is a session override of the persisted `User.baseCurrency`. Changing it re-fetches.
- People are sorted by `|baseNet|` descending.
- Each row shows the count or single name of groups contributing.
- Empty state: "No outstanding balances across any group."

### Counterparty sheet (tap on row)

```
┌ Sean owes you ≈ S$99.42 ───────────────────┐
│ Bali Trip          $40.00 USD ≈ S$54.20    │
│ Dinner Club        A$30.00    ≈ S$26.30    │
│ Roommates          ¥100.00    ≈ S$18.92    │
│ ─────────────────────────────────────────  │
│ Rate as of 2026-05-13 14:22                │
│                                            │
│ [Nudge Sean]          [Mark all settled]   │
└────────────────────────────────────────────┘
```

- Each line: chat title, native amount with sign relative to user, live SGD equivalent.
- Direction sign on each line reflects who actually owes whom in that bucket (so net-positive counterparties can still have rows in the opposite direction).
- "Mark all settled" opens a confirm dialog showing the same breakdown with the SGD total recomputed at confirm time (rate may have shifted vs. when the sheet opened).
- "Nudge Sean" disabled if Sean has not started a personal chat with the bot (tooltip: "Sean hasn't opened the bot yet"). Disabled and replaced with "Nudged · try again in <X>h" when within the 24h cooldown.

## Data model

Single Prisma change:

```prisma
model User {
  // …existing fields
  baseCurrency String @default("SGD") // ISO 4217, validated against CURRENCY_DATABASE
}
```

Default value seeded for existing users via migration. No new tables. `Settlement` records keep their per-chat scope and native currency.

## FX

Reuse the existing infrastructure in `packages/trpc/src/utils/currencyApi.ts`:

- `fetchExchangeRates(base)` → live rates from `fxratesapi.com`, cached by the existing `currency.getMultipleRates` router with `CURRENCY_CACHE_TTL` TTL.
- `getExchangeRate(rates, from, to)` for cross-currency conversion via USD pivot.
- `CURRENCY_DATABASE` for symbols, decimal places, and validation.

The new balances procedure fetches rates **once per call** for all distinct currencies it encounters, then converts every bucket in memory.

## tRPC procedures

### `expenseShare.getMyCounterpartyBalances`

**Input:** `{ baseCurrency?: string }` (defaults to caller's `User.baseCurrency`)

**Logic:**

1. Call existing `getMyBalancesAcrossChats` for the caller. This already honors each chat's `debtSimplificationEnabled`.
2. Group the resulting per-chat counterparty rows by `userId`.
3. Collect the set of distinct (currency) values; fetch rates once via `currencyApi`.
4. For each counterparty, build:
   - `groups: [{ chatId, chatTitle, currency, nativeNet, baseNet }]`
   - `totalBaseNet`: sum of `baseNet` (positive = owed to caller; negative = caller owes)
5. Filter counterparties whose `totalBaseNet` rounds to zero in the base currency.
6. Sort by `|totalBaseNet|` desc.

**Output:**

```ts
{
  baseCurrency: string;
  ratesAsOf: Date; // newest cache timestamp used
  counterparties: Array<{
    userId: string;
    firstName: string;
    lastName: string | null;
    photoUrl: string | null;
    hasStartedBot: boolean;       // derived: exists a private Chat row keyed to this userId
    totalBaseNet: number;         // signed
    groups: Array<{
      chatId: string;
      chatTitle: string;
      currency: string;
      nativeNet: number;          // signed
      baseNet: number;            // signed
    }>;
  }>;
}
```

### `expenseShare.settleAllWithUser`

**Input:** `{ counterpartyUserId: string }`

**Logic (single Prisma transaction):**

1. Recompute live balances with this user (same logic as `getMyCounterpartyBalances` scoped to one counterparty) — do **not** trust client-side amounts.
2. For each non-zero (chatId, currency) bucket, insert one `Settlement` row:
   - `senderId` = whoever is the debtor in that bucket (could be caller or counterparty, depending on direction)
   - `receiverId` = the other
   - `amount` = `|nativeNet|`
   - `currency` = native bucket currency
   - `chatId` = the chat
3. Best-effort: enqueue a Telegram DM job to `counterpartyUserId` via the bot:

   > *"Bubu just settled with you across 3 groups. Approx S\$99.42 (SGD). Bali: \$40.00 USD · Dinner: A\$30.00 · Roommates: ¥100.00. Open Balances in personal chat to verify."*

   If the counterparty has not started a personal chat with the bot (`hasStartedBot === false`), skip the DM silently.

4. Return the same shape as `getMyCounterpartyBalances`, but scoped to this counterparty post-settle (should be empty / zero).

### `expenseShare.nudgeCounterparty`

**Input:** `{ counterpartyUserId: string }`

**Logic:**

1. Guard: if the (callerId, counterpartyUserId) pair has been nudged within the last 24h (Redis key `nudge:<a>:<b>`, TTL 86400), return error `NUDGE_RATE_LIMITED` with `retryAt`.
2. Recompute live balance with this user. If the caller is not net-owed (i.e. `totalBaseNet <= 0`), return error `NOTHING_TO_NUDGE`.
3. Best-effort DM the counterparty via the bot:

   > *"Bubu is awaiting settlement. You owe ≈ S\$99.42 across 3 groups. Bali: \$40.00 USD · Dinner: A\$30.00 · Roommates: ¥100.00. Open the Balances tab to view."*

4. If the counterparty has not started the bot, return error `COUNTERPARTY_BOT_NOT_STARTED` (UI displays the button as disabled rather than letting the user invoke).
5. Set the Redis key with 24h TTL.

## CLI parity

Update `apps/cli/src/commands/me.ts`:

- `me list-counterparty-balances [--base <ISO>]` — wraps `getMyCounterpartyBalances`. Default `--base` = caller's `User.baseCurrency`. Output: table of `Counterparty | Groups | Native breakdown | Base total`.
- `me settle-all-with --user <id>` — wraps `settleAllWithUser`. Confirms via interactive prompt unless `--yes`. Prints the settlement rows written.

Per the CLI change discipline: version bump in `apps/cli/package.json`, SKILL.md update describing both commands, CHANGELOG entry — all in the same commit.

Nudge is intentionally **not** exposed via CLI (it's a UI affordance, not a super-user operation).

## Components touched

### Web (TMA)

- `apps/web/src/components/features/Chat/UserBalancesTab.tsx` — replace placeholder with the list view; uses `getMyCounterpartyBalances`.
- `apps/web/src/components/features/Chat/CounterpartyBalanceSheet.tsx` — new bottom sheet with breakdown + actions.
- `apps/web/src/components/features/Chat/BaseCurrencyPicker.tsx` — new inline picker; persists via existing user-settings mutation.
- `apps/web/src/components/features/Settings/BaseCurrencyField.tsx` — new field in user settings.

### Backend

- `packages/trpc/src/routers/expenseShare/getMyCounterpartyBalances.ts` — new.
- `packages/trpc/src/routers/expenseShare/settleAllWithUser.ts` — new.
- `packages/trpc/src/routers/expenseShare/nudgeCounterparty.ts` — new.
- `packages/trpc/src/routers/user/updateBaseCurrency.ts` — new (or extend an existing user-update mutation).
- Bot DM templates for settle-notification and nudge — colocate with existing bot message templates.

### Database

- `packages/database/prisma/schema.prisma` — `User.baseCurrency` with migration + default backfill.

### CLI

- `apps/cli/src/commands/me.ts` — two new commands + skill / changelog updates.

## Edge cases

- **Counterparty I share groups with but no open balance.** Filtered out of the list. The list is "people with money in motion", not "every contact".
- **Caller's base currency = transaction currency.** No conversion; `baseNet === nativeNet`; `getMultipleRates` still called once but identity-converts.
- **Currency not in `CURRENCY_DATABASE`.** Shouldn't happen (expense create validates) but if it does, omit that bucket from the conversion total and surface a single inline warning in the sheet. Don't fail the whole view.
- **FX API failure / cache miss.** Return cached stale rates if available; if no cache at all, return native amounts only with `baseCurrency: null` and an inline error banner. The list view falls back to grouping by counterparty without sums (compact pills per currency).
- **`debtSimplificationEnabled` per chat.** Already handled inside `getMyBalancesAcrossChats`; no extra logic here.
- **User has zero counterparties.** Empty state with copy: "No outstanding balances across any group."
- **Mixed direction within one counterparty.** Sean owes me in Bali, I owe Sean in Dinner — bottom-sheet rows render with correct direction; settle writes rows in correct direction per bucket; aggregate is the net.
- **Settle race.** Between sheet open and confirm, a new expense lands. We re-fetch and re-display the breakdown inside the confirm dialog; the transaction in `settleAllWithUser` always recomputes from DB, so the write is always accurate.
- **Bot DM delivery.** Best-effort. If Telegram returns 403 (user blocked bot or never started a private chat) we log + swallow; the settle still succeeds on the DB side. Nudge surfaces the 403 as `COUNTERPARTY_BOT_NOT_STARTED` so the UI can disable the button proactively.
- **Detecting `hasStartedBot`.** Look up a private `Chat` row whose id equals the counterparty's `userId`. The TMA only opens via a private bot chat, so this is a reliable proxy. No new field on User required.

## Open questions

- **Tab label.** Keep "Groups" or rename to "Balances"? Deferred — decide during implementation review.

## Out of scope (recap)

Partial settle from cross-group · CrossGroupSettlement parent · rate snapshots · external-payment notes · bulk settle across counterparties · auto-stale-balance suggestions.

## Acceptance criteria

- A user with 3+ groups (mixed currencies) opens the personal-chat Groups tab and sees one row per counterparty with a signed base-currency total, sorted by magnitude.
- Tapping a row reveals per-(group, currency) breakdown with native + converted amounts and a rate timestamp.
- "Mark all settled" writes one `Settlement` row per non-zero bucket, in native currency, each in the correct direction; the counterparty disappears from the list after refresh.
- Counterparty receives one Telegram bot DM summarizing the settlement.
- "Nudge" sends a Telegram bot DM to the debtor; second nudge within 24h returns rate-limit error and disables the button with countdown.
- Base currency setting persists across sessions; in-view picker is a session override.
- CLI: `me list-counterparty-balances` and `me settle-all-with` produce parallel output and write the same records as the UI.
