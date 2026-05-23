import { describe, it, expect, vi } from "vitest";
import { applyExpensePartialUpdate } from "./expense-update.js";

describe("applyExpensePartialUpdate", () => {
  it("throws when expense is not found", async () => {
    const trpc = {
      expense: {
        getExpenseDetails: {
          query: vi.fn().mockResolvedValue({ splitMode: null }),
        },
      },
    } as never;

    await expect(
      applyExpensePartialUpdate({ expenseId: "missing-id" }, trpc, 123)
    ).rejects.toThrow("expense missing-id not found");
  });

  it("merges patch with existing expense and calls updateExpense", async () => {
    const existing = {
      splitMode: "EQUAL",
      participants: [{ id: 1 }, { id: 2 }],
      shares: [],
      creatorId: "10",
      payerId: "10",
      description: "Lunch",
      amount: "20",
      currency: "USD",
      date: new Date("2026-01-01"),
      categoryId: null,
    };
    const mutateMock = vi.fn().mockResolvedValue({ id: "exp-1" });
    const trpc = {
      expense: {
        getExpenseDetails: { query: vi.fn().mockResolvedValue(existing) },
        updateExpense: { mutate: mutateMock },
      },
    } as never;

    await applyExpensePartialUpdate(
      { expenseId: "exp-1", amount: 25 },
      trpc,
      999
    );

    expect(mutateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        expenseId: "exp-1",
        chatId: 999,
        amount: 25,
        splitMode: "EQUAL",
        participantIds: [1, 2],
        sendNotification: true,
      })
    );
  });
});
