import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@dko/database";
import { Decimal } from "decimal.js";
import { getDebtorsMultiCurrencyHandler } from "./getDebtorsMultiCurrency.js";
import { getCreditorsMultiCurrencyHandler } from "./getCreditorsMultiCurrency.js";

// Chat 1 only ever saw SGD expenses. A cross-group transfer lands a USD debt
// in it, so USD exists in the ledger without any USD expense or settlement.
const CHAT_ID = 1;
const ME = 100;
const OTHER = 200;

type TransferRow = {
  sourceChatId: number;
  targetChatId: number;
  debtorId: number;
  creditorId: number;
  amount: number;
  currency: string;
};

const mockDb = {
  chat: { findUnique: vi.fn() },
  expense: { findMany: vi.fn() },
  settlement: { findMany: vi.fn() },
  expenseShare: { findMany: vi.fn() },
  debtTransfer: { findMany: vi.fn() },
} as unknown as PrismaClient;

function setup(transfers: TransferRow[]) {
  (mockDb.chat.findUnique as any).mockResolvedValue({
    members: [
      { id: BigInt(ME), username: "me", firstName: "Me", lastName: null },
      {
        id: BigInt(OTHER),
        username: "other",
        firstName: "Other",
        lastName: null,
      },
    ],
  });

  // Only SGD expenses exist in this chat.
  (mockDb.expense.findMany as any).mockResolvedValue([{ currency: "SGD" }]);
  (mockDb.settlement.findMany as any).mockResolvedValue([]);
  (mockDb.expenseShare.findMany as any).mockResolvedValue([]);

  // Honour the currency filter so per-currency queries behave like Prisma.
  (mockDb.debtTransfer.findMany as any).mockImplementation(
    async (args: any) => {
      const currency = args?.where?.currency;
      return transfers
        .filter((t) => !currency || t.currency === currency)
        .map((t) => ({
          sourceChatId: BigInt(t.sourceChatId),
          targetChatId: BigInt(t.targetChatId),
          debtorId: BigInt(t.debtorId),
          creditorId: BigInt(t.creditorId),
          amount: new Decimal(t.amount),
          currency: t.currency,
        }));
    }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("multi-currency balances with transfer-only currencies", () => {
  it("lists a debtor whose debt exists only via a foreign-currency transfer", async () => {
    setup([
      {
        sourceChatId: 2,
        targetChatId: CHAT_ID,
        debtorId: OTHER,
        creditorId: ME,
        amount: 50,
        currency: "USD",
      },
    ]);

    const debtors = await getDebtorsMultiCurrencyHandler(
      { userId: ME, chatId: CHAT_ID },
      mockDb
    );

    expect(debtors).toHaveLength(1);
    expect(debtors[0]!.id).toBe(OTHER);
    expect(debtors[0]!.balances).toEqual([{ currency: "USD", amount: 50 }]);
  });

  it("lists a creditor whose debt exists only via a foreign-currency transfer", async () => {
    setup([
      {
        sourceChatId: 2,
        targetChatId: CHAT_ID,
        debtorId: ME,
        creditorId: OTHER,
        amount: 50,
        currency: "USD",
      },
    ]);

    const creditors = await getCreditorsMultiCurrencyHandler(
      { userId: ME, chatId: CHAT_ID },
      mockDb
    );

    expect(creditors).toHaveLength(1);
    expect(creditors[0]!.id).toBe(OTHER);
    expect(creditors[0]!.balances).toEqual([{ currency: "USD", amount: -50 }]);
  });

  it("still returns nothing when no ledger rows exist at all", async () => {
    setup([]);
    (mockDb.expense.findMany as any).mockResolvedValue([]);

    const debtors = await getDebtorsMultiCurrencyHandler(
      { userId: ME, chatId: CHAT_ID },
      mockDb
    );

    expect(debtors).toEqual([]);
  });
});
