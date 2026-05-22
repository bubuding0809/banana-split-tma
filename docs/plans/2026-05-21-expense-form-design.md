# BananaSplitz extension — Add Expense form

Date: 2026-05-21
Status: Approved

## Goal

Add the extension's first write operation: a Raycast `Form` to create an
expense in a group via `expense.createExpense`.

## Scope

- Split modes: **EQUAL, SHARES, EXACT** (the three the mini-app surfaces;
  PERCENTAGE is excluded).
- Launched as an in-context **Add Expense** action (⌘N) from the Groups
  list and the Transactions view — `chatId` comes from context.
- `sendNotification: true` is always passed; the server gates the actual
  Telegram message on the group's `notifyOnExpense` flag (mini-app parity).

## Approach

Single dynamic Raycast `Form`. When the split mode is SHARES or EXACT, a
numeric field is rendered per selected participant. One screen.

## Component — `src/add-expense.tsx`

`AddExpenseForm({ chatId, baseCurrency, groupTitle, onCreated })`.

On open, fetches in one batched request: `chat.getMembers`,
`category.listByChat`, `user.getMe`.

### Fields

| Field | Control | Default |
| --- | --- | --- |
| Description | TextField (≤60) | — |
| Amount | TextField (numeric) | — |
| Currency | Dropdown | group base currency |
| Category | Dropdown (emoji + title, + None) | None |
| Paid by | Dropdown (members) | the caller |
| Date | DatePicker | today |
| Split | Dropdown: Equal / Shares / Exact | Equal |
| Participants | TagPicker (members) | all members |
| Per-participant amount | TextField each — only when Shares/Exact | — |

### Submit

`expense.createExpense.mutate({ chatId, creatorId, payerId, description,
amount, currency, date, splitMode, participantIds, customSplits,
categoryId, sendNotification: true })`.

- `customSplits` built from the per-participant fields; omitted for EQUAL.
- Client validation: amount > 0, description non-empty, EXACT splits sum
  ≈ amount, SHARES counts > 0.
- Success → success toast, pop back, `onCreated()` revalidates the list.
- Failure → failure toast surfacing the server's message verbatim (its
  split-validation errors are already descriptive).

## Error handling

- Fetch failure → `usePromise` toast.
- `user.getMe` failure → submit blocked (creator unknown).
- Server rejection → surfaced verbatim in a failure toast.

## Touched files

- New: `src/add-expense.tsx`.
- `groups.tsx`: add the Add Expense action; thread `baseCurrency`.
- `group-transactions.tsx`: accept a `baseCurrency` prop; add the action.
- No backend changes.

## Explicitly excluded (YAGNI)

Recurrence, PERCENTAGE split mode, editing/deleting expenses.

## Verification

`tsc --noEmit` + `ray build` + manual check via the dev server. No
automated test harness exists in this extension.
