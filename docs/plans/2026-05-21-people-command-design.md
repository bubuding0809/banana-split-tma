# People Command — Settle & Nudge (BananaSplitz Raycast Extension)

**Date:** 2026-05-21
**Status:** Approved design

## Goal

Bring the Raycast extension to parity with the Telegram mini app's cross-group
balance features: a **People** view where the user can see who they owe / who
owes them across every group, **settle** those balances, and **nudge** debtors.

## Background

The extension today is group-centric: `Groups → group detail → transactions`,
with create/edit/delete for expenses. It can *delete* settlements but cannot
*create* one, and has no nudge/remind capability.

The mini app surfaces settle + nudge two ways: a cross-group **People** tab
(`CounterpartyBalanceSheet` → Settle All / Nudge) and per-chat modals
(`ToPayModal` / `ToReceiveModal`). Nudge is inherently cross-group (24h cooldown
per sender→receiver pair, not per chat), so the People view is the natural home.

## Decisions

- **Scope:** a new top-level `people` command (not folded into Groups).
- **Settle:** "Settle All" as the primary action, plus per-group settle.
- **Cooldown:** static relative label ("Available in ~3h"), no live timer.

## Backend API (already in `packages/trpc`, verified)

| Procedure | Type | Input | Output |
|---|---|---|---|
| `expenseShare.getMyCounterpartyBalances` | query | `{ baseCurrency?: string }` | `{ baseCurrency, ratesAsOf, counterparties[] }` |
| `expenseShare.settleAllWithUser` | mutation | `{ counterpartyUserId: number }` | `{ settled, baseCurrency, totalBaseAbs }` |
| `expenseShare.nudgeCounterparty` | mutation | `{ counterpartyUserId: number }` | `{ ok: true, nudgeCooldownUntil: number }` |
| `settlement.settleAllDebts` | mutation | `{ chatId, senderId, receiverId, balances: {currency,amount}[], sendNotification? }` | `{ settlements[], totalSettlements }` |

`counterparties[]` shape:

```ts
{
  userId: number;
  firstName: string;
  lastName: string | null;
  hasStartedBot: boolean;
  nudgeCooldownUntil: number | null; // epoch ms, null when not rate-limited
  totalBaseNet: number;              // >0 = they owe you, <0 = you owe them
  groups: {
    chatId: number;
    chatTitle: string;
    currency: string;
    nativeNet: number;               // >0 = they owe you (this chat+currency)
    baseNet: number;                 // nativeNet converted to baseCurrency
  }[];
}
```

**Behaviour notes:**
- `settleAllWithUser` recomputes balances server-side and writes one settlement
  per (chat, currency); sender/receiver are derived from the sign of `nativeNet`.
- `nudgeCounterparty` throws `TOO_MANY_REQUESTS` if within the 24h window, and
  `BAD_REQUEST` if the counterparty doesn't owe the caller or hasn't started
  the bot.
- `settleAllDebts` is chat-scoped: `senderId` is the debtor, `receiverId` the
  creditor; `balances` carries one entry per currency in that chat.

**Deployment caveat:** the extension hits the production API by default. These
endpoints exist in the repo but must be confirmed live on prod (as with
`user.getMe` earlier). If not deployed, test against the local lambda.

## UI Design

### `people` command

A `List` loaded by a single `usePromise`:
1. `user.getMe()` → `baseCurrency` (falls back gracefully if it fails).
2. `expenseShare.getMyCounterpartyBalances({ baseCurrency })`.

**List layout** — two `List.Section`s, each sorted by `Math.abs(totalBaseNet)`
descending:
- **Owed to You** — `totalBaseNet > 0`.
- **You Owe** — `totalBaseNet < 0`.

Inline detail pane on by default (`⌘D` toggles), matching Groups/Transactions.

**Row:**
- `title`: counterparty name (`firstName [lastName]`).
- Accessory: net chip — `formatAmount(totalBaseNet) <baseCurrency>`, green when
  owed to you, red when you owe. No `+`/`-` sign; colour conveys direction.
