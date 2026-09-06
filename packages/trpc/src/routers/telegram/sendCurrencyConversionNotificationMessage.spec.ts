import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendCurrencyConversionNotificationMessageHandler } from "./sendCurrencyConversionNotificationMessage.js";
import type { PrismaClient } from "@dko/database";

const mockDb = {
  chat: { findUnique: vi.fn() },
} as unknown as PrismaClient;

const mockTeleBot = { sendMessage: vi.fn() };

const baseInput = {
  chatId: 100,
  actorUserId: 1,
  actorName: "Ruoqian",
  actorUsername: "bubuding0809",
  fromCurrency: "AUD",
  toCurrency: "SGD",
  rate: 0.88,
  convertedExpenses: 0,
  convertedSettlements: 0,
  convertedTransfers: 0,
  force: false,
};

describe("sendCurrencyConversionNotificationMessage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockTeleBot.sendMessage.mockResolvedValue({ message_id: 42 });
    (mockDb.chat.findUnique as any).mockResolvedValue({ type: "group" });
  });

  it("returns null and sends nothing when everything is zero and not forced", async () => {
    const result = await sendCurrencyConversionNotificationMessageHandler(
      { ...baseInput },
      mockDb,
      mockTeleBot as never
    );

    expect(result).toBeNull();
    expect(mockTeleBot.sendMessage).not.toHaveBeenCalled();
  });

  it("reports only transfers when a transfers-only conversion fires — no phantom '0 expenses, 0 settlements'", async () => {
    const result = await sendCurrencyConversionNotificationMessageHandler(
      {
        ...baseInput,
        convertedExpenses: 0,
        convertedSettlements: 0,
        convertedTransfers: 2,
      },
      mockDb,
      mockTeleBot as never
    );

    expect(result).toBe(42);
    const message = mockTeleBot.sendMessage.mock.calls[0]![1] as string;
    expect(message).toContain("2 transfers");
    expect(message).not.toContain("expense");
    expect(message).not.toContain("settlement");
  });

  it("reports a single transfer with singular pluralisation", async () => {
    const result = await sendCurrencyConversionNotificationMessageHandler(
      {
        ...baseInput,
        convertedExpenses: 0,
        convertedSettlements: 0,
        convertedTransfers: 1,
      },
      mockDb,
      mockTeleBot as never
    );

    expect(result).toBe(42);
    const message = mockTeleBot.sendMessage.mock.calls[0]![1] as string;
    expect(message).toContain("1 transfer");
    expect(message).not.toContain("1 transfers");
  });

  it("reports a mixed conversion across expenses, settlements and transfers", async () => {
    const result = await sendCurrencyConversionNotificationMessageHandler(
      {
        ...baseInput,
        convertedExpenses: 3,
        convertedSettlements: 1,
        convertedTransfers: 2,
      },
      mockDb,
      mockTeleBot as never
    );

    expect(result).toBe(42);
    const message = mockTeleBot.sendMessage.mock.calls[0]![1] as string;
    expect(message).toContain("3 expenses");
    expect(message).toContain("1 settlement");
    expect(message).not.toContain("1 settlements");
    expect(message).toContain("2 transfers");
  });

  it("omits the zero segment from a mixed conversion (expenses + transfers, no settlements)", async () => {
    const result = await sendCurrencyConversionNotificationMessageHandler(
      {
        ...baseInput,
        convertedExpenses: 5,
        convertedSettlements: 0,
        convertedTransfers: 1,
      },
      mockDb,
      mockTeleBot as never
    );

    expect(result).toBe(42);
    const message = mockTeleBot.sendMessage.mock.calls[0]![1] as string;
    expect(message).toContain("5 expenses");
    expect(message).not.toContain("settlement");
    expect(message).toContain("1 transfer");
  });

  it("returns null for private chats even when forced amounts are non-zero", async () => {
    (mockDb.chat.findUnique as any).mockResolvedValue({ type: "private" });

    const result = await sendCurrencyConversionNotificationMessageHandler(
      { ...baseInput, convertedExpenses: 2, force: true },
      mockDb,
      mockTeleBot as never
    );

    expect(result).toBeNull();
    expect(mockTeleBot.sendMessage).not.toHaveBeenCalled();
  });

  it("still sends a sensible message when forced with nothing converted", async () => {
    const result = await sendCurrencyConversionNotificationMessageHandler(
      { ...baseInput, force: true },
      mockDb,
      mockTeleBot as never
    );

    expect(result).toBe(42);
    const message = mockTeleBot.sendMessage.mock.calls[0]![1] as string;
    expect(message).toContain("nothing converted");
  });
});
