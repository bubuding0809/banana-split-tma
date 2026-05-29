import { describe, it, expect } from "vitest";
import { Decimal } from "decimal.js";
import {
  computeChatPairwiseBalances,
  buildUserBalanceMap,
} from "./chatBalances.js";

const d = (n: number) => new Decimal(n);

describe("buildUserBalanceMap", () => {
  it("aggregates per-user net from shares and settlements", () => {
    // Alice (1) paid $30; Bob (2) and Carol (3) each have $10 share; Alice has $10 share
    const shares = [
      { userId: 1n, amount: d(10), expense: { payerId: 1n, currency: "SGD" } },
      { userId: 2n, amount: d(10), expense: { payerId: 1n, currency: "SGD" } },
      { userId: 3n, amount: d(10), expense: { payerId: 1n, currency: "SGD" } },
    ];
    const settlements: never[] = [];
    const memberIds = [1, 2, 3];

    const map = buildUserBalanceMap(memberIds, shares, settlements);

    // Alice paid 30, owes 10 of own share → net +20
    // Bob owes 10
    // Carol owes 10
    expect(map.get(1)).toBe(20);
    expect(map.get(2)).toBe(-10);
    expect(map.get(3)).toBe(-10);
  });

  it("settlement between debtor and creditor zeroes out existing balance", () => {
    // Prior state: Alice (1) is owed $5 by Bob (2) from a previous expense.
    // Model that via a share: Alice paid $5, Bob took a $5 share.
    const shares = [
      { userId: 2n, amount: d(5), expense: { payerId: 1n, currency: "SGD" } },
    ];
    // Bob settles by paying Alice $5.
    const settlements = [
      { senderId: 2n, receiverId: 1n, amount: d(5), currency: "SGD" },
    ];
    const memberIds = [1, 2];

    const map = buildUserBalanceMap(memberIds, shares, settlements);

    // Both should be square after the settlement
    expect(map.get(1)).toBe(0);
    expect(map.get(2)).toBe(0);
  });
});

describe("buildUserBalanceMap with native transfers", () => {
  // Sean (2) owes Ruoqian (1). A transfer moves that debt from the
  // source chat (where it is cleared) to the target chat (where it is added).
  const sourceChatId = 100;
  const targetChatId = 200;

  it("clears the debtor's debt in the source chat", () => {
    // Sean owes Ruoqian $10 in the source chat (Ruoqian paid, Sean took a share).
    const shares = [
      { userId: 2n, amount: d(10), expense: { payerId: 1n, currency: "SGD" } },
    ];
    const transfers = [
      {
        sourceChatId: BigInt(sourceChatId),
        targetChatId: BigInt(targetChatId),
        debtorId: 2n,
        creditorId: 1n,
        amount: d(10),
      },
    ];

    const map = buildUserBalanceMap(
      [1, 2],
      shares,
      [],
      transfers,
      sourceChatId
    );

    // Debt is removed: both square in the source chat.
    expect(map.get(1)).toBe(0);
    expect(map.get(2)).toBe(0);
  });

  it("adds the debt in the target chat", () => {
    const transfers = [
      {
        sourceChatId: BigInt(sourceChatId),
        targetChatId: BigInt(targetChatId),
        debtorId: 2n,
        creditorId: 1n,
        amount: d(10),
      },
    ];

    const map = buildUserBalanceMap([1, 2], [], [], transfers, targetChatId);

    // Sean now owes Ruoqian $10 in the target chat.
    expect(map.get(1)).toBe(10);
    expect(map.get(2)).toBe(-10);
  });

  it("ignores transfers for a chat that is neither source nor target", () => {
    const transfers = [
      {
        sourceChatId: BigInt(sourceChatId),
        targetChatId: BigInt(targetChatId),
        debtorId: 2n,
        creditorId: 1n,
        amount: d(10),
      },
    ];

    const map = buildUserBalanceMap([1, 2], [], [], transfers, 999);

    expect(map.get(1)).toBe(0);
    expect(map.get(2)).toBe(0);
  });

  it("is a no-op when no chatId is provided", () => {
    const transfers = [
      {
        sourceChatId: BigInt(sourceChatId),
        targetChatId: BigInt(targetChatId),
        debtorId: 2n,
        creditorId: 1n,
        amount: d(10),
      },
    ];

    const map = buildUserBalanceMap([1, 2], [], [], transfers);

    expect(map.get(1)).toBe(0);
    expect(map.get(2)).toBe(0);
  });
});

