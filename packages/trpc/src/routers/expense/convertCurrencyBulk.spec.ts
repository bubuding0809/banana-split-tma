import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@dko/database";
import { convertCurrencyBulkHandler } from "./convertCurrencyBulk.js";

// getCurrentRateHandler does its own DB/network dance (cache lookups, cross
// rate calculation, auto-refresh). Stubbing it keeps this spec focused on
// what convertCurrencyBulkHandler does with a known rate.
vi.mock("../currency/getCurrentRate.js", () => ({
  getCurrentRateHandler: vi.fn().mockResolvedValue({
    baseCurrency: "AUD",
    targetCurrency: "SGD",
    rate: 0.88,
    lastUpdated: new Date("2026-09-07T00:00:00Z"),
  }),
}));

const mockTx = {
  expense: { update: vi.fn() },
  expenseShare: { update: vi.fn() },
  settlement: { update: vi.fn() },
  debtTransfer: {
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
};

const mockDb = {
  chat: { findFirst: vi.fn() },
  expense: { findMany: vi.fn() },
  settlement: { findMany: vi.fn() },
  $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(mockTx)),
} as unknown as PrismaClient;

const mockTeleBot = { sendMessage: vi.fn() };

const silentLog = {
  error: () => {},
  info: () => {},
  warn: () => {},
  debug: () => {},
} as never;

const baseInput = {
  chatId: 1,
  fromCurrency: "AUD",
  toCurrency: "SGD",
  userId: 100,
  sendNotification: false,
};

describe("convertCurrencyBulkHandler transfers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockDb.chat.findFirst as any).mockResolvedValue({ id: 1n });
    (mockDb.expense.findMany as any).mockResolvedValue([]);
    (mockDb.settlement.findMany as any).mockResolvedValue([]);
    (mockDb.$transaction as any).mockImplementation(
      async (fn: (tx: unknown) => unknown) => fn(mockTx)
    );
    (mockTx.debtTransfer.updateMany as any).mockResolvedValue({ count: 0 });
  });

  it("converts only the converting chat's leg", async () => {
    await convertCurrencyBulkHandler(
      baseInput,
      mockDb,
      mockTeleBot as never,
      silentLog
    );

    const calls = (mockTx.debtTransfer.updateMany as any).mock.calls.map(
      (c: any[]) => c[0]
    );

    // One update for legs where chat 1 is the source, one where it is the target.
    expect(calls).toHaveLength(2);
    expect(calls[0].where).toEqual({ sourceChatId: 1, sourceCurrency: "AUD" });
    expect(calls[1].where).toEqual({ targetChatId: 1, targetCurrency: "AUD" });

    // Neither predicate can reach the counterpart group's leg.
    for (const call of calls) {
      expect(JSON.stringify(call.where)).not.toContain("2");
    }
  });

  it("reports how many transfer legs it converted", async () => {
    (mockTx.debtTransfer.updateMany as any)
      .mockResolvedValueOnce({ count: 2 }) // source legs
      .mockResolvedValueOnce({ count: 1 }); // target legs

    const result = await convertCurrencyBulkHandler(
      baseInput,
      mockDb,
      mockTeleBot as never,
      silentLog
    );
    expect(result.convertedTransfers).toBe(3);
  });

  it("returns convertedTransfers: 0 on the same-currency early return", async () => {
    const result = await convertCurrencyBulkHandler(
      { ...baseInput, toCurrency: "AUD" },
      mockDb,
      mockTeleBot as never,
      silentLog
    );

    expect(result.convertedTransfers).toBe(0);
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });
});
