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

  it("queries the SGT-local month window for a chat with no timezone set", async () => {
    // timezone null/undefined defaults to Asia/Singapore (UTC+8):
    // 2026-04 local === [2026-03-31T16:00Z, 2026-04-30T16:00Z)
    (mockDb.chat.findMany as any).mockResolvedValue([
      { id: 1n, title: "A", timezone: null },
    ]);
    (mockDb.expenseShare.findMany as any).mockResolvedValue([]);

    await getMySpendByMonthHandler(caller, "2026-04", mockDb);

    const call = (mockDb.expenseShare.findMany as any).mock.calls[0][0];
    expect(call.where.expense.date.gte.toISOString()).toBe(
      "2026-03-31T16:00:00.000Z"
    );
    expect(call.where.expense.date.lt.toISOString()).toBe(
      "2026-04-30T16:00:00.000Z"
    );
    expect(call.where.userId).toBe(BigInt(caller));
  });

  it("queries each chat's own local month window per its timezone", async () => {
    (mockDb.chat.findMany as any).mockResolvedValue([
      { id: 1n, title: "Singapore", timezone: "Asia/Singapore" },
      { id: 2n, title: "NewYork", timezone: "America/New_York" },
    ]);
    // Return shares scoped to whichever chatIds each call asks for, so the
    // per-timezone windows are exercised independently.
    (mockDb.expenseShare.findMany as any).mockImplementation((arg: any) => {
      const ids: bigint[] = arg.where.expense.chatId.in;
      if (ids.some((i) => i === 1n))
        return Promise.resolve([
          { amount: d(10), expense: { chatId: 1n, currency: "SGD" } },
        ]);
      return Promise.resolve([
        { amount: d(20), expense: { chatId: 2n, currency: "USD" } },
      ]);
    });

    const result = await getMySpendByMonthHandler(caller, "2026-06", mockDb);

    const calls = (mockDb.expenseShare.findMany as any).mock.calls.map(
      (c: any[]) => c[0]
    );
    const byChat = (id: bigint) =>
      calls.find((c: any) =>
        c.where.expense.chatId.in.some((i: bigint) => i === id)
      );

    // SGT chat: 2026-06 local === [2026-05-31T16:00Z, 2026-06-30T16:00Z)
    const sg = byChat(1n);
    expect(sg.where.expense.date.gte.toISOString()).toBe(
      "2026-05-31T16:00:00.000Z"
    );
    expect(sg.where.expense.date.lt.toISOString()).toBe(
      "2026-06-30T16:00:00.000Z"
    );

    // NY chat (EDT, UTC-4): 2026-06 local === [2026-06-01T04:00Z, 2026-07-01T04:00Z)
    const ny = byChat(2n);
    expect(ny.where.expense.date.gte.toISOString()).toBe(
      "2026-06-01T04:00:00.000Z"
    );
    expect(ny.where.expense.date.lt.toISOString()).toBe(
      "2026-07-01T04:00:00.000Z"
    );

    // Shares from both windows merge into the result.
    expect(result.chats).toEqual([
      {
        chatId: 2,
        chatTitle: "NewYork",
        spend: [{ currency: "USD", amount: 20 }],
      },
      {
        chatId: 1,
        chatTitle: "Singapore",
        spend: [{ currency: "SGD", amount: 10 }],
      },
    ]);
    expect(result.totals).toEqual([
      { currency: "SGD", amount: 10 },
      { currency: "USD", amount: 20 },
    ]);
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
