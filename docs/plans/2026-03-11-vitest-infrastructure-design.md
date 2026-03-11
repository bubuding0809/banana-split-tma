# Vitest Infrastructure and CLI/MCP Testing Design

## Objective
Introduce `vitest` to the monorepo to enable automated testing, specifically backfilling tests for the newly added `delete-expense` and `delete-settlement` features in the CLI and MCP apps, ensuring compliance with strict TDD guidelines.

## Architecture
- **Framework:** `vitest` (chosen for speed, TypeScript support, and Vite/Turborepo alignment).
- **Installation Strategy:** 
  - Install `vitest` as a devDependency in the root `package.json`.
  - Add standard `test` (`vitest run`) and `test:watch` (`vitest`) scripts to `apps/cli` and `apps/mcp`.
- **Turborepo Integration:** 
  - Add `"test"` to the `pipeline` (or `tasks`) in `turbo.json` at the root.

## Components & Testing Strategy

### 1. CLI Tests (`apps/cli`)
- **Files to test:** 
  - `apps/cli/src/commands/expense.ts`
  - `apps/cli/src/commands/settlement.ts`
- **Mocking Strategy:**
  - Mock the injected `trpc` client (`trpc.expense.deleteExpense.mutate`, `trpc.settlement.deleteSettlement.mutate`).
  - Test validation logic (e.g., missing `--expense-id`).
  - Test correct execution by verifying `run()` callbacks execute the `trpc` client with correct arguments.

### 2. MCP Tests (`apps/mcp`)
- **Files to test:** 
  - `apps/mcp/src/tools/expense.ts`
  - `apps/mcp/src/tools/settlement.ts`
- **Mocking Strategy:**
  - Mock the `McpServer` and its `registerTool` method.
  - Mock the `trpc` client passed into `registerExpenseTools` and `registerSettlementTools`.
  - Test the `toolHandler` logic for `banana_delete_expense` and `banana_delete_settlement` to ensure arguments map correctly to the mocked backend mutation.

## Verification
- Running `npx turbo run test` from the root should execute tests in both `apps/cli` and `apps/mcp` successfully.
