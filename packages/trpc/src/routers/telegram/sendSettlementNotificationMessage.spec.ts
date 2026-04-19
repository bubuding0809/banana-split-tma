import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendSettlementNotificationMessageHandler } from "./sendSettlementNotificationMessage.js";
import type { PrismaClient } from "@dko/database";

const mockDb = {
  chat: {
    findUnique: vi.fn(),
  },
} as unknown as PrismaClient;

const mockTeleBot = {
  sendMessage: vi.fn(),
};

const baseInput = {
  chatId: 42,
  creditorUserId: 1,
  creditorName: "Alice",
  debtorName: "Bob",
  amount: 10,
  currency: "SGD",
};

describe("sendSettlementNotificationMessage gating", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockTeleBot.sendMessage.mockResolvedValue({ message_id: 77 });
  });

  it("returns null when chat.notifyOnSettlement is false and force is false", async () => {
    (mockDb.chat.findUnique as any).mockResolvedValue({
      notifyOnSettlement: false,
    });

    const result = await sendSettlementNotificationMessageHandler(
      { ...baseInput, force: false },
      mockDb,
      mockTeleBot as any
    );

    expect(result).toBeNull();
    expect(mockTeleBot.sendMessage).not.toHaveBeenCalled();
  });

  it("sends when chat.notifyOnSettlement is true", async () => {
    (mockDb.chat.findUnique as any).mockResolvedValue({
      notifyOnSettlement: true,
    });

    const result = await sendSettlementNotificationMessageHandler(
      { ...baseInput, force: false },
      mockDb,
      mockTeleBot as any
    );

    expect(result).toBe(77);
    expect(mockTeleBot.sendMessage).toHaveBeenCalledOnce();
  });

  it("bypasses the pref check when force is true", async () => {
    const result = await sendSettlementNotificationMessageHandler(
      { ...baseInput, force: true },
      mockDb,
      mockTeleBot as any
    );

    expect(result).toBe(77);
    expect(mockDb.chat.findUnique).not.toHaveBeenCalled();
    expect(mockTeleBot.sendMessage).toHaveBeenCalledOnce();
  });
});
