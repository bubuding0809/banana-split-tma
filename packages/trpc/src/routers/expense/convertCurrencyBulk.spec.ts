import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "decimal.js";
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
    findMany: vi.fn(),
    update: vi.fn(),
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
    (mockTx.debtTransfer.findMany as any).mockResolvedValue([]);
    (mockTx.debtTransfer.update as any).mockResolvedValue({});
  });

  it("reads only the converting chat's legs, keyed off chat 1 alone", async () => {
    await convertCurrencyBulkHandler(
      baseInput,
      mockDb,
      mockTeleBot as never,
      silentLog
    );

    const findManyCalls = (mockTx.debtTransfer.findMany as any).mock.calls.map(
      (c: any[]) => c[0]
    );

    // One lookup for legs where chat 1 is the source, one where it is the target.
    expect(findManyCalls).toHaveLength(2);
    expect(findManyCalls[0].where).toEqual({
      sourceChatId: 1,
      sourceCurrency: "AUD",
    });
    expect(findManyCalls[1].where).toEqual({
      targetChatId: 1,
      targetCurrency: "AUD",
    });

    // Neither predicate can reach the counterpart group's leg.
    for (const call of findManyCalls) {
      expect(JSON.stringify(call.where)).not.toContain("2");
    }
  });

  it("writes each leg with Decimal-multiplied amounts, never touching the counterpart's fields", async () => {
    (mockTx.debtTransfer.findMany as any)
      .mockResolvedValueOnce([
        { id: "source-leg-1", sourceAmount: new Decimal(50) },
      ])
      .mockResolvedValueOnce([
        { id: "target-leg-1", targetAmount: new Decimal(50) },
      ]);

    await convertCurrencyBulkHandler(
      baseInput,
      mockDb,
      mockTeleBot as never,
      silentLog
    );

    const updateCalls = (mockTx.debtTransfer.update as any).mock.calls.map(
      (c: any[]) => c[0]
    );
    expect(updateCalls).toHaveLength(2);

    // Source leg: only source fields are written, multiplied via Decimal
    // (50 * 0.88 = 44), and the target fields are never part of the payload.
    const sourceCall = updateCalls[0];
    expect(sourceCall.where).toEqual({ id: "source-leg-1" });
    expect(sourceCall.data.sourceAmount).toBeInstanceOf(Decimal);
    expect((sourceCall.data.sourceAmount as Decimal).toNumber()).toBe(44);
    expect(sourceCall.data.sourceCurrency).toBe("SGD");
    expect(sourceCall.data).not.toHaveProperty("targetAmount");
    expect(sourceCall.data).not.toHaveProperty("targetCurrency");

    // Target leg: only target fields are written, and the source fields
    // are never part of the payload. A regression that swaps the two
    // payloads (source predicate writing target data or vice versa) fails
    // this assertion even though the `where` predicates stay correct.
    const targetCall = updateCalls[1];
    expect(targetCall.where).toEqual({ id: "target-leg-1" });
    expect(targetCall.data.targetAmount).toBeInstanceOf(Decimal);
    expect((targetCall.data.targetAmount as Decimal).toNumber()).toBe(44);
    expect(targetCall.data.targetCurrency).toBe("SGD");
    expect(targetCall.data).not.toHaveProperty("sourceAmount");
    expect(targetCall.data).not.toHaveProperty("sourceCurrency");
  });

  it("reports how many transfer legs it converted", async () => {
    (mockTx.debtTransfer.findMany as any)
      .mockResolvedValueOnce([
        { id: "s1", sourceAmount: new Decimal(10) },
        { id: "s2", sourceAmount: new Decimal(20) },
      ]) // source legs
      .mockResolvedValueOnce([{ id: "t1", targetAmount: new Decimal(30) }]); // target legs

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
