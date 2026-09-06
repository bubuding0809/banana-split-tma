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
  sourceAmount: number;
  sourceCurrency: string;
  targetAmount: number;
  targetCurrency: string;
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

  // The handlers under test call `debtTransfer.findMany` in two distinct
  // shapes now that transfers carry two legs:
  //
  //   1. Discovery: `where: { sourceChatId }` / `where: { targetChatId }`
  //      with a `distinct` select on the matching leg's currency column.
  //   2. Pair queries from `getNetShareHandler`: `where: { debtorId: { in },
  //      creditorId: { in }, OR: [{ sourceChatId, sourceCurrency }, {
  //      targetChatId, targetCurrency }] }`.
  //
  // Branch on the shape of `where` so each is answered faithfully instead of
  // just echoing back every fixture regardless of filter.
  (mockDb.debtTransfer.findMany as any).mockImplementation(
    async (args: any) => {
      const where = args?.where ?? {};

      // Discovery: source-leg currencies for a given source chat.
      if (where.sourceChatId !== undefined && where.OR === undefined) {
        const sourceChatId = where.sourceChatId;
        const currencies = [
          ...new Set(
            transfers
              .filter((t) => t.sourceChatId === sourceChatId)
              .map((t) => t.sourceCurrency)
          ),
        ];
        return currencies.map((sourceCurrency) => ({ sourceCurrency }));
      }

      // Discovery: target-leg currencies for a given target chat.
      if (where.targetChatId !== undefined && where.OR === undefined) {
        const targetChatId = where.targetChatId;
        const currencies = [
          ...new Set(
            transfers
              .filter((t) => t.targetChatId === targetChatId)
              .map((t) => t.targetCurrency)
          ),
        ];
        return currencies.map((targetCurrency) => ({ targetCurrency }));
      }

      // Pair query from getNetShareHandler: debtor/creditor scoped, OR'd on
      // source-leg vs target-leg chat+currency.
      const debtorIds: number[] = where.debtorId?.in ?? [];
      const creditorIds: number[] = where.creditorId?.in ?? [];
      const or: any[] = where.OR ?? [];

      return transfers
        .filter((t) => {
          if (
            !debtorIds.includes(t.debtorId) ||
            !creditorIds.includes(t.creditorId)
          ) {
            return false;
          }
          return or.some((clause) => {
            if (clause.sourceChatId !== undefined) {
              return (
                t.sourceChatId === clause.sourceChatId &&
                t.sourceCurrency === clause.sourceCurrency
              );
            }
            if (clause.targetChatId !== undefined) {
              return (
                t.targetChatId === clause.targetChatId &&
                t.targetCurrency === clause.targetCurrency
              );
            }
            return false;
          });
        })
        .map((t) => ({
          sourceChatId: BigInt(t.sourceChatId),
          targetChatId: BigInt(t.targetChatId),
          debtorId: BigInt(t.debtorId),
          creditorId: BigInt(t.creditorId),
          sourceAmount: new Decimal(t.sourceAmount),
          sourceCurrency: t.sourceCurrency,
          targetAmount: new Decimal(t.targetAmount),
          targetCurrency: t.targetCurrency,
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
        sourceAmount: 50,
        sourceCurrency: "USD",
        targetAmount: 50,
        targetCurrency: "USD",
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
        sourceAmount: 50,
        sourceCurrency: "USD",
        targetAmount: 50,
        targetCurrency: "USD",
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

  it("reports the chat's own leg currency, not the counterpart's", async () => {
    // Chat 1 is the TARGET of a transfer whose source leg is AUD and whose
    // target leg has already been converted to USD.
    setup([
      {
        sourceChatId: 2,
        targetChatId: CHAT_ID,
        debtorId: OTHER,
        creditorId: ME,
        sourceAmount: 50,
        sourceCurrency: "AUD",
        targetAmount: 33,
        targetCurrency: "USD",
      },
    ]);

    const debtors = await getDebtorsMultiCurrencyHandler(
      { userId: ME, chatId: CHAT_ID },
      mockDb
    );

    expect(debtors).toHaveLength(1);
    expect(debtors[0]!.balances).toEqual([{ currency: "USD", amount: 33 }]);
  });
});
