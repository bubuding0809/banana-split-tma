import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendTransferNotificationMessageHandler } from "./sendTransferNotificationMessage.js";
import type { PrismaClient } from "@dko/database";

const mockDb = {
  chat: { findUnique: vi.fn() },
} as unknown as PrismaClient;

const mockTeleBot = { sendMessage: vi.fn() };

const baseInput = {
  chatId: 100,
  direction: "out" as const,
  debtorId: 2,
  debtorName: "Sean",
  creditorId: 1,
  creditorName: "Ruoqian",
  amount: 71.79,
  currency: "SGD",
  counterpartChatTitle: "LADS 2026",
};

describe("sendTransferNotificationMessage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockTeleBot.sendMessage.mockResolvedValue({ message_id: 99 });
  });

  it("returns null when chat.notifyOnTransfer is false and not forced", async () => {
    (mockDb.chat.findUnique as any).mockResolvedValue({
      notifyOnTransfer: false,
    });

    const result = await sendTransferNotificationMessageHandler(
      { ...baseInput, force: false },
      mockDb,
      mockTeleBot as never
    );

    expect(result).toBeNull();
    expect(mockTeleBot.sendMessage).not.toHaveBeenCalled();
  });

  it("posts a 'transferred out' message naming the target group", async () => {
    (mockDb.chat.findUnique as any).mockResolvedValue({
      notifyOnTransfer: true,
    });

    const result = await sendTransferNotificationMessageHandler(
      { ...baseInput, force: false },
      mockDb,
      mockTeleBot as never
    );

    expect(result).toBe(99);
    const [chatId, message, opts] = mockTeleBot.sendMessage.mock.calls[0]!;
    expect(chatId).toBe(100);
    expect(message).toContain("transferred out");
    expect(message).toContain("moved to");
    expect(message).toContain("LADS 2026");
    expect(opts.parse_mode).toBe("MarkdownV2");
  });

  it("posts a 'transferred in' message naming the source group", async () => {
    (mockDb.chat.findUnique as any).mockResolvedValue({
      notifyOnTransfer: true,
    });

    await sendTransferNotificationMessageHandler(
      {
        ...baseInput,
        direction: "in",
        counterpartChatTitle: "Ho Chi Minh 2026",
        force: false,
      },
      mockDb,
      mockTeleBot as never
    );

    const message = mockTeleBot.sendMessage.mock.calls[0]![1];
    expect(message).toContain("transferred in");
    expect(message).toContain("moved from");
    expect(message).toContain("Ho Chi Minh 2026");
  });

  it("bypasses the pref check when force is true", async () => {
    (mockDb.chat.findUnique as any).mockResolvedValue({
      notifyOnTransfer: false,
    });

    const result = await sendTransferNotificationMessageHandler(
      { ...baseInput, force: true },
      mockDb,
      mockTeleBot as never
    );

    expect(result).toBe(99);
    expect(mockTeleBot.sendMessage).toHaveBeenCalledOnce();
  });
});
