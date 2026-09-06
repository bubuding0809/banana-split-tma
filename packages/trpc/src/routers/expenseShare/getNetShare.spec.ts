import { describe, it, expect } from "vitest";
import { Decimal } from "decimal.js";
import { getNetShareHandler } from "./getNetShare.js";

// main = 1 (creditor), target = 2 (debtor). Positive net = target owes main.
// Target owes main $100 from a share (main paid, target consumed).
const baseShares = {
  toReceive: [{ amount: new Decimal(100) }], // payer=main, user=target
  toPay: [] as { amount: Decimal }[],
};

function makeDb(opts: { transfers?: unknown[] }) {
  const { transfers = [] } = opts;
  return {
    expenseShare: {
      findMany: async ({
        where,
      }: {
        where: { expense: { payerId: number } };
      }) =>
        where.expense.payerId === 1 ? baseShares.toReceive : baseShares.toPay,
    },
    settlement: { findMany: async () => [] },
    debtTransfer: { findMany: async () => transfers },
  } as never;
}

const input = {
  mainUserId: 1,
  targetUserId: 2,
  chatId: 100,
  currency: "SGD",
};

describe("getNetShareHandler with native transfers", () => {
  it("counts a transfer under the leg currency of the chat being asked", async () => {
    // Legs diverged: AUD 50 left chat 1, SGD 44 arrived in chat 2.
    const rows = [
      {
        sourceChatId: BigInt(1),
        targetChatId: BigInt(2),
        debtorId: BigInt(200),
        creditorId: BigInt(100),
        sourceAmount: new Decimal(50),
        sourceCurrency: "AUD",
        targetAmount: new Decimal(44),
        targetCurrency: "SGD",
      },
    ];

    const mockDb = {
      expenseShare: { findMany: async () => [] },
      settlement: { findMany: async () => [] },
      debtTransfer: {
        findMany: async (args: any) => {
          // Emulate the leg-scoped OR predicate.
          const or = args.where.OR as Array<Record<string, unknown>>;
          return rows.filter((r) =>
            or.some(
              (c) =>
                (c.sourceChatId !== undefined &&
                  Number(r.sourceChatId) === c.sourceChatId &&
                  r.sourceCurrency === c.sourceCurrency) ||
                (c.targetChatId !== undefined &&
                  Number(r.targetChatId) === c.targetChatId &&
                  r.targetCurrency === c.targetCurrency)
            )
          );
        },
      },
    } as never;

    // Chat 2 asked in SGD sees the target leg: 200 owes 100 SGD 44.
    await expect(
      getNetShareHandler(
        { mainUserId: 100, targetUserId: 200, chatId: 2, currency: "SGD" },
        mockDb
      )
    ).resolves.toBe(44);

    // Chat 2 asked in AUD sees nothing — that currency belongs to the other leg.
    await expect(
      getNetShareHandler(
        { mainUserId: 100, targetUserId: 200, chatId: 2, currency: "AUD" },
        mockDb
      )
    ).resolves.toBe(0);
  });

  it("returns the share-only net when there are no transfers", async () => {
    const net = await getNetShareHandler(input, makeDb({}));
    expect(net).toBe(100);
  });

  it("reduces the net when the debt is transferred out of this chat (source)", async () => {
    const db = makeDb({
      transfers: [
        {
          sourceChatId: 100n,
          targetChatId: 200n,
          debtorId: 2n,
          creditorId: 1n,
          sourceAmount: new Decimal(40),
          sourceCurrency: "SGD",
          targetAmount: new Decimal(40),
          targetCurrency: "SGD",
        },
      ],
    });
    // 100 owed minus 40 shipped out = 60.
    expect(await getNetShareHandler(input, db)).toBe(60);
  });

  it("increases the net when a debt is transferred into this chat (target)", async () => {
    const db = makeDb({
      transfers: [
        {
          sourceChatId: 300n,
          targetChatId: 100n,
          debtorId: 2n,
          creditorId: 1n,
          sourceAmount: new Decimal(25),
          sourceCurrency: "SGD",
          targetAmount: new Decimal(25),
          targetCurrency: "SGD",
        },
      ],
    });
    // 100 + 25 added here = 125.
    expect(await getNetShareHandler(input, db)).toBe(125);
  });

  it("ignores transfers between unrelated chats", async () => {
    const db = makeDb({
      transfers: [
        {
          sourceChatId: 300n,
          targetChatId: 400n,
          debtorId: 2n,
          creditorId: 1n,
          sourceAmount: new Decimal(40),
          sourceCurrency: "SGD",
          targetAmount: new Decimal(40),
          targetCurrency: "SGD",
        },
      ],
    });
    expect(await getNetShareHandler(input, db)).toBe(100);
  });
});
