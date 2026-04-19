import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendExpenseNotificationMessageHandler } from "./sendExpenseNotificationMessage.js";
import type { PrismaClient } from "@dko/database";

const mockDb = {
  chat: {
    findUnique: vi.fn(),
  },
} as unknown as PrismaClient;

const mockTeleBot = {
  sendMessage: vi.fn(),
  getMe: vi.fn(),
};

const baseInput = {
  chatId: 42,
  chatType: "group",
  payerId: 1,
  payerName: "Alice",
  creatorUserId: 1,
  creatorName: "Alice",
  expenseDescription: "Lunch",
  totalAmount: 20,
  participants: [
    { userId: 1, name: "Alice", amount: 10 },
    { userId: 2, name: "Bob", amount: 10 },
  ],
  currency: "SGD",
};

describe("sendExpenseNotificationMessage gating", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockTeleBot.getMe.mockResolvedValue({ username: "testbot" });
    mockTeleBot.sendMessage.mockResolvedValue({ message_id: 99 });
  });

  it("returns null when chat.notifyOnExpense is false and force is false", async () => {
    (mockDb.chat.findUnique as any).mockResolvedValue({
      notifyOnExpense: false,
    });

    const result = await sendExpenseNotificationMessageHandler(
      { ...baseInput, force: false },
      mockDb,
      mockTeleBot as any
    );

    expect(result).toBeNull();
    expect(mockTeleBot.sendMessage).not.toHaveBeenCalled();
  });

  it("sends when chat.notifyOnExpense is true", async () => {
    (mockDb.chat.findUnique as any).mockResolvedValue({
      notifyOnExpense: true,
    });

    const result = await sendExpenseNotificationMessageHandler(
      { ...baseInput, force: false },
      mockDb,
      mockTeleBot as any
    );

    expect(result).toBe(99);
    expect(mockTeleBot.sendMessage).toHaveBeenCalledOnce();
  });

  it("bypasses the pref check when force is true", async () => {
    const result = await sendExpenseNotificationMessageHandler(
      { ...baseInput, force: true },
      mockDb,
      mockTeleBot as any
    );

    expect(result).toBe(99);
    expect(mockDb.chat.findUnique).not.toHaveBeenCalled();
    expect(mockTeleBot.sendMessage).toHaveBeenCalledOnce();
  });
});
