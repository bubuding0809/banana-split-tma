import { describe, expect, it } from "vitest";
import { SplitMode } from "@dko/database";
import { computeChangedFields } from "./updateExpense.js";

const baseExisting = {
  description: "lunch",
  amount: 10 as number,
  currency: "SGD",
  date: new Date("2026-05-01T00:00:00Z"),
  payerId: 1n,
  categoryId: "base:food" as string | null,
  splitMode: SplitMode.EQUAL,
  shares: [
    { userId: 1n, amount: 5 as number },
    { userId: 2n, amount: 5 as number },
  ],
};

const baseInput = {
  description: "lunch",
  amount: 10,
  currency: "SGD",
  date: new Date("2026-05-01T00:00:00Z"),
  payerId: 1n,
  categoryId: "base:food",
  splitMode: SplitMode.EQUAL,
};

const baseSplits = [
  { userId: 1n, amount: 5 },
  { userId: 2n, amount: 5 },
];

describe("computeChangedFields", () => {
  it("flags currency-only change (regression: currency edits used to be invisible)", () => {
    const changed = computeChangedFields(
      baseExisting,
      { ...baseInput, currency: "USD" },
      baseSplits
    );
    expect(changed).toEqual(["currency"]);
  });

  it("flags date-only change", () => {
    const changed = computeChangedFields(
      baseExisting,
      { ...baseInput, date: new Date("2026-05-02T00:00:00Z") },
      baseSplits
    );
    expect(changed).toEqual(["date"]);
  });

  it("treats undefined currency/date as 'caller did not touch' — no false positives", () => {
    const changed = computeChangedFields(
      baseExisting,
      {
        description: baseInput.description,
        amount: baseInput.amount,
        payerId: baseInput.payerId,
        splitMode: baseInput.splitMode,
        // currency, date, categoryId omitted on purpose
      },
      baseSplits
    );
    expect(changed).toEqual([]);
  });

  it("returns empty for a completely unchanged update", () => {
    const changed = computeChangedFields(baseExisting, baseInput, baseSplits);
    expect(changed).toEqual([]);
  });

  it("captures multiple field changes including the new ones", () => {
    const changed = computeChangedFields(
      baseExisting,
      {
        ...baseInput,
        description: "dinner",
        currency: "USD",
        date: new Date("2026-05-03T00:00:00Z"),
      },
      baseSplits
    );
    expect(changed).toEqual(["description", "currency", "date"]);
  });
});
