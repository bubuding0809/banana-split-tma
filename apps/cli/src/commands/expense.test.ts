import { describe, it, expect, vi } from "vitest";
import * as fs from "node:fs";
import { expenseCommands } from "./expense.js";

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
}));

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

  it("bulk-import-expenses should fail if --file is missing", async () => {
    const cmd = expenseCommands.find((c) => c.name === "bulk-import-expenses");
    const trpcMock = {} as any;
    const result = await cmd?.execute({}, trpcMock);
    expect(result).toMatchObject({
      code: "missing_option",
      message: "--file is required",
    });
  });

  it("bulk-import-expenses should fail if file contains invalid JSON", async () => {
    const cmd = expenseCommands.find((c) => c.name === "bulk-import-expenses");
    vi.mocked(fs.readFileSync).mockReturnValueOnce("not-json");
    const trpcMock = {} as any;
    const result = await cmd?.execute({ file: "bad.json" }, trpcMock);
    expect(result).toMatchObject({ code: "invalid_option" });
  });

  it("bulk-import-expenses should fail if JSON is not an array", async () => {
    const cmd = expenseCommands.find((c) => c.name === "bulk-import-expenses");
    vi.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify({ foo: 1 }));
    const trpcMock = {} as any;
    const result = await cmd?.execute({ file: "obj.json" }, trpcMock);
    expect(result).toMatchObject({
      code: "invalid_option",
      message: "JSON file must contain an array of expense objects",
    });
  });

  it("bulk-import-expenses should import all rows and return a summary", async () => {
    const cmd = expenseCommands.find((c) => c.name === "bulk-import-expenses");
    const rows = [
      {
        payerId: 1,
        description: "Dinner",
        amount: 60,
        currency: "SGD",
        splitMode: "EQUAL",
        participantIds: [1, 2, 3],
      },
      {
        payerId: 2,
        description: "Taxi",
        amount: 20,
        currency: "SGD",
        splitMode: "EQUAL",
        participantIds: [1, 2],
      },
    ];
    vi.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify(rows));
    const mutateMock = vi
      .fn()
      .mockResolvedValueOnce({ id: "exp-1" })
      .mockResolvedValueOnce({ id: "exp-2" });
    const trpcMock = {
      expense: { createExpense: { mutate: mutateMock } },
    } as any;

    const result = await cmd?.execute(
      { file: "expenses.json", "chat-id": "123" },
      trpcMock
    );

    expect(mutateMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ total: 2, succeeded: 2, failed: 0 });
  });

  it("bulk-import-expenses should record failed rows without throwing", async () => {
    const cmd = expenseCommands.find((c) => c.name === "bulk-import-expenses");
    const rows = [
      {
        payerId: 1,
        description: "Groceries",
        amount: 50,
        splitMode: "EQUAL",
        participantIds: [1, 2],
      },
    ];
    vi.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify(rows));
    const mutateMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("Network error"));
    const trpcMock = {
      expense: { createExpense: { mutate: mutateMock } },
    } as any;

    const result = await cmd?.execute({ file: "expenses.json" }, trpcMock);
    expect(result).toMatchObject({ total: 1, succeeded: 0, failed: 1 });
  });

  it("update-expense should fail if required options are missing", async () => {
    const cmd = expenseCommands.find((c) => c.name === "update-expense");
    const trpcMock = {} as any;

    expect(await cmd?.execute({}, trpcMock)).toMatchObject({
      code: "missing_option",
      message: "--expense-id is required",
    });

    expect(
      await cmd?.execute({ "expense-id": "exp-1" }, trpcMock)
    ).toMatchObject({
      code: "missing_option",
      message: "--payer-id is required",
    });
  });

  it("update-expense should call trpc.expense.updateExpense with valid inputs", async () => {
    const cmd = expenseCommands.find((c) => c.name === "update-expense");
    const mutateMock = vi.fn().mockResolvedValue({ id: "exp-123" });
    const trpcMock = {
      expense: { updateExpense: { mutate: mutateMock } },
    } as any;

    await cmd?.execute(
      {
        "expense-id": "exp-123",
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
      expenseId: "exp-123",
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
});
