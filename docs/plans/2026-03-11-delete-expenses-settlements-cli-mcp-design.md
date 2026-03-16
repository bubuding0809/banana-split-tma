# Delete Expenses and Settlements in CLI and MCP

## Context

The Banana Split TMA has functional commands and MCP tools to list, view, and create expenses and settlements. However, deleting them is currently only available through the frontend or manual database operations.

## Goal

Expand the CLI (`apps/cli`) and MCP (`apps/mcp`) capabilities to support deleting expenses and settlements using the existing tRPC API routers (`deleteExpense` and `deleteSettlement`).

## Approach

### CLI Commands

- Add `delete-expense` command in `apps/cli/src/commands/expense.ts`.
  - Input options: `--expense-id` (string, required).
  - Calls `trpc.expense.deleteExpense.mutate({ expenseId: String(opts["expense-id"]) })`.
  - Executes immediately without interactive confirmation prompts.
- Add `delete-settlement` command in `apps/cli/src/commands/settlement.ts`.
  - Input options: `--settlement-id` (string, required).
  - Calls `trpc.settlement.deleteSettlement.mutate({ settlementId: String(opts["settlement-id"]) })`.
  - Executes immediately without interactive confirmation prompts.

### MCP Tools

- Add `banana_delete_expense` tool in `apps/mcp/src/tools/expense.ts`.

  - Input parameter: `expense_id` (string).
  - Calls the identical tRPC mutation.
  - Returns a success status message.
  - Sets annotations: `{ destructiveHint: true }`.

- Add `banana_delete_settlement` tool in `apps/mcp/src/tools/settlement.ts`.
  - Input parameter: `settlement_id` (string).
  - Calls the identical tRPC mutation.
  - Returns a success status message.
  - Sets annotations: `{ destructiveHint: true }`.

## Testing & Verification

- Test running CLI commands for `delete-expense` and `delete-settlement` successfully.
- Review MCP tool definitions to ensure type validation handles input correctly and passes cleanly to `trpc.expense.deleteExpense` and `trpc.settlement.deleteSettlement`.
