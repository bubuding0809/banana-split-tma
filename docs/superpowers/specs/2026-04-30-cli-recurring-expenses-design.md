# CLI Recurring Expenses Design Spec

## Summary
Achieve parity with the backend's recurring expense capabilities in the CLI by enhancing the `create-expense` command and introducing a new suite of `recurring` commands.

## Problem/Background
The backend `trpc` API currently fully supports recurring expenses (creation, listing, fetching, updating, and cancelling) via the `recurringRouter` and `createExpenseWithRecurrence` endpoints. However, the CLI (`apps/cli`) currently only supports one-off expenses. To provide full programmatic control to CLI users and automated agents, we need to expose these recurring capabilities in the CLI interface.

## Solution

The solution takes a two-pronged approach:
1. **Creation via Enhancement:** Add recurring-specific flags to the existing `create-expense` command, routing to the specialized `createExpenseWithRecurrence` backend endpoint when these flags are present.
2. **Management via Dedicated Commands:** Create a new `recurring.ts` command module containing specific commands to list, get, update, and cancel recurring expense templates.

### Component 1: Enhancing `create-expense`
We will modify `apps/cli/src/commands/expense.ts` to add the following optional flags to `create-expense`:
- `--recurrence-frequency`: `DAILY`, `WEEKLY`, `MONTHLY`, `YEARLY`
- `--recurrence-interval`: Integer (default `1`)
- `--recurrence-weekdays`: Comma-separated list (e.g., `MON,WED`)
- `--recurrence-end-date`: ISO 8601 Date string
- `--recurrence-timezone`: Will default to the local system timezone (`Intl.DateTimeFormat().resolvedOptions().timeZone`) if not provided.

**Logic:** If `--recurrence-frequency` is provided, the command will invoke `trpc.expense.createExpenseWithRecurrence.mutate()`. If omitted, it maintains the current behavior of calling `trpc.expense.createExpense.mutate()`.

### Component 2: New `recurring.ts` Command Module
Create `apps/cli/src/commands/recurring.ts` exporting a `recurringCommands` array containing four new commands:

1. **`list-recurring-expenses`**
   - **Options:** `--chat-id` (optional, uses context if omitted)
   - **Action:** Calls `trpc.expense.recurring.list`.
   - **Output:** Formats templates showing ID, description, amount, frequency, and status.

2. **`get-recurring-expense`**
   - **Options:** `--template-id` (required)
   - **Action:** Calls `trpc.expense.recurring.get`.
   - **Output:** Dumps the full template details.

3. **`update-recurring-expense`**
   - **Options:** `--template-id` (required), `--amount`, `--description`, `--frequency`, `--interval`, `--weekdays`, `--end-date` (all optional).
   - **Action:** Calls `trpc.expense.recurring.update`.

4. **`cancel-recurring-expense`**
   - **Options:** `--template-id` (required)
   - **Action:** Calls `trpc.expense.recurring.cancel`.
   - **Output:** Confirms cancellation.

### Component 3: CLI Registration
Update `apps/cli/src/cli.ts` to:
- Import `recurringCommands` from `./commands/recurring.ts`.
- Append `...recurringCommands` to the `ALL_COMMANDS` array.

## Impact
✅ **Positive:**
- Full feature parity between the CLI and the backend regarding recurring expenses.
- Enables automation and agent-driven management of recurring expenses.
- Clean separation of concerns between creating (which materializes the first expense) and managing the underlying template.

✅ **Risk Assessment:**
- **Low risk**: We are solely mapping existing backend TRPC endpoints to CLI commands. No backend logic changes are required.

## Testing
- [ ] Test creating an expense *without* recurrence flags (ensure regression safety).
- [ ] Test creating a recurring expense with valid flags (verify it hits the new endpoint and succeeds).
- [ ] Test `list-recurring-expenses` to ensure the newly created template appears.
- [ ] Test `get-recurring-expense` with the specific template ID.
- [ ] Test `update-recurring-expense` by changing the amount and description.
- [ ] Test `cancel-recurring-expense` and verify the status changes to cancelled.