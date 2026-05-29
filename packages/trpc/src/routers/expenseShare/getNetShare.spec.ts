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
          amount: new Decimal(40),
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
          amount: new Decimal(25),
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
          amount: new Decimal(40),
        },
      ],
    });
    expect(await getNetShareHandler(input, db)).toBe(100);
  });
});
