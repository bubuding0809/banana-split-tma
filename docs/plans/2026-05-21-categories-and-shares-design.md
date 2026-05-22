# BananaSplitz extension — Categories & Share Amounts

Date: 2026-05-21
Status: Approved

## Goal

Surface expense **categories** across the three layers of the Raycast
extension (groups list, transactions list, transaction detail) plus a
category **filter**, and show each expense's **"your share"** amount
alongside the total. Read-only.

## Backend — `packages/trpc`

New `user.getMe` query:

- `protectedProcedure`, no input.
- Returns the authenticated user `{ id, firstName, lastName, username, baseCurrency }` (`id` as a number).
- Throws `UNAUTHORIZED` if the API key is not bound to a user.
- Registered in `routers/user/index.ts`.

Needed because no existing endpoint echoes the caller's own user ID, which
is required to pick the caller's `ExpenseShare` from an expense.

## Data source

`category.listByChat({ chatId })` returns base + custom categories already
resolved (`{ id, emoji, title, kind, hidden }`). An expense's `categoryId`
(`base:<slug>` / `chat:<uuid>`) matches an item `id` directly, so a
`Map<id, {emoji,title}>` resolves any expense. No new package dependency.

## Extension changes

### Shared — `lib/transactions.ts`

`ExpenseTxn` gains:

- `category: { id: string; emoji: string; title: string } | null`
- `myShare: number | null`

### Layer 1 — `groups.tsx`

Fetch `category.listByChat` per group in the same batched round trip as
`listByChatLean`. The "Recent Expenses" preview labels use the category
emoji as their icon (fallback: receipt icon).

### Layer 2 — `group-transactions.tsx`

Fetch `user.getMe` + `category.listByChat` alongside the existing three
queries. Per expense, resolve its category and the caller's share.

- Row icon = category emoji (🧾 uncategorized expense, → settlement).
- Row accessories = `your <share>` tag + `of <total> <ccy>` text + date.
  Settlements and non-participant expenses show the total only.
- `searchBarAccessory` filter dropdown: All Transactions / one entry per
  category present in the group / Uncategorized. Changing it resets the
  scroll pagination.

### Layer 3 — `transaction-detail.tsx`

- Category chip in the chip row (`🍜 Food`).
- A "Your share" chip.
- The caller's row is bolded in the split table.

## Error handling

- `category.listByChat` fails for a group → empty map → no emoji, the rest
  still works.
- `user.getMe` fails (e.g. not yet deployed to the production API the
  extension points at) → `myShare` stays `null` → rows show totals only,
  no crash. Share amounts light up once `getMe` is deployed or `apiUrl`
  points at localhost.

## Verification

`tsc --noEmit` + `ray build` + manual check via the dev server. No
automated test harness exists in this extension.
