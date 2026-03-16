# Vitest Infrastructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Set up Vitest across the monorepo and backfill tests for the CLI and MCP delete commands.

**Architecture:** Install `vitest` at the workspace root, configure `test` scripts in `turbo.json` and package.json files, and add mock-based unit tests for the recently added `delete-expense` and `delete-settlement` operations in `apps/cli` and `apps/mcp`.

**Tech Stack:** TypeScript, Vitest, Turbo

---

### Task 1: Add Vitest to the Workspace

**Files:**
- Modify: `package.json` (root)
- Modify: `turbo.json`

**Step 1: Install Vitest**
Run the installation command at the root of the workspace to add Vitest to `devDependencies`.

```bash
pnpm add -wD vitest
```

**Step 2: Update turbo.json**
Add the `test` task to `turbo.json` in the `pipeline` (or `tasks`) section.

```json
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
```
(Insert it among the other tasks like `build` or `lint`).

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml turbo.json
git commit -m "chore: add vitest to workspace"
```

### Task 2: Configure CLI for testing

**Files:**
- Modify: `apps/cli/package.json`
- Create: `apps/cli/vitest.config.ts`

**Step 1: Update package.json scripts**
In `apps/cli/package.json`, add testing scripts:

```json
    "test": "vitest run",
    "test:watch": "vitest",
```

**Step 2: Create vitest.config.ts**
Create `apps/cli/vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
```

**Step 3: Commit**

```bash
git add apps/cli/package.json apps/cli/vitest.config.ts
git commit -m "chore(cli): setup vitest configuration"
```

### Task 3: Write tests for CLI delete-expense

**Files:**
- Create: `apps/cli/src/commands/expense.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from "vitest";
import { expenseCommands } from "./expense.js";

describe("delete-expense command", () => {
  it("should fail when expense-id is missing", async () => {
    const cmd = expenseCommands.find((c) => c.name === "delete-expense");
    
    // Minimal mock for trpc
    const trpcMock = {} as any;

    const result = await cmd?.execute({}, trpcMock);
    
    expect(result).toMatchObject({
      code: "missing_option",
      message: "--expense-id is required"
    });
  });

  it("should call trpc.expense.deleteExpense with the correct ID", async () => {
    const cmd = expenseCommands.find((c) => c.name === "delete-expense");
    
    const mutateMock = vi.fn().mockResolvedValue({ message: "Deleted" });
    const trpcMock = {
      expense: {
        deleteExpense: {
          mutate: mutateMock
        }
      }
    } as any;

    await cmd?.execute({ "expense-id": "exp-123" }, trpcMock);
    
    expect(mutateMock).toHaveBeenCalledWith({ expenseId: "exp-123" });
  });
});
```

*(Note: We might need to adjust the exact mock structure based on how `run` or `error` functions behave, but this validates the core logic).*

**Step 2: Run test to verify it passes (or fails correctly)**
Run: `pnpm --filter=@banananasplitz/cli test`

**Step 3: Fix imports/exports if needed (TDD green)**
If the tests fail because `run` or `error` exits the process or formats things unexpectedly, we may need to mock them or update our assertions. Fix it until the test passes.

**Step 4: Commit**

```bash
git add apps/cli/src/commands/expense.test.ts
git commit -m "test(cli): add tests for delete-expense command"
```

### Task 4: Write tests for CLI delete-settlement

**Files:**
- Create: `apps/cli/src/commands/settlement.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from "vitest";
import { settlementCommands } from "./settlement.js";

