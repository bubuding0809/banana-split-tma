# CLI Cross-Chat Personal Summary

**Status:** Proposed
**Author:** @bubuding
**Date:** 2026-04-20

## Problem

With a **user-level** API key, the `@banananasplitz/cli` can reach every chat the caller is a member of, but there is no way to ask two routine personal questions in a single shot:

1. **"In which chats do I currently have an outstanding balance?"** — Today the user must call `list-chats` and then `get-debts` / `get-net-share` per chat to find rows that involve them.
2. **"What was my total damage this month, per chat?"** — `list-expenses` has no date filter, so the user must page through each chat's expenses and sum their share manually.

Both workflows are N+1 and tedious in both CLI and agent contexts.

## Goals

- Surface outstanding balances across all of caller's chats in one command.
- Surface caller's monthly spend per chat in one command.
- Keep the CLI agent-first: structured JSON, enough detail in one payload to avoid drill-in roundtrips.
- Reuse existing math primitives (`getBulkChatDebts`, `simplifyDebts`) rather than introducing parallel logic.

## Non-goals

- Cross-currency conversion. Currencies stay separate; no FX on the aggregation.
- Arbitrary date ranges. Monthly slice only for v1.
- Timezone flexibility. UTC month boundaries only.
- Paid-out-of-pocket metrics. Spend = caller's share of expenses, not cash paid.
- Chat-scoped API key support. Both commands require a user-level key.

## Definitions

- **Outstanding balance filter:** a chat is included in `list-my-balances` iff caller's aggregate net in at least one currency satisfies `|net| > 0.01`. The threshold mirrors `FINANCIAL_THRESHOLDS.DISPLAY` used elsewhere.
- **Monthly damage:** for a given `YYYY-MM`, the sum of caller's `ExpenseShare.amount` rows on expenses whose `date` falls within the UTC month and whose expense is not soft-deleted.
- **Counterparty net:** the signed amount between caller and another user in a chat+currency. `net > 0` = counterparty owes caller. `net < 0` = caller owes counterparty.

## User stories

1. *As a Banana Split user with a personal API key,* I run `banana list-my-balances` and immediately see every chat where I'm not square, including who I owe / who owes me in each.
2. *As a user compiling a monthly budget review,* I run `banana list-my-spending --month 2026-04` and see what I spent in each group that month, plus a grand total per currency.
3. *As an AI agent acting on the user's behalf,* I get enough context in one call to answer "what chats should I remind / settle first?" without fanning out across chats.

## Architecture

Two new tRPC procedures, two new CLI commands. No changes to existing routes or CLI commands.

```
packages/trpc/src/routers/expenseShare/
  getMyBalancesAcrossChats.ts   (new)
  getMySpendByMonth.ts          (new)
  index.ts                      (register new procedures)

apps/cli/src/commands/
  me.ts                         (new; both commands live here)

apps/cli/src/cli.ts             (import + register meCommands)
apps/cli/skills/banana-cli/SKILL.md (table + workflow block)
apps/cli/README.md              (table + usage)
```

Both procedures call `assertNotChatScoped(ctx.session)` at the top. Caller identity comes from `ctx.session.user.id`.

## Procedure 1: `expenseShare.getMyBalancesAcrossChats`

### Input

```ts
z.object({}) // no input
```

### Output

```ts
z.object({
  balances: z.array(
    z.object({
      chatId: z.number(),
      chatTitle: z.string(),
      debtSimplificationEnabled: z.boolean(),
      currencies: z.array(
        z.object({
          currency: z.string(),
          net: z.number(), // positive = owed to caller
        })
      ),
      counterparties: z.array(
        z.object({
          userId: z.number(),
          name: z.string(),       // firstName + optional " " + lastName
          currency: z.string(),
          net: z.number(),        // positive = counterparty owes caller
        })
      ),
    })
  ),
});
```

### Behavior

