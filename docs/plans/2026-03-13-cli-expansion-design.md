# CLI Expansion Design

## Objective

Expand the existing Banana Split "Agent-First CLI" to achieve full feature parity with the backend tRPC API for CRUD operations across major domains (Expenses, Settlements, and Snapshots).

## Motivation

Currently, the CLI exposes a subset of API functionality (`create-expense`, `list-expenses`, `delete-expense`, etc.). To fully empower AI agents driving the CLI, we need parity for update and multi-step operations available via the app's backend API.

## Design Details

The following commands will be added to the CLI under their respective domain files (`apps/cli/src/commands/`).

### 1. `update-expense`

- **File:** `apps/cli/src/commands/expense.ts`
- **Purpose:** Updates an existing expense. The tRPC API requires replacing the expense payload (no partial updates for calculations).
- **Options:**
  - `--expense-id` (Required)
  - `--payer-id`, `--description`, `--amount`, `--split-mode`, `--participant-ids` (Required, mimics `create-expense`)
  - `--chat-id`, `--creator-id`, `--currency`, `--custom-splits` (Optional)
- **Behavior:** Calls `trpc.expense.updateExpense.mutate`.

### 2. `settle-all-debts`

- **File:** `apps/cli/src/commands/settlement.ts`
- **Purpose:** Settles outstanding debts across multiple currencies between two users simultaneously.
- **Options:**
  - `--chat-id`, `--sender-id`, `--receiver-id` (Required)
  - `--balances` (Required: JSON string of `[{currency, amount}]`)
  - `--creditor-name`, `--creditor-username`, `--debtor-name` (Optional, for notifications)
- **Behavior:** Calls `trpc.settlement.settleAllDebts.mutate`.

### 3. `create-snapshot`

- **File:** `apps/cli/src/commands/snapshot.ts`
- **Purpose:** Creates an expense snapshot combining multiple specific expenses.
- **Options:**
  - `--chat-id`, `--creator-id`, `--title` (Required)
  - `--expense-ids` (Required: comma-separated UUID string)
- **Behavior:** Calls `trpc.snapshot.createSnapshot.mutate`.

### 4. `update-snapshot`

- **File:** `apps/cli/src/commands/snapshot.ts`
- **Purpose:** Modifies an existing snapshot's title or associated expenses.
- **Options:**
  - `--snapshot-id`, `--chat-id`, `--title` (Required)
  - `--expense-ids` (Required: comma-separated UUID string)
- **Behavior:** Calls `trpc.snapshot.updateSnapshot.mutate`.

### 5. `delete-snapshot`

- **File:** `apps/cli/src/commands/snapshot.ts`
- **Purpose:** Deletes a specific snapshot.
- **Options:**
  - `--snapshot-id` (Required)
- **Behavior:** Calls `trpc.snapshot.deleteSnapshot.mutate`.

## Validation & Error Handling

- Arguments will be strictly typed and validated matching existing CLI conventions (`output.ts` -> `error()`, `success()`).
- JSON arguments like `--custom-splits` and `--balances` will include `try/catch` checks for parsing validity before executing the tRPC call.
