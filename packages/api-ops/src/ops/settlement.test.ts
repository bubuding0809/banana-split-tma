import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiValidationError } from "../errors.js";
import {
  createSettlement,
  deleteSettlement,
  listSettlements,
  settleAllDebts,
  validateCreateSettlementInput,
  validateSettleAllDebtsInput,
} from "./settlement.js";

vi.mock("@bananasplitz/api-client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@bananasplitz/api-client")>();
  return {
    ...actual,
    resolveChatId: vi.fn(async (_trpc, chatId?: string) => {
      if (chatId) return Number(chatId);
      return 12345;
    }),
  };
});

describe("settlement ops", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listSettlements calls trpc.settlement.getSettlementByChat", async () => {
    const queryMock = vi.fn().mockResolvedValue([]);
    const trpc = {
      settlement: { getSettlementByChat: { query: queryMock } },
    } as never;

    await listSettlements(trpc, { chatId: "111", currency: "USD" });

    expect(queryMock).toHaveBeenCalledWith({ chatId: 111, currency: "USD" });
  });

  it("validateCreateSettlementInput throws for missing fields", () => {
    expect(() => validateCreateSettlementInput({})).toThrow(ApiValidationError);
    expect(() => validateCreateSettlementInput({ senderId: "1" })).toThrow(
      ApiValidationError
    );
    expect(() =>
      validateCreateSettlementInput({ senderId: "1", receiverId: "2" })
    ).toThrow(ApiValidationError);
  });

  it("createSettlement calls trpc.settlement.createSettlement", async () => {
    const mutateMock = vi.fn().mockResolvedValue({ id: "new-settlement" });
    const chatQueryMock = vi.fn().mockResolvedValue({
      id: 12345,
      threadId: 999,
      members: [
        { id: 1, firstName: "Alice", username: "alice" },
        { id: 2, firstName: "Bob", username: "bob" },
      ],
    });
    const trpc = {
      chat: { getChat: { query: chatQueryMock } },
      settlement: { createSettlement: { mutate: mutateMock } },
    } as never;

    await createSettlement(trpc, {
      senderId: 1,
      receiverId: 2,
      amount: 50,
      currency: "USD",
      description: "Thanks!",
    });

    expect(mutateMock).toHaveBeenCalledWith({
      chatId: 12345,
      senderId: 1,
      receiverId: 2,
      amount: 50,
      currency: "USD",
      description: "Thanks!",
      sendNotification: true,
      creditorName: "Bob",
      creditorUsername: "bob",
      debtorName: "Alice",
      threadId: 999,
    });
  });

  it("deleteSettlement calls trpc.settlement.deleteSettlement", async () => {
    const mutateMock = vi.fn().mockResolvedValue({ message: "Deleted" });
    const trpc = {
      settlement: { deleteSettlement: { mutate: mutateMock } },
    } as never;

    await deleteSettlement(trpc, { settlementId: "set-123" });
    expect(mutateMock).toHaveBeenCalledWith({ settlementId: "set-123" });
  });

  it("validateSettleAllDebtsInput throws for missing balances", () => {
    expect(() =>
      validateSettleAllDebtsInput({ senderId: "1", receiverId: "2" })
    ).toThrow(ApiValidationError);
  });

  it("settleAllDebts calls trpc.settlement.settleAllDebts", async () => {
    const chatQueryMock = vi.fn().mockResolvedValue({
      id: 123,
      threadId: 555,
      members: [
        { id: 1, firstName: "Alice", username: "alice" },
        { id: 2, firstName: "Bob", username: "bob" },
      ],
    });
    const mutateMock = vi.fn().mockResolvedValue({ totalSettlements: 1 });
    const trpc = {
      chat: { getChat: { query: chatQueryMock } },
      settlement: { settleAllDebts: { mutate: mutateMock } },
    } as never;

    await settleAllDebts(trpc, {
      chatId: "123",
      senderId: 1,
      receiverId: 2,
      balances: [{ currency: "USD", amount: 15 }],
    });

    expect(mutateMock).toHaveBeenCalledWith({
      chatId: 123,
      senderId: 1,
      receiverId: 2,
      balances: [{ currency: "USD", amount: 15 }],
      creditorName: "Bob",
      creditorUsername: "bob",
      debtorName: "Alice",
      threadId: 555,
    });
  });
});