1. Fetch caller's chat memberships: `chats` with `{ id, title, baseCurrency, debtSimplificationEnabled, members.id }` where `members.id = caller`.
2. For each chat, batch-compute pairwise net per currency using the same shape as `getBulkChatDebtsHandler`:
   - One query for all relevant `ExpenseShare` rows joined to `Expense` (with `chatId, payerId, currency`), across all chats in one query.
   - One query for all relevant `Settlement` rows, across all chats in one query.
3. For each chat, group by currency. For each `(chat, currency)`:
   - Compute aggregate `balances[userId]` where positive = owed, negative = owes. (This is the exact map shape `simplifyDebts` consumes.)
   - Compute caller's `net` = `balances[caller]`. Skip the currency if `|net| <= 0.01`.
   - Build `counterparties[]`:
     - If `debtSimplificationEnabled = true`: run `simplifyDebts(balances)` and keep edges where `fromUserId === caller` or `toUserId === caller`. Map to `{ userId: otherSide, net: toUserId === caller ? +amount : -amount }`.
     - If `debtSimplificationEnabled = false`: derive raw pairwise nets between caller and each other member (same math as `getBulkChatDebts` restricted to caller-involved pairs). Emit entries where `|pairwise net| > 0.01`.
4. Drop chats whose `currencies` array ends up empty after thresholding. Return the rest.
5. Member display names come from a single `User.findMany` keyed by the union of counterparty IDs across all kept chats.

### Implementation notes

- Extract the pairwise-net computation inside `getBulkChatDebts.ts` into a reusable helper so this new procedure can call it without duplicating logic. Target file: `packages/trpc/src/utils/chatBalances.ts` (new).
- Keep one `groupBy` shape — do NOT iterate `getNetShareHandler` in a nested loop (unlike `getSimplifiedDebts.ts`). That O(N²·chats) call pattern is what this redesign explicitly avoids.

## Procedure 2: `expenseShare.getMySpendByMonth`

### Input

```ts
z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "month must be YYYY-MM"),
});
```

### Output

```ts
z.object({
  month: z.string(), // echo of input
  chats: z.array(
    z.object({
      chatId: z.number(),
      chatTitle: z.string(),
      spend: z.array(
        z.object({
          currency: z.string(),
          amount: z.number(),
        })
      ),
    })
  ),
  totals: z.array(
    z.object({
      currency: z.string(),
      amount: z.number(),
    })
  ),
});
```

### Behavior

1. Parse `month` → `[monthStart, monthEndExclusive)` in UTC.
2. Resolve caller's chat IDs (same membership query as procedure 1).
3. Single Prisma `groupBy` on `ExpenseShare` joined to `Expense`:
   - Filter: `userId = caller`, `expense.chatId IN callerChatIds`, `expense.date >= monthStart`, `expense.date < monthEndExclusive`, `expense.deletedAt IS NULL`.
   - Group by: `expense.chatId`, `expense.currency`.
   - Aggregate: `SUM(amount)`.
4. Resolve chat titles via one `findMany` on returned chat IDs.
5. Build `chats[]` (omit any chat with no rows), and `totals[]` by collapsing `(chatId, currency, amount)` into `(currency, sum(amount))`.
6. Sort `chats` by `chatTitle` ascending for stable output. Sort `totals` by `currency` ascending.

### Implementation notes

- Prisma `groupBy` across a relation (`Expense`) requires a raw SQL fallback OR a two-step: `findMany` on shares (select shape minimal) then in-memory reduce. Pick whichever is cleaner; the dataset is bounded by `caller's shares for the month`, which is tiny.
- Use `Decimal` arithmetic (via `sumAmounts`) then `toNumber` at the edge — same pattern as `getBulkChatDebts.ts`.

## CLI surface

### `banana list-my-balances`

- **Options:** none beyond global `--api-key` / `--api-url`.
- **Calls:** `trpc.expenseShare.getMyBalancesAcrossChats.query()`.
- **Output:** `{ ok: true, balances: [...] }`. Empty array when caller is square everywhere.
- **Help text:** mention that it requires a user-level key; chat-scoped keys get `auth_error`-equivalent from the server.

