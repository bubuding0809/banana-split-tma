import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSettlementHandler, inputSchema } from "./createSettlement.js";

const notify = vi.fn();
vi.mock("../telegram/sendSettlementNotificationMessage.js", () => ({
  sendSettlementNotificationMessageHandler: (...args: unknown[]) =>
    notify(...args),
}));
vi.mock("../../utils/chatValidation.js", () => ({
  assertUsersInChat: vi.fn(async () => undefined),
}));

const SETTLEMENT_ID = "123e4567-e89b-12d3-a456-426614174000";
const mockDb = {
  chat: { findUnique: vi.fn() },
  settlement: {
    create: vi.fn(),
    update: vi.fn(),
  },
} as any;

const parse = (over: Record<string, unknown> = {}) =>
  inputSchema.parse({
    chatId: -100,
    senderId: 1, // payer / debtor
    receiverId: 2, // receiver / creditor
    amount: 20,
    currency: "SGD",
    sendNotification: true,
    creditorName: "Bob",
    debtorName: "Alice",
    ...over,
  });

describe("createSettlementHandler notifications", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockDb.settlement.create.mockResolvedValue({
      id: SETTLEMENT_ID,
      chatId: -100n,
      senderId: 1n,
      receiverId: 2n,
      amount: 20,
      currency: "SGD",
      description: null,
      date: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    notify.mockResolvedValue(555);
  });

  it("defaults to settle_up and passes the settlement id", async () => {
    await createSettlementHandler(parse(), mockDb, {} as any);
    expect(notify).toHaveBeenCalledOnce();
    expect(notify.mock.calls[0]![0]).toMatchObject({
      kind: "settle_up",
      settlementId: SETTLEMENT_ID,
      creditorUserId: 2,
      debtorUserId: 1,
      mentionTarget: "creditor",
    });
    expect(mockDb.settlement.update).toHaveBeenCalledWith({
      where: { id: SETTLEMENT_ID },
      data: { telegramMessageId: 555n },
    });
  });

  it("payment recorded by the payer tags the receiver (creditor)", async () => {
    await createSettlementHandler(
      parse({ notificationKind: "payment" }),
      mockDb,
      {} as any,
      undefined,
      1
    );
    expect(notify.mock.calls[0]![0]).toMatchObject({
      kind: "payment",
      mentionTarget: "creditor",
    });
  });

  it("payment recorded by the receiver tags the payer (debtor)", async () => {
    await createSettlementHandler(
      parse({ notificationKind: "payment" }),
      mockDb,
      {} as any,
      undefined,
      2
    );
    expect(notify.mock.calls[0]![0]).toMatchObject({
      kind: "payment",
      mentionTarget: "debtor",
    });
  });

  it("payment with no caller (API key) tags the receiver", async () => {
    await createSettlementHandler(
      parse({ notificationKind: "payment" }),
      mockDb,
      {} as any
    );
    expect(notify.mock.calls[0]![0]).toMatchObject({
      kind: "payment",
      mentionTarget: "creditor",
    });
  });

  it("does not notify when sendNotification is false", async () => {
    await createSettlementHandler(
      parse({ sendNotification: false }),
      mockDb,
      {} as any
    );
    expect(notify).not.toHaveBeenCalled();
  });

  it("stores the provided transaction date", async () => {
    const date = new Date("2026-09-20T00:00:00Z");
    await createSettlementHandler(parse({ date }), mockDb, {} as any);
    expect(mockDb.settlement.create.mock.calls[0]![0].data.date).toEqual(date);
  });

  it("omits date from settlement.create data when not provided", async () => {
    await createSettlementHandler(parse(), mockDb, {} as any);
    expect(mockDb.settlement.create.mock.calls[0]![0].data).not.toHaveProperty(
      "date"
    );
  });

  it("does not forward description on settle_up (existing callers unchanged)", async () => {
    await createSettlementHandler(
      parse({ description: "dinner split" }),
      mockDb,
      {} as any
    );
    expect(notify.mock.calls[0]![0]).toMatchObject({
      kind: "settle_up",
      description: undefined,
    });
  });

  it("forwards description on payment", async () => {
    await createSettlementHandler(
      parse({ notificationKind: "payment", description: "coffee" }),
      mockDb,
      {} as any
    );
    expect(notify.mock.calls[0]![0]).toMatchObject({
      kind: "payment",
      description: "coffee",
    });
  });
});