- `EmptyView` when there are no balances ("You're all settled up").

**Detail pane** (`List.Item.Detail.Metadata`, group-detail-pane style):
- `Metadata.TagList "Net Balance"` — single colored chip.
- Per-group `Metadata.Label`s: `🍪 Trip — 40.00 SGD` (one per group+currency,
  colored text via... plain label; emoji-free, chat title + native amount).
- `Metadata.Separator`.
- `Metadata.Label "Nudge"`:
  - they owe you + `hasStartedBot` + no active cooldown → `Available`
  - active cooldown → `Available in ~3h`
  - `!hasStartedBot` → `Can't nudge — hasn't started the bot`
  - you owe them → omit the row (nudge is creditor-only)

**Row actions (`ActionPanel`):**
- **Settle All** (`⏎`) — `confirmAlert` (lists person + total) →
  `settleAllWithUser({ counterpartyUserId })` → success toast
  (`Settled N balances`) → `revalidate`.
- **Nudge** (`⌘N`) — rendered only when `totalBaseNet > 0`.
  - `!hasStartedBot` → failure toast, no call.
  - active cooldown (`nudgeCooldownUntil > Date.now()`) → failure toast
    `Already nudged · try again in ~3h`, no call.
  - else → `nudgeCounterparty` → success toast; on `TOO_MANY_REQUESTS` /
    `BAD_REQUEST` surface the server message → `revalidate`.
- **Settle by Group** (`⌘→` / `Action.Push`) — pushes `CounterpartyGroups`.
- **Show/Hide Details** (`⌘D`), **Refresh** (`⌘R`).

### `CounterpartyGroups` pushed view

A `List` of the selected person's per-chat balances. The person's `groups[]` is
bucketed by `chatId` (a chat may carry multiple currencies).

**Row** (one per chat):
- `title`: `chatTitle`.
- Accessories: one net chip per currency in that chat (green/red by sign).

**Row actions:**
- **Settle This Group** (`⏎`) — `confirmAlert` →
  `settleAllDebts({ chatId, senderId, receiverId, balances })` where:
  - `balances` = `[{ currency, amount: Math.abs(nativeNet) }]` per currency.
  - For a chat with mixed-sign currencies (rare), split into two calls — one
    per sender/receiver direction. `senderId` = debtor, `receiverId` =
    creditor, derived from `nativeNet` sign.
  - → success toast → `revalidate` (and the parent People list on pop).
- **Refresh** (`⌘R`).

## Files

**New:**
- `apps/bananasplitz/src/people.tsx` — `People` command, `PersonRow`,
  `PersonDetailPane`, `CounterpartyGroups`.
- `apps/bananasplitz/src/lib/balances.ts` — `Counterparty`, `CounterpartyGroup`
  types and a `bucketGroupsByChat()` helper.

**Modified:**
- `apps/bananasplitz/src/lib/format.ts` — add `formatRelativeShort(ms)` →
  `"~3h"` / `"~45m"` / `"~2d"`.
- `apps/bananasplitz/package.json` — register the `people` command in
  `commands[]` (title "People", description, mode "view").

## Error Handling

- `getMyCounterpartyBalances` failure → `List` error state / toast; `getMe`
  failure → degrade to default base currency (the backend also defaults it).
- All mutations wrap in animated→success/failure toasts; server `TRPCError`
  messages are surfaced verbatim (cooldown / no-debt / not-started-bot).
- Settle actions are guarded by `confirmAlert` since they write data and send
  Telegram notifications.

## Testing

Manual, against the local lambda + prod-snapshot DB:
- People list splits into the two sections, sorted by magnitude.
- Detail pane renders per-group lines and the correct Nudge status.
- Settle All zeroes the person out and they drop off the list.
- Settle This Group settles only that chat; other chats remain.
- Nudge succeeds once, then shows the cooldown label + blocks the repeat.
- Nudge hidden for people you owe; blocked for `!hasStartedBot`.
- Empty state shows when fully settled.
