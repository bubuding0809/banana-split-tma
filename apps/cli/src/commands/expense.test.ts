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

vi.mock("../scope.js", () => ({
  resolveChatId: vi.fn(async (trpc, chatId) => {
    if (chatId) return Number(chatId);
    return 12345;
  }),
}));

describe("expense commands", () => {
  it("list-expenses should call trpc.expense.getExpenseByChat", async () => {
    const cmd = expenseCommands.find((c) => c.name === "list-expenses");
    const queryMock = vi.fn().mockResolvedValue([]);
    const trpcMock = {
      expense: { getExpenseByChat: { query: queryMock } },
    } as any;

    await cmd?.execute({ "chat-id": "111", currency: "USD" }, trpcMock);
    expect(queryMock).toHaveBeenCalledWith({ chatId: 111, currency: "USD" });
  });

  it("get-expense should fail if expense-id is missing", async () => {
    const cmd = expenseCommands.find((c) => c.name === "get-expense");
    const trpcMock = {} as any;
    const result = await cmd?.execute({}, trpcMock);

    expect(result).toMatchObject({
      code: "missing_option",
      message: "--expense-id is required",
    });
  });

  it("get-expense should call trpc.expense.getExpenseDetails", async () => {
    const cmd = expenseCommands.find((c) => c.name === "get-expense");
    const queryMock = vi.fn().mockResolvedValue({ id: "exp-123" });
    const trpcMock = {
      expense: { getExpenseDetails: { query: queryMock } },
    } as any;

    await cmd?.execute({ "expense-id": "exp-123" }, trpcMock);
    expect(queryMock).toHaveBeenCalledWith({ expenseId: "exp-123" });
  });

  it("create-expense should fail if required options are missing", async () => {
    const cmd = expenseCommands.find((c) => c.name === "create-expense");
    const trpcMock = {} as any;

    expect(await cmd?.execute({}, trpcMock)).toMatchObject({
      code: "missing_option",
      message: "--payer-id is required",
    });

    expect(await cmd?.execute({ "payer-id": "1" }, trpcMock)).toMatchObject({
      code: "missing_option",
      message: "--description is required",
    });

    expect(
      await cmd?.execute(
        {
          "payer-id": "1",
          description: "Food",
          amount: "100",
          "split-mode": "EQUAL",
        },
        trpcMock
      )
    ).toMatchObject({
      code: "missing_option",
      message: "--participant-ids is required",
    });
  });

  it("create-expense should call trpc.expense.createExpense with valid inputs", async () => {
    const cmd = expenseCommands.find((c) => c.name === "create-expense");
    const mutateMock = vi.fn().mockResolvedValue({ id: "new-exp" });
    const trpcMock = {
      expense: { createExpense: { mutate: mutateMock } },
    } as any;

    await cmd?.execute(
      {
        "payer-id": "1",
        description: "Food",
        amount: "100",
        "split-mode": "EQUAL",
        "participant-ids": "1,2,3",
        currency: "USD",
        "chat-id": "123",
      },
      trpcMock
    );

    expect(mutateMock).toHaveBeenCalledWith({
      chatId: 123,
      creatorId: 1,
      payerId: 1,
      description: "Food",
      amount: 100,
      currency: "USD",
      splitMode: "EQUAL",
      participantIds: [1, 2, 3],
      customSplits: undefined,
      sendNotification: true,
    });
  });

  it("get-net-share should fail if required options are missing", async () => {
    const cmd = expenseCommands.find((c) => c.name === "get-net-share");
    const trpcMock = {} as any;

    expect(await cmd?.execute({}, trpcMock)).toMatchObject({
      code: "missing_option",
      message: "--main-user-id is required",
    });

    expect(
      await cmd?.execute(
        { "main-user-id": "1", "target-user-id": "2" },
        trpcMock
      )
    ).toMatchObject({
      code: "missing_option",
      message: "--currency is required",
    });
  });

  it("get-net-share should call trpc.expenseShare.getNetShare", async () => {
    const cmd = expenseCommands.find((c) => c.name === "get-net-share");
    const queryMock = vi.fn().mockResolvedValue(50);
    const trpcMock = {
      expenseShare: { getNetShare: { query: queryMock } },
    } as any;

    await cmd?.execute(
      {
        "main-user-id": "1",
        "target-user-id": "2",
        currency: "USD",
        "chat-id": "123",
      },
      trpcMock
    );

    expect(queryMock).toHaveBeenCalledWith({
      mainUserId: 1,
      targetUserId: 2,
      chatId: 123,
      currency: "USD",
    });
  });

  it("get-totals should fail if user-id is missing", async () => {
    const cmd = expenseCommands.find((c) => c.name === "get-totals");
    const trpcMock = {} as any;
    const result = await cmd?.execute({}, trpcMock);

    expect(result).toMatchObject({
      code: "missing_option",
      message: "--user-id is required",
    });
  });

  it("get-totals should call getTotals endpoints", async () => {
    const cmd = expenseCommands.find((c) => c.name === "get-totals");
    const borrowedMock = vi.fn().mockResolvedValue(10);
    const lentMock = vi.fn().mockResolvedValue(20);
    const trpcMock = {
      expenseShare: {
        getTotalBorrowed: { query: borrowedMock },
        getTotalLent: { query: lentMock },
      },
    } as any;

    const result = await cmd?.execute(
      { "user-id": "1", "chat-id": "123" },
      trpcMock
    );

    expect(borrowedMock).toHaveBeenCalledWith({ userId: 1, chatId: 123 });
    expect(lentMock).toHaveBeenCalledWith({ userId: 1, chatId: 123 });
    expect(result).toMatchObject({ borrowed: 10, lent: 20 });
  });

  it("delete-expense should fail when expense-id is missing", async () => {
    const cmd = expenseCommands.find((c) => c.name === "delete-expense");
    const trpcMock = {} as any;
    const result = await cmd?.execute({}, trpcMock);

    expect(result).toMatchObject({
      code: "missing_option",
      message: "--expense-id is required",
    });
  });

  it("delete-expense should call trpc.expense.deleteExpense with the correct ID", async () => {
    const cmd = expenseCommands.find((c) => c.name === "delete-expense");
    const mutateMock = vi.fn().mockResolvedValue({ message: "Deleted" });
    const trpcMock = {
      expense: { deleteExpense: { mutate: mutateMock } },
    } as any;

    await cmd?.execute({ "expense-id": "exp-123" }, trpcMock);
    expect(mutateMock).toHaveBeenCalledWith({ expenseId: "exp-123" });
  });
});
