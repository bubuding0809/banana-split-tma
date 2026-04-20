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
