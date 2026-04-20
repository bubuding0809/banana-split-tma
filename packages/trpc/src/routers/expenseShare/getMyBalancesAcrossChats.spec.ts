import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@dko/database";
import { Decimal } from "decimal.js";
import { getMyBalancesAcrossChatsHandler } from "./getMyBalancesAcrossChats.js";

const mockDb = {
  chat: { findMany: vi.fn() },
  expenseShare: { findMany: vi.fn() },
  settlement: { findMany: vi.fn() },
  user: { findMany: vi.fn() },
} as unknown as PrismaClient;

const caller = 100;
const d = (n: number) => new Decimal(n);

function setupChats(
  chats: Array<{
    id: number;
    title: string;
    debtSimplificationEnabled: boolean;
    memberIds: number[];
  }>
) {
  (mockDb.chat.findMany as any).mockResolvedValue(
    chats.map((c) => ({
      id: BigInt(c.id),
      title: c.title,
      debtSimplificationEnabled: c.debtSimplificationEnabled,
      members: c.memberIds.map((id) => ({ id: BigInt(id) })),
    }))
  );
}

function setupShares(
  rows: Array<{
    chatId: number;
    payerId: number;
    userId: number;
    amount: number;
    currency: string;
  }>
) {
  (mockDb.expenseShare.findMany as any).mockResolvedValue(
    rows.map((r) => ({
      userId: BigInt(r.userId),
      amount: d(r.amount),
      expense: {
        chatId: BigInt(r.chatId),
        payerId: BigInt(r.payerId),
        currency: r.currency,
      },
    }))
  );
}

function setupSettlements(
  rows: Array<{
    chatId: number;
    senderId: number;
    receiverId: number;
    amount: number;
    currency: string;
  }> = []
) {
  (mockDb.settlement.findMany as any).mockResolvedValue(
    rows.map((r) => ({
      chatId: BigInt(r.chatId),
      senderId: BigInt(r.senderId),
      receiverId: BigInt(r.receiverId),
      amount: d(r.amount),
      currency: r.currency,
    }))
  );
}

function setupUsers(
  users: Array<{ id: number; firstName: string; lastName?: string | null }>
) {
  (mockDb.user.findMany as any).mockResolvedValue(
    users.map((u) => ({
      id: BigInt(u.id),
      firstName: u.firstName,
      lastName: u.lastName ?? null,
    }))
  );
}

