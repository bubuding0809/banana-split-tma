import { describe, it, expect, vi } from "vitest";
import * as fs from "node:fs";
import { expenseCommands } from "./expense.js";

vi.mock("@repo/categories", () => ({
  BASE_CATEGORIES: [
    {
      id: "base:food",
      emoji: "🍔",
      title: "Food & Drink",
      keywords: ["food", "drink", "restaurant"],
    },
    {
      id: "base:transport",
      emoji: "🚗",
      title: "Transport",
      keywords: ["taxi", "bus", "mrt"],
    },
  ],
}));

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
      date: undefined,
      splitMode: "EQUAL",
      participantIds: [1, 2, 3],
      customSplits: undefined,
      sendNotification: true,
    });
  });

  it("create-expense should pass --date as a Date object", async () => {
    const cmd = expenseCommands.find((c) => c.name === "create-expense");
    const mutateMock = vi.fn().mockResolvedValue({ id: "new-exp" });
    const trpcMock = {
      expense: { createExpense: { mutate: mutateMock } },
    } as any;

    await cmd?.execute(
      {
        "payer-id": "1",
        description: "ntuc",
        amount: "10.88",
        "split-mode": "EQUAL",
        "participant-ids": "1,2",
        currency: "SGD",
        "chat-id": "123",
        date: "2026-03-04",
      },
      trpcMock
    );

    expect(mutateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        date: new Date("2026-03-04"),
        description: "ntuc",
        amount: 10.88,
      })
    );
  });

  it("create-expense should reject invalid --date", async () => {
    const cmd = expenseCommands.find((c) => c.name === "create-expense");
    const trpcMock = {} as any;

    const result = await cmd?.execute(
      {
        "payer-id": "1",
        description: "Food",
        amount: "100",
        "split-mode": "EQUAL",
        "participant-ids": "1,2",
        date: "not-a-date",
      },
      trpcMock
    );

    expect(result).toMatchObject({
      code: "invalid_option",
      message: "--date must be a valid ISO 8601 date string",
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

  it("bulk-import-expenses should call createExpensesBulk with all rows in one request", async () => {
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
    const mutateMock = vi.fn().mockResolvedValueOnce({
      total: 2,
      succeeded: 2,
      failed: 0,
      results: [
        {
          index: 0,
          status: "success",
          description: "Dinner",
          expense: { id: "exp-1" },
        },
        {
          index: 1,
          status: "success",
          description: "Taxi",
          expense: { id: "exp-2" },
        },
      ],
    });
    const trpcMock = {
      expense: { createExpensesBulk: { mutate: mutateMock } },
    } as any;

    const result = await cmd?.execute(
      { file: "expenses.json", "chat-id": "123" },
      trpcMock
    );

    expect(mutateMock).toHaveBeenCalledTimes(1);
    expect(mutateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 123,
        expenses: expect.arrayContaining([
          expect.objectContaining({ description: "Dinner", amount: 60 }),
          expect.objectContaining({ description: "Taxi", amount: 20 }),
        ]),
      })
    );
    expect(result).toMatchObject({ total: 2, succeeded: 2, failed: 0 });
  });

  it("bulk-import-expenses should parse date strings to Date objects", async () => {
    const cmd = expenseCommands.find((c) => c.name === "bulk-import-expenses");
    const rows = [
      {
        payerId: 1,
        description: "Lunch",
        amount: 15,
        splitMode: "EQUAL",
        participantIds: [1, 2],
        date: "2026-03-04",
      },
    ];
    vi.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify(rows));
    const mutateMock = vi.fn().mockResolvedValueOnce({
      total: 1,
      succeeded: 1,
      failed: 0,
      results: [],
    });
    const trpcMock = {
      expense: { createExpensesBulk: { mutate: mutateMock } },
    } as any;

    await cmd?.execute({ file: "expenses.json" }, trpcMock);

    const call = mutateMock.mock.calls[0][0];
    expect(call.expenses[0].date).toBeInstanceOf(Date);
    expect(call.expenses[0].date.toISOString().startsWith("2026-03-04")).toBe(
      true
    );
  });

  it("bulk-import-expenses should propagate server errors", async () => {
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
      expense: { createExpensesBulk: { mutate: mutateMock } },
    } as any;

    const result = await cmd?.execute({ file: "expenses.json" }, trpcMock);
    expect(result).toMatchObject({
      code: "api_error",
      message: "Network error",
    });
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
      date: undefined,
      currency: "USD",
      splitMode: "EQUAL",
      participantIds: [1, 2, 3],
      customSplits: undefined,
      sendNotification: true,
    });
  });

  it("update-expense should pass --date as a Date object", async () => {
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
        "participant-ids": "1,2",
        "chat-id": "123",
        date: "2026-03-04T10:00:00Z",
      },
      trpcMock
    );

    expect(mutateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        expenseId: "exp-123",
        date: new Date("2026-03-04T10:00:00Z"),
      })
    );
  });

  it("update-expense should reject invalid --date", async () => {
    const cmd = expenseCommands.find((c) => c.name === "update-expense");
    const trpcMock = {} as any;

    const result = await cmd?.execute(
      {
        "expense-id": "exp-123",
        "payer-id": "1",
        description: "Food",
        amount: "100",
        "split-mode": "EQUAL",
        "participant-ids": "1,2",
        date: "invalid",
      },
      trpcMock
    );

    expect(result).toMatchObject({
      code: "invalid_option",
      message: "--date must be a valid ISO 8601 date string",
    });
  });

  it("list-expenses: categorized expense shows categoryLabel with emoji + title", async () => {
    const cmd = expenseCommands.find((c) => c.name === "list-expenses");
    const expenses = [
      {
        id: "exp-1",
        description: "Burger",
        amount: 15,
        currency: "SGD",
        categoryId: "base:food",
      },
      {
        id: "exp-2",
        description: "Taxi",
        amount: 20,
        currency: "SGD",
        categoryId: null,
      },
    ];
    const queryMock = vi.fn().mockResolvedValue(expenses);
    const categoryQueryMock = vi
      .fn()
      .mockResolvedValue({ items: [], hasCustomOrder: false });
    const trpcMock = {
      expense: { getExpenseByChat: { query: queryMock } },
      category: { listByChat: { query: categoryQueryMock } },
    } as any;

    const result = (await cmd?.execute(
      { "chat-id": "111" },
      trpcMock
    )) as any[];

    expect(Array.isArray(result)).toBe(true);
    const food = result.find((e) => e.id === "exp-1");
    expect(food?.categoryLabel).toBe("🍔 Food & Drink");
    const taxi = result.find((e) => e.id === "exp-2");
    expect(taxi?.categoryLabel).toBeNull();
  });

  it("list-expenses: --category filter returns only matching expenses", async () => {
    const cmd = expenseCommands.find((c) => c.name === "list-expenses");
    const expenses = [
      {
        id: "exp-1",
        description: "Burger",
        amount: 15,
        currency: "SGD",
        categoryId: "base:food",
      },
      {
        id: "exp-2",
        description: "Taxi",
        amount: 20,
        currency: "SGD",
        categoryId: "base:transport",
      },
      {
        id: "exp-3",
        description: "Settlement",
        amount: 10,
        currency: "SGD",
        categoryId: null,
      },
    ];
    const queryMock = vi.fn().mockResolvedValue(expenses);
    const categoryQueryMock = vi
      .fn()
      .mockResolvedValue({ items: [], hasCustomOrder: false });
    const trpcMock = {
      expense: { getExpenseByChat: { query: queryMock } },
      category: { listByChat: { query: categoryQueryMock } },
    } as any;

    const result = (await cmd?.execute(
      { "chat-id": "111", category: "base:food" },
      trpcMock
    )) as any[];

    // base:food expense is included
    expect(result.some((e) => e.id === "exp-1")).toBe(true);
    // base:transport expense is filtered out
    expect(result.some((e) => e.id === "exp-2")).toBe(false);
    // null categoryId (settlement-like) always passes
    expect(result.some((e) => e.id === "exp-3")).toBe(true);
  });
});