describe("computeChatPairwiseBalances", () => {
  it("returns pairwise debts only for significant amounts", () => {
    // Alice paid 30, split equally among Alice, Bob, Carol
    const shares = [
      { userId: 1n, amount: d(10), expense: { payerId: 1n, currency: "SGD" } },
      { userId: 2n, amount: d(10), expense: { payerId: 1n, currency: "SGD" } },
      { userId: 3n, amount: d(10), expense: { payerId: 1n, currency: "SGD" } },
    ];
    const memberIds = [1, 2, 3];

    const pairs = computeChatPairwiseBalances(memberIds, shares, []);

    // Bob owes Alice 10; Carol owes Alice 10; Bob↔Carol = 0 → excluded
    expect(pairs).toHaveLength(2);
    expect(pairs).toContainEqual({ debtorId: 2, creditorId: 1, amount: 10 });
    expect(pairs).toContainEqual({ debtorId: 3, creditorId: 1, amount: 10 });
  });

  it("drops near-zero pairs under 0.01 threshold", () => {
    const shares = [
      {
        userId: 1n,
        amount: d(0.005),
        expense: { payerId: 2n, currency: "SGD" },
      },
    ];
    const memberIds = [1, 2];

    const pairs = computeChatPairwiseBalances(memberIds, shares, []);

    expect(pairs).toEqual([]);
  });
});

describe("computeChatPairwiseBalances with native transfers", () => {
  const sourceChatId = 100;
  const targetChatId = 200;
  const transfer = (amount: number) => ({
    sourceChatId: BigInt(sourceChatId),
    targetChatId: BigInt(targetChatId),
    debtorId: 2n,
    creditorId: 1n,
    amount: d(amount),
  });

  it("clears a pairwise debt in the source chat", () => {
    // Sean (2) owes Ruoqian (1) $10 from a share.
    const shares = [
      { userId: 2n, amount: d(10), expense: { payerId: 1n, currency: "SGD" } },
    ];

    const pairs = computeChatPairwiseBalances(
      [1, 2],
      shares,
      [],
      [transfer(10)],
      sourceChatId
    );

    expect(pairs).toEqual([]);
  });

  it("partially reduces a pairwise debt in the source chat", () => {
    const shares = [
      { userId: 2n, amount: d(10), expense: { payerId: 1n, currency: "SGD" } },
    ];

    const pairs = computeChatPairwiseBalances(
      [1, 2],
      shares,
      [],
      [transfer(4)],
      sourceChatId
    );

    expect(pairs).toEqual([{ debtorId: 2, creditorId: 1, amount: 6 }]);
  });

  it("adds a pairwise debt in the target chat", () => {
    const pairs = computeChatPairwiseBalances(
      [1, 2],
      [],
      [],
      [transfer(10)],
      targetChatId
    );

    expect(pairs).toEqual([{ debtorId: 2, creditorId: 1, amount: 10 }]);
  });

  it("ignores transfers for an unrelated chat", () => {
    const shares = [
      { userId: 2n, amount: d(10), expense: { payerId: 1n, currency: "SGD" } },
    ];

    const pairs = computeChatPairwiseBalances(
      [1, 2],
      shares,
      [],
      [transfer(10)],
      999
    );

    expect(pairs).toEqual([{ debtorId: 2, creditorId: 1, amount: 10 }]);
  });
});
