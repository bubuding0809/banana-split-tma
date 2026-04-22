# CLI Expense Categories — Design

Date: 2026-04-22
Scope: `apps/cli`

## Goal

Let a CLI user discover categories and attach/clear them on expenses. Achieves parity with the TMA for the expense-facing slice of the categories feature. Out of scope: custom category CRUD, ordering, `suggest`, and bulk-import category support (the `createExpensesBulk` schema doesn't accept `categoryId`).

## User stories

1. *As a CLI user, I want to list all categories available in my chat so I know which ids I can use.*
2. *As a CLI user, I want to tag a new expense with a category when I create it.*
3. *As a CLI user, I want to retag an existing expense, including clearing its category.*

## Deliverables

### 1. New command `list-categories`

- File: `apps/cli/src/commands/category.ts` (new) — exports `categoryCommands: Command[]`
- Option: `--chat-id` (optional, uses `resolveChatId`)
- Behavior: raw pass-through of `trpc.category.listByChat.query({ chatId })`
- Rationale: matches the `list-chats` / `get-debts` convention (pass-through of the tRPC result). The API already returns items with emoji + title + kind + position + hidden; agents and humans can filter client-side.
- Registered in `apps/cli/src/cli.ts` alongside the other `ALL_COMMANDS` entries.

### 2. `create-expense --category <id>`

- Option doc: `"Category id (e.g. base:food or chat:<uuid>). Run list-categories to see options."`
- Required: no
- Behavior: when present, pass `categoryId: <value>` to `expense.createExpense`. When absent, omit from payload.
- No `none` handling — a new expense defaults to uncategorized.

### 3. `update-expense --category <id>`

- Option doc: `"Category id (base:<slug> or chat:<uuid>). Pass 'none' to clear. Omit to leave unchanged."`
- Required: no
- Behavior:
  - Omitted → field not sent (`undefined`, preserves current).
  - `none` → send `categoryId: null` (clears).
  - Anything else → send `categoryId: <value>` verbatim (server validates).
- Rationale for `none`: consistent with `list-expenses --category none` which already uses `none` as the sentinel for "uncategorized" in this CLI.

## Non-goals

- No client-side regex for `base:` / `chat:` — the server already validates and returns a clear error.
- No changes to `bulk-import-expenses` — upstream schema does not accept `categoryId`.
- No custom category management commands (create/update/delete/suggest/reorder/reset) — deferred.
- No emoji rendering or pretty printing in `list-categories` — JSON-only is in keeping with the rest of the CLI.

## Verification

- Type check: `pnpm --filter @banananasplitz/cli build` passes.
- Manual UAT:
  - `node apps/cli/dist/cli.js list-categories` shows base + custom items.
  - `create-expense --category base:food ...` persists a categorized expense.
  - `update-expense --category base:transport ...` changes the category.
  - `update-expense --category none ...` clears the category.
  - `update-expense` without `--category` leaves category unchanged.
