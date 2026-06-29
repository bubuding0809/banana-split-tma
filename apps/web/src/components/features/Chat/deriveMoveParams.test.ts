import { describe, it, expect } from "vitest";
import { deriveMoveParams } from "./deriveMoveParams";

const group = (nativeNet: number) => ({
  chatId: 100,
  chatTitle: "Japan Trip",
  currency: "SGD",
  nativeNet,
});

describe("deriveMoveParams", () => {
  it("caller owes counterparty when nativeNet < 0", () => {
    const p = deriveMoveParams(group(-71.79), 1, 2)!;
    expect(p.debtorId).toBe(1);
    expect(p.creditorId).toBe(2);
    expect(p.amount).toBeCloseTo(71.79);
    expect(p.callerOwes).toBe(true);
    expect(p.currency).toBe("SGD");
    expect(p.sourceChatId).toBe(100);
    expect(p.sourceChatTitle).toBe("Japan Trip");
  });

  it("counterparty owes caller when nativeNet > 0", () => {
    const p = deriveMoveParams(group(40), 1, 2)!;
    expect(p.debtorId).toBe(2);
    expect(p.creditorId).toBe(1);
    expect(p.amount).toBe(40);
    expect(p.callerOwes).toBe(false);
  });

  it("returns null for a near-zero balance", () => {
    expect(deriveMoveParams(group(0), 1, 2)).toBeNull();
    expect(deriveMoveParams(group(0.004), 1, 2)).toBeNull();
  });
});
