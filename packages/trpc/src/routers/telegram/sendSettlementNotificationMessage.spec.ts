import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendSettlementNotificationMessageHandler } from "./sendSettlementNotificationMessage.js";
import { decodeV1DeepLink } from "../../utils/deepLinkProtocol.js";
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

describe("sendSettlementNotificationMessage copy + button", () => {
  const SETTLEMENT_ID = "123e4567-e89b-12d3-a456-426614174000";

  beforeEach(() => {
    vi.resetAllMocks();
    mockTeleBot.sendMessage.mockResolvedValue({ message_id: 77 });
    mockTeleBot.getMe.mockResolvedValue({ username: "testbot" });
  });

  const sentText = () => mockTeleBot.sendMessage.mock.calls[0]![1] as string;
  const sentOpts = () => mockTeleBot.sendMessage.mock.calls[0]![2] as any;

  it("settle_up keeps the Great news text", async () => {
    await sendSettlementNotificationMessageHandler(
      { ...baseInput, chatId: -100, force: true },
      mockDb,
      mockTeleBot as any
    );
    expect(sentText()).toContain("✅ Great news");
    expect(sentText()).toContain("Bob has settled their debt of");
  });

  it("payment tags the creditor by default: '💸 Bob paid @Alice'", async () => {
    await sendSettlementNotificationMessageHandler(
      {
        ...baseInput,
        chatId: -100,
        force: true,
        kind: "payment",
        debtorUserId: 2,
        description: "Concert tickets",
      },
      mockDb,
      mockTeleBot as any
    );
    const text = sentText();
    // Intl.NumberFormat returns SGD with a non-breaking space (U+00A0), not regular space
    expect(text.startsWith("💸 Bob paid [Alice](tg://user?id=1)")).toBe(true);
    // Check for the currency format - use non-breaking space in the search
    expect(text).toContain("SGD 10\\.00");
    expect(text).toContain("\\(Concert tickets\\)");
    expect(text).not.toContain("Great news");
  });

  it("payment with mentionTarget=debtor tags the payer: '💸 @Bob paid Alice'", async () => {
    await sendSettlementNotificationMessageHandler(
      {
        ...baseInput,
        chatId: -100,
        force: true,
        kind: "payment",
        debtorUserId: 2,
        mentionTarget: "debtor",
      },
      mockDb,
      mockTeleBot as any
    );
    expect(sentText().startsWith("💸 [Bob](tg://user?id=2) paid Alice ")).toBe(
      true
    );
  });

  it("adds a View payment button that deep links to the settlement", async () => {
    await sendSettlementNotificationMessageHandler(
      { ...baseInput, chatId: -100, force: true, settlementId: SETTLEMENT_ID },
      mockDb,
      mockTeleBot as any
    );
    const button = sentOpts().reply_markup.inline_keyboard[0][0];
    expect(button.text).toBe("View payment");
    const payload = new URL(button.url).searchParams.get("startapp")!;
    expect(decodeV1DeepLink(payload)).toMatchObject({
      chat_type: "g",
      entity_type: "st",
      entity_id: SETTLEMENT_ID,
    });
  });

  it("uses chat type 'p' for a positive (private) chat id", async () => {
    await sendSettlementNotificationMessageHandler(
      { ...baseInput, chatId: 555, force: true, settlementId: SETTLEMENT_ID },
      mockDb,
      mockTeleBot as any
    );
    const url = sentOpts().reply_markup.inline_keyboard[0][0].url as string;
    const payload = new URL(url).searchParams.get("startapp")!;
    expect(decodeV1DeepLink(payload)?.chat_type).toBe("p");
  });

  it("sends no keyboard when settlementId is absent", async () => {
    await sendSettlementNotificationMessageHandler(
      { ...baseInput, chatId: -100, force: true },
      mockDb,
      mockTeleBot as any
    );
    expect(sentOpts().reply_markup).toBeUndefined();
    expect(mockTeleBot.getMe).not.toHaveBeenCalled();
  });

  it("still sends the message without a keyboard when getMe rejects", async () => {
    mockTeleBot.getMe.mockRejectedValue(new Error("network down"));

    const result = await sendSettlementNotificationMessageHandler(
      { ...baseInput, chatId: -100, force: true, settlementId: SETTLEMENT_ID },
      mockDb,
      mockTeleBot as any
    );

    expect(result).toBe(77);
    expect(mockTeleBot.sendMessage).toHaveBeenCalledOnce();
    expect(sentOpts().reply_markup).toBeUndefined();
  });
});
