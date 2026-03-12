import { describe, it, expect, vi } from "vitest";
import { expenseCommands } from "./expense.js";

vi.mock("../output.js", () => ({
  success: vi.fn((data) => data),
  error: vi.fn((code, message) => ({ code, message })),
  run: vi.fn(async (cmd, fn) => {
    try {
      return await fn();
    } catch (err: any) {
      return { code: "api_error", message: err.message };
    }
  }),
}));

describe("delete-expense command", () => {
  it("should fail when expense-id is missing", async () => {
    const cmd = expenseCommands.find((c) => c.name === "delete-expense");

    // Minimal mock for trpc
    const trpcMock = {} as any;

    const result = await cmd?.execute({}, trpcMock);

    expect(result).toMatchObject({
      code: "missing_option",
      message: "--expense-id is required",
    });
  });

  it("should call trpc.expense.deleteExpense with the correct ID", async () => {
    const cmd = expenseCommands.find((c) => c.name === "delete-expense");

    const mutateMock = vi.fn().mockResolvedValue({ message: "Deleted" });
    const trpcMock = {
      expense: {
        deleteExpense: {
          mutate: mutateMock,
        },
      },
    } as any;

    await cmd?.execute({ "expense-id": "exp-123" }, trpcMock);

    expect(mutateMock).toHaveBeenCalledWith({ expenseId: "exp-123" });
  });
});
