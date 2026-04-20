import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@dko/database";
import { Decimal } from "decimal.js";
import { getMySpendByMonthHandler } from "./getMySpendByMonth.js";

const mockDb = {
  chat: { findMany: vi.fn() },
  expenseShare: { findMany: vi.fn() },
} as unknown as PrismaClient;

const caller = 100;
const d = (n: number) => new Decimal(n);

describe("getMySpendByMonthHandler", () => {
  beforeEach(() => vi.resetAllMocks());

  it("rejects malformed month", async () => {
    await expect(
      getMySpendByMonthHandler(caller, "2026-13", mockDb)
    ).rejects.toThrow();
  });

  it("returns empty chats and totals when caller has no shares that month", async () => {
    (mockDb.chat.findMany as any).mockResolvedValue([
      { id: 1n, title: "Alpha" },
    ]);
    (mockDb.expenseShare.findMany as any).mockResolvedValue([]);

    const result = await getMySpendByMonthHandler(caller, "2026-04", mockDb);
    expect(result).toEqual({
      month: "2026-04",
      chats: [],
      totals: [],
    });
  });

  it("sums caller's shares per chat and currency", async () => {
    (mockDb.chat.findMany as any).mockResolvedValue([
      { id: 1n, title: "Alpha" },
      { id: 2n, title: "Beta" },
    ]);
    (mockDb.expenseShare.findMany as any).mockResolvedValue([
      { amount: d(10), expense: { chatId: 1n, currency: "SGD" } },
      { amount: d(5), expense: { chatId: 1n, currency: "SGD" } },
      { amount: d(7), expense: { chatId: 1n, currency: "USD" } },
      { amount: d(3), expense: { chatId: 2n, currency: "SGD" } },
    ]);

    const result = await getMySpendByMonthHandler(caller, "2026-04", mockDb);

    expect(result.month).toBe("2026-04");
    expect(result.chats).toEqual([
      {
        chatId: 1,
        chatTitle: "Alpha",
        spend: [
          { currency: "SGD", amount: 15 },
          { currency: "USD", amount: 7 },
        ],
      },
      {
        chatId: 2,
        chatTitle: "Beta",
        spend: [{ currency: "SGD", amount: 3 }],
      },
    ]);
    expect(result.totals).toEqual([
      { currency: "SGD", amount: 18 },
      { currency: "USD", amount: 7 },
    ]);
  });

  it("queries the correct UTC month window", async () => {
    (mockDb.chat.findMany as any).mockResolvedValue([{ id: 1n, title: "A" }]);
    (mockDb.expenseShare.findMany as any).mockResolvedValue([]);

    await getMySpendByMonthHandler(caller, "2026-04", mockDb);

    const call = (mockDb.expenseShare.findMany as any).mock.calls[0][0];
    expect(call.where.expense.date.gte.toISOString()).toBe(
      "2026-04-01T00:00:00.000Z"
    );
    expect(call.where.expense.date.lt.toISOString()).toBe(
      "2026-05-01T00:00:00.000Z"
    );
    expect(call.where.userId).toBe(BigInt(caller));
  });

  it("omits chats with zero shares from output even when they exist", async () => {
    (mockDb.chat.findMany as any).mockResolvedValue([
      { id: 1n, title: "Alpha" },
      { id: 2n, title: "Beta" }, // no shares → should be omitted
    ]);
    (mockDb.expenseShare.findMany as any).mockResolvedValue([
      { amount: d(10), expense: { chatId: 1n, currency: "SGD" } },
    ]);

    const result = await getMySpendByMonthHandler(caller, "2026-04", mockDb);
    expect(result.chats.map((c) => c.chatId)).toEqual([1]);
  });
});
