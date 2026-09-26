import { describe, it, expect } from "vitest";
import {
  isValidAmount,
  toParties,
  toNotificationNames,
  resolveInitialValues,
  soleCounterpartyId,
  type RecordPaymentValues,
} from "./recordPayment";

describe("isValidAmount", () => {
  it.each([
    ["", false],
    ["0", false],
    ["0.00", false],
    ["0.001", false],
    ["12.", false],
    ["abc", false],
    ["0.01", true],
    ["20", true],
    ["587.88", true],
  ])("%s → %s", (input, expected) => {
    expect(isValidAmount(input)).toBe(expected);
  });
});

describe("toParties", () => {
  it("I paid → me sender, them receiver", () => {
    expect(toParties("paid", 1, 2)).toEqual({ senderId: 1, receiverId: 2 });
  });
  it("I received → them sender, me receiver", () => {
    expect(toParties("received", 1, 2)).toEqual({ senderId: 2, receiverId: 1 });
  });
});

describe("toNotificationNames", () => {
  const me = { firstName: "RQ" };
  const bob = { firstName: "Bob", username: "bob99" };
  it("I paid Bob → Bob is creditor, I am debtor", () => {
    expect(toNotificationNames("paid", me, bob)).toEqual({
      creditorName: "Bob",
      creditorUsername: "bob99",
      debtorName: "RQ",
    });
  });
  it("I received from Bob → I am creditor, Bob is debtor", () => {
    expect(toNotificationNames("received", me, bob)).toEqual({
      creditorName: "RQ",
      creditorUsername: undefined,
      debtorName: "Bob",
    });
  });
});

describe("resolveInitialValues", () => {
  const today = "2026-09-26";
  const draft: RecordPaymentValues = {
    amount: "5",
    currency: "JPY",
    description: "old",
    date: "2026-09-01",
    direction: "received",
    counterpartyId: "9",
  };
  it("empty defaults when no draft and no prefill", () => {
    expect(
      resolveInitialValues({
        prefill: {},
        draft: null,
        baseCurrency: "SGD",
        today,
      })
    ).toEqual({
      amount: "",
      currency: "SGD",
      description: "",
      date: today,
      direction: "paid",
      counterpartyId: "",
    });
  });
  it("draft restored when no prefill", () => {
    expect(
      resolveInitialValues({ prefill: {}, draft, baseCurrency: "SGD", today })
    ).toEqual(draft);
  });
  it("prefill wins over an existing draft", () => {
    expect(
      resolveInitialValues({
        prefill: {
          direction: "paid",
          counterpartyId: 2,
          amount: 587.88,
          currency: "SGD",
        },
        draft,
        baseCurrency: "SGD",
        today,
      })
    ).toEqual({
      amount: "587.88",
      currency: "SGD",
      description: "",
      date: today,
      direction: "paid",
      counterpartyId: "2",
    });
  });
});

describe("soleCounterpartyId", () => {
  const m = (id: number) => ({ id });
  it("picks the only other member in a two-person group", () => {
    expect(soleCounterpartyId([m(1), m(2)], 1)).toBe("2");
  });
  it("returns null when there are several other members", () => {
    expect(soleCounterpartyId([m(1), m(2), m(3)], 1)).toBeNull();
  });
  it("returns null when nobody else is in the group", () => {
    expect(soleCounterpartyId([m(1)], 1)).toBeNull();
    expect(soleCounterpartyId(undefined, 1)).toBeNull();
  });
  it("compares bigint-ish ids by value", () => {
    expect(soleCounterpartyId([{ id: 1n }, { id: 2n }], 1)).toBe("2");
  });
});
