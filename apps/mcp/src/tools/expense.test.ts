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

    const mutateMock = vi
      .fn()
      .mockResolvedValue({ message: "Deleted successfully" });
    const trpcMock = {
      expense: {
        deleteExpense: { mutate: mutateMock },
      },
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
