import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TrpcClient } from "@bananasplitz/api-client";
import { ApiValidationError } from "../errors.js";
import {
  bulkImportExpenses,
  bulkUpdateExpenses,
  parseCreateExpenseInput,
} from "./expense.js";

vi.mock("@bananasplitz/api-client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@bananasplitz/api-client")>();
  return {
    ...actual,
    resolveChatId: vi.fn(async (_trpc, chatId?: string) =>
      chatId ? Number(chatId) : 12345
    ),
  };
});

describe("parseCreateExpenseInput", () => {
  it("parses valid input", () => {
    const parsed = parseCreateExpenseInput({
      payerId: "1",
      description: "Lunch",
      amount: "25.5",
      splitMode: "EQUAL",
      participantIds: "1,2",
      date: "2026-03-04",
    });

    expect(parsed).toMatchObject({
      payerId: 1,
      creatorId: 1,
      description: "Lunch",
      amount: 25.5,
      splitMode: "EQUAL",
      participantIds: [1, 2],
    });
    expect(parsed.date).toBeInstanceOf(Date);
  });

  it("throws ApiValidationError for missing required fields", () => {
    expect(() => parseCreateExpenseInput({} as never)).toThrow(
      ApiValidationError
    );
    try {
      parseCreateExpenseInput({} as never);
    } catch (err) {
      expect(err).toMatchObject({ code: "missing_field" });
    }
  });

  it("throws ApiValidationError for invalid date", () => {
    try {
      parseCreateExpenseInput({
        payerId: "1",
        description: "Lunch",
        amount: "10",
        splitMode: "EQUAL",
        participantIds: "1",
        date: "invalid",
      });
      expect.fail("should throw");
    } catch (err) {
      expect(err).toMatchObject({
        code: "invalid_field",
        message: "--date must be a valid ISO 8601 date string",
      });
    }
  });
});

describe("bulkImportExpenses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps rows and calls createExpensesBulk", async () => {
    const mutateMock = vi.fn().mockResolvedValue({
      succeeded: 1,
      failed: 0,
      results: [{ status: "success", index: 0, expense: { id: "exp-1" } }],
    });
    const trpc = {
      expense: { createExpensesBulk: { mutate: mutateMock } },
    } as unknown as TrpcClient;

    await bulkImportExpenses(trpc, {
      chatId: "999",
      rows: [
        {
          payerId: 1,
          description: "Coffee",
          amount: 5,
          splitMode: "EQUAL",
          participantIds: [1, 2],
          date: "2026-03-04",
          categoryId: "food",
        },
      ],
    });

    expect(mutateMock).toHaveBeenCalledWith({
      chatId: 999,
      expenses: [
        expect.objectContaining({
          payerId: 1,
          description: "Coffee",
          amount: 5,
          date: expect.any(Date),
          categoryId: "food",
        }),
      ],
    });
  });
});

describe("bulkUpdateExpenses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps category to categoryId and calls updateExpensesBulk", async () => {
    const mutateMock = vi.fn().mockResolvedValue({ succeeded: 1 });
    const trpc = {
      expense: { updateExpensesBulk: { mutate: mutateMock } },
    } as unknown as TrpcClient;

    await bulkUpdateExpenses(trpc, {
      chatId: "888",
      rows: [
        {
          expenseId: "exp-1",
          amount: 20,
          category: "none",
          date: "2026-03-04T10:00:00Z",
        },
      ],
    });

    expect(mutateMock).toHaveBeenCalledWith({
      chatId: 888,
      expenses: [
        {
          expenseId: "exp-1",
          amount: 20,
          categoryId: null,
          date: new Date("2026-03-04T10:00:00Z"),
        },
      ],
      sendNotification: false,
    });
  });

  it("throws ApiValidationError when row is missing expenseId", async () => {
    const trpc = {
      expense: { updateExpensesBulk: { mutate: vi.fn() } },
    } as unknown as TrpcClient;

    await expect(
      bulkUpdateExpenses(trpc, { rows: [{ amount: 10 }] as never })
    ).rejects.toMatchObject({
      code: "missing_field",
      message: "row 0: missing expenseId",
    });
  });

  it("throws ApiValidationError for invalid row date", async () => {
    const trpc = {
      expense: { updateExpensesBulk: { mutate: vi.fn() } },
    } as unknown as TrpcClient;

    await expect(
      bulkUpdateExpenses(trpc, {
        rows: [{ expenseId: "exp-1", date: "not-a-date" }],
      })
    ).rejects.toMatchObject({
      code: "invalid_field",
      message: "row 0: date must be a valid ISO 8601 string",
    });
  });
});