describe("delete-settlement command", () => {
  it("should fail when settlement-id is missing", async () => {
    const cmd = settlementCommands.find((c) => c.name === "delete-settlement");
    
    const trpcMock = {} as any;
    const result = await cmd?.execute({}, trpcMock);
    
    expect(result).toMatchObject({
      code: "missing_option",
      message: "--settlement-id is required"
    });
  });

  it("should call trpc.settlement.deleteSettlement with the correct ID", async () => {
    const cmd = settlementCommands.find((c) => c.name === "delete-settlement");
    
    const mutateMock = vi.fn().mockResolvedValue({ message: "Deleted" });
    const trpcMock = {
      settlement: {
        deleteSettlement: {
          mutate: mutateMock
        }
      }
    } as any;

    await cmd?.execute({ "settlement-id": "set-123" }, trpcMock);
    
    expect(mutateMock).toHaveBeenCalledWith({ settlementId: "set-123" });
  });
});
```

**Step 2: Run test**
Run: `pnpm --filter=@banananasplitz/cli test`

**Step 3: Commit**

```bash
git add apps/cli/src/commands/settlement.test.ts
git commit -m "test(cli): add tests for delete-settlement command"
```

### Task 5: Configure MCP for testing

**Files:**
- Modify: `apps/mcp/package.json`
- Create: `apps/mcp/vitest.config.ts`

**Step 1: Update package.json scripts**
In `apps/mcp/package.json`, add testing scripts:

```json
    "test": "vitest run",
    "test:watch": "vitest",
```

**Step 2: Create vitest.config.ts**
Create `apps/mcp/vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
```

**Step 3: Commit**

```bash
git add apps/mcp/package.json apps/mcp/vitest.config.ts
git commit -m "chore(mcp): setup vitest configuration"
```

### Task 6: Write tests for MCP tools

**Files:**
- Create: `apps/mcp/src/tools/expense.test.ts`
- Create: `apps/mcp/src/tools/settlement.test.ts`

**Step 1: Write test for expense tool**

```typescript
import { describe, it, expect, vi } from "vitest";
import { registerExpenseTools } from "./expense.js";

// Mock the util handler wrapper to just return the inner function
vi.mock("./utils.js", () => ({
  toolHandler: vi.fn((name, fn) => fn),
}));

describe("MCP Expense Tools", () => {
  it("banana_delete_expense should call trpc mutation", async () => {
    const serverMock = {
      registerTool: vi.fn(),
    } as any;
    
    const mutateMock = vi.fn().mockResolvedValue({ message: "Deleted successfully" });
    const trpcMock = {
      expense: {
        deleteExpense: { mutate: mutateMock }
      }
    } as any;

    registerExpenseTools(serverMock, trpcMock);

    // Find the registered delete_expense tool
    const callArgs = serverMock.registerTool.mock.calls.find(
      (args: any[]) => args[0] === "banana_delete_expense"
    );
    expect(callArgs).toBeDefined();

    // The third argument is the handler function (since we mocked toolHandler)
    const handler = callArgs[2];
    
    // Execute handler
    const result = await handler({ expense_id: "exp-123" });

    expect(mutateMock).toHaveBeenCalledWith({ expenseId: "exp-123" });
    expect(result.content[0].text).toContain("Deleted successfully");
  });
});
```

**Step 2: Write test for settlement tool**

```typescript
import { describe, it, expect, vi } from "vitest";
import { registerSettlementTools } from "./settlement.js";

vi.mock("./utils.js", () => ({
  toolHandler: vi.fn((name, fn) => fn),
}));

describe("MCP Settlement Tools", () => {
  it("banana_delete_settlement should call trpc mutation", async () => {
    const serverMock = {
      registerTool: vi.fn(),
    } as any;
    
    const mutateMock = vi.fn().mockResolvedValue({ message: "Deleted successfully" });
    const trpcMock = {
      settlement: {
        deleteSettlement: { mutate: mutateMock }
      }
    } as any;

    registerSettlementTools(serverMock, trpcMock);

    const callArgs = serverMock.registerTool.mock.calls.find(
      (args: any[]) => args[0] === "banana_delete_settlement"
    );
    expect(callArgs).toBeDefined();

    const handler = callArgs[2];
    const result = await handler({ settlement_id: "set-123" });

    expect(mutateMock).toHaveBeenCalledWith({ settlementId: "set-123" });
    expect(result.content[0].text).toContain("Deleted successfully");
  });
});
```

**Step 3: Run all tests**
Run: `npx turbo run test`

**Step 4: Commit**

```bash
git add apps/mcp/src/tools/expense.test.ts apps/mcp/src/tools/settlement.test.ts
git commit -m "test(mcp): add tests for delete tools"
```