### `banana list-my-spending --month YYYY-MM`

- **Options:** `--month` (required, `YYYY-MM`).
- **Calls:** `trpc.expenseShare.getMySpendByMonth.query({ month })`.
- **Output:** `{ ok: true, month, chats: [...], totals: [...] }`.
- **Validation:** CLI regex-checks `--month` before calling server (`missing_option` if absent, `invalid_option` if malformed).

Both commands live in `apps/cli/src/commands/me.ts` under exported `meCommands: Command[]`. `cli.ts` imports and spreads them into `ALL_COMMANDS`.

## Auth & errors

- Chat-scoped key: both procedures throw `FORBIDDEN` via `assertNotChatScoped`. CLI surfaces the standard error JSON to stderr with exit 1.
- No caller user (shouldn't happen for user-api-key auth, but defensive): `UNAUTHORIZED`.
- Invalid `--month` format: CLI returns `{ error: "invalid_option", message: "--month must be YYYY-MM", command: "list-my-spending" }`.
- Empty results: normal success payloads with empty arrays; not errors.

## Testing

### Server (Vitest, co-located)

`getMyBalancesAcrossChats.spec.ts`:
- Caller square across all chats → empty balances array.
- One chat with caller net = 0 SGD but != 0 USD → chat appears, only USD currency row.
- Counterparty filtering: member-not-caller pairs are omitted.
- `debtSimplificationEnabled = true`: counterparties come from simplified graph; aggregate `net` still matches.
- `debtSimplificationEnabled = false`: counterparties are raw pairwise.
- Settlements offset expense shares correctly.
- Chat-scoped API key → `FORBIDDEN`.

`getMySpendByMonth.spec.ts`:
- Expense at `2026-04-30T23:59:59Z` counted for `2026-04`; expense at `2026-05-01T00:00:00Z` NOT counted.
- Soft-deleted expense (`deletedAt IS NOT NULL`) excluded.
- Caller's shares only; other members' shares on same expense excluded.
- Empty month → empty `chats`, empty `totals`, no error.
- `totals` sums match per-chat sums.
- Chat-scoped API key → `FORBIDDEN`.
- Invalid month format → Zod parse error (400).

### CLI (Vitest)

`me.test.ts`:
- `list-my-balances` dispatches to correct tRPC method, pipes response through `success()`.
- `list-my-spending` without `--month` → `missing_option`.
- `list-my-spending --month 2026-13` → `invalid_option`.
- `list-my-spending --month 2026-04` → dispatches with `{ month: "2026-04" }`.

## Skill & README updates

### `apps/cli/skills/banana-cli/SKILL.md`

1. Bump `version` front-matter to `0.6.0`.
2. Command reference table — add rows:
   - `list-my-balances` — *none* — Outstanding balances across all chats (user-level key only)
   - `list-my-spending` — `--month` (required) — Caller's monthly spend per chat (user-level key only)
3. New "Personal Cross-Chat Summary" workflow block:
   ```bash
   # What chats am I not square in?
   banana list-my-balances

   # What did I spend this month?
   banana list-my-spending --month 2026-04
   ```
4. Add to "Common Mistakes": "Using a chat-scoped key for `list-my-*` commands — they require a user-level key. Use `banana login --api-key <user-level-key>` first."

### `apps/cli/README.md`

- Add both commands to the usage examples block.
- Add both rows to the commands table.

## Rollout

- Single PR touching `packages/trpc` + `apps/cli` + skill + README.
- Bump `@banananasplitz/cli` version minor: `0.5.0 → 0.6.0` (matches skill version).
- CI gates: typecheck, lint, Vitest (server + CLI).
- No migrations, no env var changes.
- Manual UAT: caller with known balances + expenses, verify output matches expectations in one chat with simplification on and one with it off.