describe("getMyBalancesAcrossChatsHandler", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns empty array when caller is square in every chat", async () => {
    setupChats([
      {
        id: 1,
        title: "Alpha",
        debtSimplificationEnabled: false,
        memberIds: [100, 200],
      },
    ]);
    setupShares([]);
    setupSettlements([]);
    setupUsers([]);

    const result = await getMyBalancesAcrossChatsHandler(caller, mockDb);
    expect(result.balances).toEqual([]);
  });

  it("excludes a chat where caller has zero net across all currencies", async () => {
    setupChats([
      {
        id: 1,
        title: "Alpha",
        debtSimplificationEnabled: false,
        memberIds: [100, 200],
      },
    ]);
    setupShares([
      // Caller paid 20, split equally; caller's share 10, other's share 10
      { chatId: 1, payerId: 100, userId: 100, amount: 10, currency: "SGD" },
      { chatId: 1, payerId: 100, userId: 200, amount: 10, currency: "SGD" },
      // Other paid 20, split equally
      { chatId: 1, payerId: 200, userId: 100, amount: 10, currency: "SGD" },
      { chatId: 1, payerId: 200, userId: 200, amount: 10, currency: "SGD" },
    ]);
    setupSettlements([]);
    setupUsers([{ id: 200, firstName: "Bob" }]);

    const result = await getMyBalancesAcrossChatsHandler(caller, mockDb);
    expect(result.balances).toEqual([]);
  });

  it("includes only currencies where caller has non-zero net within a chat", async () => {
    setupChats([
      {
        id: 1,
        title: "Alpha",
        debtSimplificationEnabled: false,
        memberIds: [100, 200],
      },
    ]);
    setupShares([
      // SGD: caller paid 20, split equally → caller +10, other -10
      { chatId: 1, payerId: 100, userId: 100, amount: 10, currency: "SGD" },
      { chatId: 1, payerId: 100, userId: 200, amount: 10, currency: "SGD" },
      // USD: each paid 10 for themselves only; caller net 0 USD
      { chatId: 1, payerId: 100, userId: 100, amount: 10, currency: "USD" },
      { chatId: 1, payerId: 200, userId: 200, amount: 10, currency: "USD" },
    ]);
    setupSettlements([]);
    setupUsers([{ id: 200, firstName: "Bob" }]);

    const result = await getMyBalancesAcrossChatsHandler(caller, mockDb);
    expect(result.balances).toHaveLength(1);
    expect(result.balances[0]!.currencies).toEqual([
      { currency: "SGD", net: 10 },
    ]);
  });

  it("returns raw pairwise counterparties when simplification is disabled", async () => {
    setupChats([
      {
        id: 1,
        title: "Alpha",
        debtSimplificationEnabled: false,
        memberIds: [100, 200, 300],
      },
    ]);
    // Caller paid 30, split equally → caller +20, 200 -10, 300 -10
    setupShares([
      { chatId: 1, payerId: 100, userId: 100, amount: 10, currency: "SGD" },
      { chatId: 1, payerId: 100, userId: 200, amount: 10, currency: "SGD" },
      { chatId: 1, payerId: 100, userId: 300, amount: 10, currency: "SGD" },
    ]);
    setupSettlements([]);
    setupUsers([
      { id: 200, firstName: "Bob" },
      { id: 300, firstName: "Carol", lastName: "Lim" },
    ]);

    const result = await getMyBalancesAcrossChatsHandler(caller, mockDb);
    const chat = result.balances[0]!;
    expect(chat.debtSimplificationEnabled).toBe(false);
    expect(chat.counterparties).toEqual(
      expect.arrayContaining([
        { userId: 200, name: "Bob", currency: "SGD", net: 10 },
        { userId: 300, name: "Carol Lim", currency: "SGD", net: 10 },
      ])
    );
    expect(chat.counterparties).toHaveLength(2);
  });

  it("returns simplified counterparties when simplification is enabled", async () => {
    setupChats([
      {
        id: 1,
        title: "Alpha",
        debtSimplificationEnabled: true,
        memberIds: [100, 200, 300],
      },
    ]);
    // Caller paid 30 for Bob & Carol; Bob paid 20 for Carol.
    // Net balances: caller +20, Bob 0, Carol -20.
    // Simplified: Carol owes caller 20; Bob drops out.
    setupShares([
      { chatId: 1, payerId: 100, userId: 200, amount: 10, currency: "SGD" },
      { chatId: 1, payerId: 100, userId: 300, amount: 10, currency: "SGD" },
      { chatId: 1, payerId: 100, userId: 100, amount: 10, currency: "SGD" },
      { chatId: 1, payerId: 200, userId: 300, amount: 10, currency: "SGD" },
      { chatId: 1, payerId: 200, userId: 200, amount: 10, currency: "SGD" },
    ]);
    setupSettlements([]);
    setupUsers([
      { id: 200, firstName: "Bob" },
      { id: 300, firstName: "Carol" },
    ]);

    const result = await getMyBalancesAcrossChatsHandler(caller, mockDb);
    const chat = result.balances[0]!;
    expect(chat.debtSimplificationEnabled).toBe(true);
    expect(chat.currencies).toEqual([{ currency: "SGD", net: 20 }]);
    expect(chat.counterparties).toEqual([
      { userId: 300, name: "Carol", currency: "SGD", net: 20 },
    ]);
  });

  it("factors settlements into net and counterparty computation", async () => {
    setupChats([
      {
        id: 1,
        title: "Alpha",
        debtSimplificationEnabled: false,
        memberIds: [100, 200],
      },
    ]);
    // Caller paid 20, split equally → caller +10, other -10
    setupShares([
      { chatId: 1, payerId: 100, userId: 100, amount: 10, currency: "SGD" },
      { chatId: 1, payerId: 100, userId: 200, amount: 10, currency: "SGD" },
    ]);
    // Other pays caller 6 → caller net 4
    setupSettlements([
      { chatId: 1, senderId: 200, receiverId: 100, amount: 6, currency: "SGD" },
    ]);
    setupUsers([{ id: 200, firstName: "Bob" }]);

    const result = await getMyBalancesAcrossChatsHandler(caller, mockDb);
    expect(result.balances[0]!.currencies).toEqual([
      { currency: "SGD", net: 4 },
    ]);
    expect(result.balances[0]!.counterparties).toEqual([
      { userId: 200, name: "Bob", currency: "SGD", net: 4 },
    ]);
  });
});
