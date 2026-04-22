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
    const trpcMock = {
      expense: {
        getExpenseDetails: {
          query: vi.fn().mockResolvedValue({
            creatorId: 1,
            payerId: 1,
            amount: 10,
            splitMode: "EQUAL",
            participants: [],
            shares: [],
          }),
        },
      },
    } as any;
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
    const trpcMock = {
      expense: {
        getExpenseDetails: {
          query: vi.fn().mockResolvedValue({
            creatorId: 1,
            payerId: 1,
            amount: 10,
            splitMode: "EQUAL",
            participants: [],
            shares: [],
          }),
        },
      },
    } as any;

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
        date: "invalid",
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
    const trpcMock = {
      expense: {
        getExpenseDetails: {
          query: vi.fn().mockResolvedValue({
            creatorId: 1,
            payerId: 1,
            amount: 10,
            splitMode: "EQUAL",
            participants: [],
            shares: [],
          }),
        },
      },
    } as any;

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
    const trpcMock = {
      expense: {
        getExpenseDetails: {
          query: vi.fn().mockResolvedValue({
            creatorId: 1,
            payerId: 1,
            amount: 10,
            splitMode: "EQUAL",
            participants: [],
            shares: [],
          }),
        },
      },
    } as any;
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
    const trpcMock = {
      expense: {
        getExpenseDetails: {
          query: vi.fn().mockResolvedValue({
            creatorId: 1,
            payerId: 1,
            amount: 10,
            splitMode: "EQUAL",
            participants: [],
            shares: [],
          }),
        },
      },
    } as any;
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
    const trpcMock = {
      expense: {
        getExpenseDetails: {
          query: vi.fn().mockResolvedValue({
            creatorId: 1,
            payerId: 1,
            amount: 10,
            splitMode: "EQUAL",
            participants: [],
            shares: [],
          }),
        },
      },
    } as any;
    const result = await cmd?.execute({}, trpcMock);
    expect(result).toMatchObject({
      code: "missing_option",
      message: "--file is required",
    });
  });

  it("bulk-import-expenses should fail if file contains invalid JSON", async () => {
    const cmd = expenseCommands.find((c) => c.name === "bulk-import-expenses");
    vi.mocked(fs.readFileSync).mockReturnValueOnce("not-json");
    const trpcMock = {
      expense: {
        getExpenseDetails: {
          query: vi.fn().mockResolvedValue({
            creatorId: 1,
            payerId: 1,
            amount: 10,
            splitMode: "EQUAL",
            participants: [],
            shares: [],
          }),
        },
      },
    } as any;
    const result = await cmd?.execute({ file: "bad.json" }, trpcMock);
    expect(result).toMatchObject({ code: "invalid_option" });
  });

  it("bulk-import-expenses should fail if JSON is not an array", async () => {
    const cmd = expenseCommands.find((c) => c.name === "bulk-import-expenses");
    vi.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify({ foo: 1 }));
    const trpcMock = {
      expense: {
        getExpenseDetails: {
          query: vi.fn().mockResolvedValue({
            creatorId: 1,
            payerId: 1,
            amount: 10,
            splitMode: "EQUAL",
            participants: [],
            shares: [],
          }),
        },
      },
    } as any;
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

  it("bulk-update-expenses should fail if --file is missing", async () => {
    const cmd = expenseCommands.find((c) => c.name === "bulk-update-expenses");
    const result = await cmd?.execute({}, {} as any);
    expect(result).toMatchObject({
      code: "missing_option",
      message: "--file is required",
    });
  });

  it("bulk-update-expenses should fail if file contains invalid JSON", async () => {
    const cmd = expenseCommands.find((c) => c.name === "bulk-update-expenses");
    vi.mocked(fs.readFileSync).mockReturnValueOnce("not-json");
    const result = await cmd?.execute({ file: "bad.json" }, {} as any);
    expect(result).toMatchObject({ code: "invalid_option" });
  });

  it("bulk-update-expenses should fail if JSON is not an array", async () => {
    const cmd = expenseCommands.find((c) => c.name === "bulk-update-expenses");
    vi.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify({ foo: 1 }));
    const result = await cmd?.execute({ file: "obj.json" }, {} as any);
    expect(result).toMatchObject({
      code: "invalid_option",
      message: "JSON file must contain an array of expense update objects",
    });
  });

  it("bulk-update-expenses should fan-out updateExpense per row and return a summary", async () => {
    const cmd = expenseCommands.find((c) => c.name === "bulk-update-expenses");
    const rows = [
      { expenseId: "exp-1", amount: 42 },
      { expenseId: "exp-2", category: "base:food" },
    ];
    vi.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify(rows));

    const queryMock = vi
      .fn()
      .mockResolvedValueOnce({
        creatorId: 1,
        payerId: 1,
        amount: 10,
        currency: "SGD",
        splitMode: "EXACT",
        participants: [{ id: 1 }, { id: 2 }],
        shares: [
          { userId: 1, amount: 5 },
          { userId: 2, amount: 5 },
        ],
        categoryId: null,
        description: "Lunch",
      })
      .mockResolvedValueOnce({
        creatorId: 1,
        payerId: 2,
        amount: 20,
        currency: "SGD",
        splitMode: "EQUAL",
        participants: [{ id: 1 }, { id: 2 }],
        shares: [],
        categoryId: null,
        description: "Taxi",
      });
    const mutateMock = vi
      .fn()
      .mockResolvedValueOnce({ id: "exp-1" })
      .mockResolvedValueOnce({ id: "exp-2" });

    const trpcMock = {
      expense: {
        getExpenseDetails: { query: queryMock },
        updateExpense: { mutate: mutateMock },
      },
    } as any;

    const result = (await cmd?.execute(
      { file: "updates.json", "chat-id": "123" },
      trpcMock
    )) as any;

    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(mutateMock).toHaveBeenCalledTimes(2);
    // Row 0: only amount changed; shares preserved from existing
    expect(mutateMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        expenseId: "exp-1",
        amount: 42,
        splitMode: "EXACT",
        customSplits: [
          { userId: 1, amount: 5 },
          { userId: 2, amount: 5 },
        ],
        categoryId: null,
      })
    );
    // Row 1: only category changed; amount/splitMode preserved
    expect(mutateMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        expenseId: "exp-2",
        amount: 20,
        splitMode: "EQUAL",
        categoryId: "base:food",
      })
    );
    expect(result).toMatchObject({
      total: 2,
      succeeded: 2,
      failed: 0,
    });
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toMatchObject({
      index: 0,
      status: "success",
      expenseId: "exp-1",
    });
  });

  it("bulk-update-expenses should continue on error and report per-row failures", async () => {
    const cmd = expenseCommands.find((c) => c.name === "bulk-update-expenses");
    const rows = [
      { expenseId: "exp-1", amount: 10 },
      { expenseId: "exp-2", amount: 20 },
    ];
    vi.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify(rows));

    const queryMock = vi.fn().mockResolvedValue({
      creatorId: 1,
      payerId: 1,
      amount: 100,
      currency: "SGD",
      splitMode: "EQUAL",
      participants: [{ id: 1 }],
      shares: [],
      categoryId: null,
      description: "X",
    });
    const mutateMock = vi
      .fn()
      .mockResolvedValueOnce({ id: "exp-1" })
      .mockRejectedValueOnce(new Error("Forbidden"));

    const trpcMock = {
      expense: {
        getExpenseDetails: { query: queryMock },
        updateExpense: { mutate: mutateMock },
      },
    } as any;

    const result = (await cmd?.execute(
      { file: "updates.json" },
      trpcMock
    )) as any;

    expect(result.total).toBe(2);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.results[0]).toMatchObject({
      index: 0,
      status: "success",
      expenseId: "exp-1",
    });
    expect(result.results[1]).toMatchObject({
      index: 1,
      status: "error",
      expenseId: "exp-2",
      error: "Forbidden",
    });
  });

  it("bulk-update-expenses should flag rows missing expenseId without calling the server", async () => {
    const cmd = expenseCommands.find((c) => c.name === "bulk-update-expenses");
    const rows = [{ amount: 10 }, { expenseId: "exp-2", amount: 20 }];
    vi.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify(rows));

    const queryMock = vi.fn().mockResolvedValue({
      creatorId: 1,
      payerId: 1,
      amount: 100,
      currency: "SGD",
      splitMode: "EQUAL",
      participants: [{ id: 1 }],
      shares: [],
      categoryId: null,
      description: "X",
    });
    const mutateMock = vi.fn().mockResolvedValue({ id: "exp-2" });

    const trpcMock = {
      expense: {
        getExpenseDetails: { query: queryMock },
        updateExpense: { mutate: mutateMock },
      },
    } as any;

    const result = (await cmd?.execute(
      { file: "updates.json" },
      trpcMock
    )) as any;

    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(mutateMock).toHaveBeenCalledTimes(1);
    expect(result.total).toBe(2);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.results[0]).toMatchObject({
      index: 0,
      status: "error",
      error: "row is missing expenseId",
    });
    expect(result.results[1]).toMatchObject({
      index: 1,
      status: "success",
      expenseId: "exp-2",
    });
  });

  it("bulk-update-expenses should reject invalid date per row without aborting the batch", async () => {
    const cmd = expenseCommands.find((c) => c.name === "bulk-update-expenses");
    const rows = [
      { expenseId: "exp-1", date: "not-a-date" },
      { expenseId: "exp-2", amount: 5 },
    ];
    vi.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify(rows));

    const queryMock = vi.fn().mockResolvedValue({
      creatorId: 1,
      payerId: 1,
      amount: 100,
      currency: "SGD",
      splitMode: "EQUAL",
      participants: [{ id: 1 }],
      shares: [],
      categoryId: null,
      description: "X",
    });
    const mutateMock = vi.fn().mockResolvedValue({ id: "exp-2" });

    const trpcMock = {
      expense: {
        getExpenseDetails: { query: queryMock },
        updateExpense: { mutate: mutateMock },
      },
    } as any;

    const result = (await cmd?.execute(
      { file: "updates.json" },
      trpcMock
    )) as any;

    expect(result.total).toBe(2);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.results[0]).toMatchObject({
      index: 0,
      status: "error",
      expenseId: "exp-1",
      error: "date must be a valid ISO 8601 string",
    });
    expect(mutateMock).toHaveBeenCalledTimes(1);
  });

  it("bulk-update-expenses should parse row.date to a Date object before calling updateExpense", async () => {
    const cmd = expenseCommands.find((c) => c.name === "bulk-update-expenses");
    const rows = [
      { expenseId: "exp-1", date: "2026-03-04T10:00:00Z", amount: 9 },
    ];
    vi.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify(rows));

    const queryMock = vi.fn().mockResolvedValue({
      creatorId: 1,
      payerId: 1,
      amount: 100,
      currency: "SGD",
      splitMode: "EQUAL",
      participants: [{ id: 1 }],
      shares: [],
      categoryId: null,
      description: "X",
    });
    const mutateMock = vi.fn().mockResolvedValue({ id: "exp-1" });

    const trpcMock = {
      expense: {
        getExpenseDetails: { query: queryMock },
        updateExpense: { mutate: mutateMock },
      },
    } as any;

    await cmd?.execute({ file: "updates.json" }, trpcMock);

    const call = mutateMock.mock.calls[0][0];
    expect(call.date).toBeInstanceOf(Date);
    expect(call.date.toISOString()).toBe("2026-03-04T10:00:00.000Z");
  });

  it("bulk-update-expenses --notify should call sendBatchExpenseSummary with resolved items", async () => {
    const cmd = expenseCommands.find((c) => c.name === "bulk-update-expenses");
    const rows = [
      { expenseId: "exp-1", category: "base:food" },
      { expenseId: "exp-2", category: "base:transport" },
    ];
    vi.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify(rows));

    const queryMock = vi.fn().mockResolvedValue({
      creatorId: 1,
      payerId: 1,
      amount: 20,
      currency: "SGD",
      splitMode: "EQUAL",
      participants: [{ id: 1 }, { id: 2 }],
      shares: [],
      categoryId: null,
      description: "Meal",
    });
    const updateMutate = vi.fn().mockImplementation(async (args: any) => ({
      id: args.expenseId,
      description: args.description,
      amount: args.amount,
      currency: args.currency,
      categoryId: args.categoryId,
    }));
    const summaryMutate = vi
      .fn()
      .mockResolvedValue({ sent: true, messageId: 42 });

    const trpcMock = {
      expense: {
        getExpenseDetails: { query: queryMock },
        updateExpense: { mutate: updateMutate },
        sendBatchExpenseSummary: { mutate: summaryMutate },
      },
    } as any;

    const result = (await cmd?.execute(
      { file: "updates.json", "chat-id": "123", notify: true },
      trpcMock
    )) as any;

    // All per-row updates were called silently
    expect(updateMutate).toHaveBeenCalledTimes(2);
    for (const call of updateMutate.mock.calls) {
      expect(call[0]).toMatchObject({ sendNotification: false });
    }
    // Summary was called once with the resolved items
    expect(summaryMutate).toHaveBeenCalledTimes(1);
    expect(summaryMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 123,
        kind: "updated",
        items: expect.arrayContaining([
          expect.objectContaining({
            description: "Meal",
            categoryId: "base:food",
            currency: "SGD",
          }),
          expect.objectContaining({
            description: "Meal",
            categoryId: "base:transport",
          }),
        ]),
      })
    );
    expect(result).toMatchObject({
      total: 2,
      succeeded: 2,
      failed: 0,
      summary: { sent: true, messageId: 42 },
    });
  });

  it("bulk-update-expenses without --notify should not call sendBatchExpenseSummary", async () => {
    const cmd = expenseCommands.find((c) => c.name === "bulk-update-expenses");
    const rows = [{ expenseId: "exp-1", amount: 5 }];
    vi.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify(rows));

    const queryMock = vi.fn().mockResolvedValue({
      creatorId: 1,
      payerId: 1,
      amount: 10,
      currency: "SGD",
      splitMode: "EQUAL",
      participants: [{ id: 1 }],
      shares: [],
      categoryId: null,
      description: "X",
    });
    const updateMutate = vi.fn().mockResolvedValue({ id: "exp-1" });
    const summaryMutate = vi.fn();

    const trpcMock = {
      expense: {
        getExpenseDetails: { query: queryMock },
        updateExpense: { mutate: updateMutate },
        sendBatchExpenseSummary: { mutate: summaryMutate },
      },
    } as any;

    const result = (await cmd?.execute(
      { file: "updates.json" },
      trpcMock
    )) as any;

    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(summaryMutate).not.toHaveBeenCalled();
    expect(result.summary).toBeUndefined();
  });

  it("bulk-import-expenses --notify should call sendBatchExpenseSummary with kind=created", async () => {
    const cmd = expenseCommands.find((c) => c.name === "bulk-import-expenses");
    const rows = [
      {
        payerId: 1,
        description: "Dinner",
        amount: 30,
        currency: "SGD",
        splitMode: "EQUAL",
        participantIds: [1, 2],
      },
    ];
    vi.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify(rows));

    const bulkMutate = vi.fn().mockResolvedValue({
      total: 1,
      succeeded: 1,
      failed: 0,
      results: [
        {
          index: 0,
          status: "success",
          description: "Dinner",
          expense: {
            id: "exp-1",
            description: "Dinner",
            amount: 30,
            currency: "SGD",
            categoryId: null,
          },
        },
      ],
    });
    const summaryMutate = vi
      .fn()
      .mockResolvedValue({ sent: true, messageId: 99 });

    const trpcMock = {
      expense: {
        createExpensesBulk: { mutate: bulkMutate },
        sendBatchExpenseSummary: { mutate: summaryMutate },
      },
    } as any;

    const result = (await cmd?.execute(
      { file: "expenses.json", notify: true },
      trpcMock
    )) as any;

    expect(summaryMutate).toHaveBeenCalledTimes(1);
    expect(summaryMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "created",
        items: [expect.objectContaining({ description: "Dinner", amount: 30 })],
      })
    );
    expect(result).toMatchObject({
      total: 1,
      succeeded: 1,
      summary: { sent: true, messageId: 99 },
    });
  });

  it("bulk-update-expenses should surface a clean 'not found' error for unknown expenseId", async () => {
    const cmd = expenseCommands.find((c) => c.name === "bulk-update-expenses");
    const rows = [
      { expenseId: "does-not-exist", category: "base:food" },
      { expenseId: "exp-2", amount: 5 },
    ];
    vi.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify(rows));

    const queryMock = vi
      .fn()
      // Mirrors prod: getExpenseDetails returns an empty-ish shape (not an
      // error) for unknown IDs.
      .mockResolvedValueOnce({
        amount: null,
        categoryId: null,
        participants: [],
        shares: [],
      })
      .mockResolvedValueOnce({
        creatorId: 1,
        payerId: 1,
        amount: 100,
        currency: "SGD",
        splitMode: "EQUAL",
        participants: [{ id: 1 }],
        shares: [],
        categoryId: null,
        description: "X",
      });
    const mutateMock = vi.fn().mockResolvedValueOnce({ id: "exp-2" });

    const trpcMock = {
      expense: {
        getExpenseDetails: { query: queryMock },
        updateExpense: { mutate: mutateMock },
      },
    } as any;

    const result = (await cmd?.execute(
      { file: "updates.json" },
      trpcMock
    )) as any;

    expect(mutateMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ total: 2, succeeded: 1, failed: 1 });
    expect(result.results[0]).toMatchObject({
      index: 0,
      status: "error",
      expenseId: "does-not-exist",
      error: "expense does-not-exist not found",
    });
  });

  it("bulk-update-expenses should treat category 'none' or null as clear", async () => {
    const cmd = expenseCommands.find((c) => c.name === "bulk-update-expenses");
    const rows = [
      { expenseId: "exp-1", category: "none" },
      { expenseId: "exp-2", category: null },
      { expenseId: "exp-3", category: "base:food" },
    ];
    vi.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify(rows));

    const queryMock = vi.fn().mockResolvedValue({
      creatorId: 1,
      payerId: 1,
      amount: 100,
      currency: "SGD",
      splitMode: "EQUAL",
      participants: [{ id: 1 }],
      shares: [],
      categoryId: "base:old",
      description: "X",
    });
    const mutateMock = vi.fn().mockResolvedValue({ id: "exp" });

    const trpcMock = {
      expense: {
        getExpenseDetails: { query: queryMock },
        updateExpense: { mutate: mutateMock },
      },
    } as any;

    await cmd?.execute({ file: "updates.json" }, trpcMock);

    expect(mutateMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ expenseId: "exp-1", categoryId: null })
    );
    expect(mutateMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ expenseId: "exp-2", categoryId: null })
    );
    expect(mutateMock).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ expenseId: "exp-3", categoryId: "base:food" })
    );
  });

  it("update-expense should fail if required options are missing", async () => {
    const cmd = expenseCommands.find((c) => c.name === "update-expense");
    const trpcMock = {
      expense: {
        getExpenseDetails: {
          query: vi.fn().mockResolvedValue({
            creatorId: 1,
            payerId: 1,
            amount: 10,
            splitMode: "EQUAL",
            participants: [],
            shares: [],
          }),
        },
      },
    } as any;

    expect(await cmd?.execute({}, trpcMock)).toMatchObject({
      code: "missing_option",
      message: "--expense-id is required",
    });
  });

  it("update-expense should call trpc.expense.updateExpense with valid inputs", async () => {
    const cmd = expenseCommands.find((c) => c.name === "update-expense");
    const mutateMock = vi.fn().mockResolvedValue({ id: "exp-123" });
    const trpcMock = {
      expense: {
        getExpenseDetails: {
          query: vi.fn().mockResolvedValue({
            creatorId: 1,
            payerId: 1,
            amount: 10,
            splitMode: "EQUAL",
            participants: [],
            shares: [],
          }),
        },
        updateExpense: { mutate: mutateMock },
      },
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
      expense: {
        getExpenseDetails: {
          query: vi.fn().mockResolvedValue({
            creatorId: 1,
            payerId: 1,
            amount: 10,
            splitMode: "EQUAL",
            participants: [],
            shares: [],
          }),
        },
        updateExpense: { mutate: mutateMock },
      },
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
    const trpcMock = {
      expense: {
        getExpenseDetails: {
          query: vi.fn().mockResolvedValue({
            creatorId: 1,
            payerId: 1,
            amount: 10,
            splitMode: "EQUAL",
            participants: [],
            shares: [],
          }),
        },
      },
    } as any;

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
      code: "api_error",
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

    // Only the base:food expense matches; untagged expenses no longer
    // sneak through, and base:transport is correctly filtered out.
    expect(result.some((e) => e.id === "exp-1")).toBe(true);
    expect(result.some((e) => e.id === "exp-2")).toBe(false);
    expect(result.some((e) => e.id === "exp-3")).toBe(false);
  });

  it("list-expenses: --category none returns only uncategorized expenses", async () => {
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
        description: "Random",
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
      { "chat-id": "111", category: "none" },
      trpcMock
    )) as any[];

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("exp-2");
  });
});
