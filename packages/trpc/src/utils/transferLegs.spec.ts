import { describe, it, expect } from "vitest";
import { Decimal } from "decimal.js";
import { legFor } from "./transferLegs.js";

const transfer = {
  sourceChatId: BigInt(1),
  targetChatId: BigInt(2),
  sourceAmount: new Decimal(50),
  sourceCurrency: "AUD",
  targetAmount: new Decimal(44),
  targetCurrency: "SGD",
};

describe("legFor", () => {
  it("returns the source leg for the source chat", () => {
    expect(legFor(transfer, 1)).toEqual({
      amount: new Decimal(50),
      currency: "AUD",
    });
  });

  it("returns the target leg for the target chat", () => {
    expect(legFor(transfer, 2)).toEqual({
      amount: new Decimal(44),
      currency: "SGD",
    });
  });

  it("returns null for a chat that is neither side", () => {
    expect(legFor(transfer, 3)).toBeNull();
  });
});
