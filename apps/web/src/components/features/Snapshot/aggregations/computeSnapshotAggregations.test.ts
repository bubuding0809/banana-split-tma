import { describe, it, expect } from "vitest";
import { computeSnapshotAggregations } from "./computeSnapshotAggregations";
import type { SnapshotAggregations } from "./computeSnapshotAggregations";

// Stub type for test fixtures — avoids requiring full DB user shape.
// The cast `as unknown as SnapshotAggregations["details"]` is intentional:
// tests verify runtime behaviour, not TS structural completeness.
type DetailsArg = SnapshotAggregations["details"];

type StubShare = {
  userId: number;
  amount: number | null;
  user: { id: number; firstName: string };
};
type StubExpense = {
  id: string;
  chatId: number;
  creatorId: number;
  payerId: number;
  description: string;
  amount: number;
  currency: string;
  categoryId: string | null;
  date: Date;
  createdAt: Date;
  payer: { id: number; firstName: string };
  creator: { id: number; firstName: string };
  shares: StubShare[];
};

type StubDetails = {
  id: string;
  chatId: number;
  creatorId: number;
  title: string;
  createdAt: Date;
  creator: { id: number; firstName: string };
  chat: { id: number; baseCurrency: string };
  expenses: StubExpense[];
};

const mkExpense = (overrides: Partial<StubExpense>): StubExpense => ({
  id: "e1",
  chatId: 1,
  creatorId: 100,
  payerId: 100,
  description: "Lunch",
  amount: 20,
  currency: "SGD",
  categoryId: null,
  date: new Date("2026-04-05T12:00:00"),
  createdAt: new Date("2026-04-05T12:00:00"),
  payer: { id: 100, firstName: "Alice" },
  creator: { id: 100, firstName: "Alice" },
  shares: [
    { userId: 100, amount: 10, user: { id: 100, firstName: "Alice" } },
    { userId: 200, amount: 10, user: { id: 200, firstName: "Bob" } },
  ],
  ...overrides,
});

const BASE_DETAILS: StubDetails = {
  id: "snap1",
  chatId: 1,
  creatorId: 100,
  title: "Test trip",
  createdAt: new Date("2026-04-10T00:00:00"),
  creator: { id: 100, firstName: "Alice" },
  chat: { id: 1, baseCurrency: "SGD" },
  expenses: [],
};

const asDetails = (d: StubDetails): DetailsArg => d as unknown as DetailsArg;

describe("computeSnapshotAggregations", () => {
  it("returns empty groups and zero totals for an empty snapshot", () => {
    const out = computeSnapshotAggregations({
      details: asDetails({ ...BASE_DETAILS, expenses: [] }),
      rates: {},
      baseCurrency: "SGD",
      currentUserId: 100,
      chatCategories: [],
    });

    expect(out.totalInBase).toBe(0);
    expect(out.byCategory).toEqual([]);
    expect(out.byDate).toEqual([]);
    expect(out.byPayer).toEqual([]);
    expect(out.userShareInBase).toBe(0);
    expect(out.dateRange).toBeNull();
  });

  it("sums expenses in base currency when all expenses are in base currency", () => {
    const out = computeSnapshotAggregations({
      details: asDetails({
        ...BASE_DETAILS,
        expenses: [
          mkExpense({ amount: 20 }),
          mkExpense({ id: "e2", amount: 30 }),
        ],
      }),
      rates: {},
      baseCurrency: "SGD",
      currentUserId: 100,
      chatCategories: [],
    });

    expect(out.totalInBase).toBeCloseTo(50, 2);
  });

  it("converts foreign-currency expenses into base via rates map (amount / rate)", () => {
    const out = computeSnapshotAggregations({
      details: asDetails({
        ...BASE_DETAILS,
        expenses: [mkExpense({ amount: 100, currency: "USD" })],
      }),
      rates: { USD: { rate: 0.75 } },
      baseCurrency: "SGD",
      currentUserId: 100,
      chatCategories: [],
    });

    expect(out.totalInBase).toBeCloseTo(133.33, 2);
  });

  it("groups by category, sorted desc by total, with resolved emoji/title", () => {
    const out = computeSnapshotAggregations({
      details: asDetails({
        ...BASE_DETAILS,
        expenses: [
          mkExpense({ id: "e1", categoryId: "base:food", amount: 100 }),
          mkExpense({ id: "e2", categoryId: "base:food", amount: 50 }),
          mkExpense({ id: "e3", categoryId: "base:transport", amount: 80 }),
          mkExpense({ id: "e4", categoryId: null, amount: 10 }),
        ],
      }),
      rates: {},
      baseCurrency: "SGD",
      currentUserId: 100,
      chatCategories: [],
    });

    expect(out.byCategory.map((g) => g.totalInBase)).toEqual([150, 80, 10]);
    expect(out.byCategory[0]!.key).toBe("base:food");
    expect(out.byCategory[1]!.key).toBe("base:transport");
    expect(out.byCategory[2]!.key).toBe("__none__");
    expect(out.byCategory[0]!.items).toHaveLength(2);
  });

  it("groups by date (calendar day, chronological asc)", () => {
    const out = computeSnapshotAggregations({
      details: asDetails({
        ...BASE_DETAILS,
        expenses: [
          mkExpense({ id: "e1", date: new Date("2026-04-05"), amount: 10 }),
          mkExpense({ id: "e2", date: new Date("2026-04-05"), amount: 20 }),
          mkExpense({ id: "e3", date: new Date("2026-04-07"), amount: 50 }),
        ],
      }),
      rates: {},
      baseCurrency: "SGD",
      currentUserId: 100,
      chatCategories: [],
    });

    expect(out.byDate).toHaveLength(2);
    expect(out.byDate[0]!.date.getDate()).toBe(5);
    expect(out.byDate[0]!.totalInBase).toBe(30);
    expect(out.byDate[1]!.date.getDate()).toBe(7);
    expect(out.byDate[1]!.totalInBase).toBe(50);
  });

  it("groups by payer, sorted desc by total", () => {
    const out = computeSnapshotAggregations({
      details: asDetails({
        ...BASE_DETAILS,
        expenses: [
          mkExpense({
            id: "e1",
            payerId: 100,
            payer: { id: 100, firstName: "Alice" },
            amount: 50,
          }),
          mkExpense({
            id: "e2",
            payerId: 200,
            payer: { id: 200, firstName: "Bob" },
            amount: 200,
          }),
          mkExpense({
            id: "e3",
            payerId: 100,
            payer: { id: 100, firstName: "Alice" },
            amount: 10,
          }),
        ],
      }),
      rates: {},
      baseCurrency: "SGD",
      currentUserId: 100,
      chatCategories: [],
    });

    expect(out.byPayer).toHaveLength(2);
    expect(out.byPayer[0]!.payerId).toBe(200);
    expect(out.byPayer[0]!.totalInBase).toBe(200);
    expect(out.byPayer[1]!.payerId).toBe(100);
    expect(out.byPayer[1]!.totalInBase).toBe(60);
  });

  it("computes userShareInBase as the sum of the current user's share amounts converted to base", () => {
    const out = computeSnapshotAggregations({
      details: asDetails({
        ...BASE_DETAILS,
        expenses: [
          mkExpense({
            amount: 20,
            currency: "SGD",
            shares: [
              {
                userId: 100,
                amount: 10,
                user: { id: 100, firstName: "Alice" },
              },
              { userId: 200, amount: 10, user: { id: 200, firstName: "Bob" } },
            ],
          }),
          mkExpense({
            id: "e2",
            amount: 60,
            currency: "USD",
            shares: [
              {
                userId: 100,
                amount: 30,
                user: { id: 100, firstName: "Alice" },
              },
              { userId: 200, amount: 30, user: { id: 200, firstName: "Bob" } },
            ],
          }),
        ],
      }),
      rates: { USD: { rate: 0.75 } },
      baseCurrency: "SGD",
      currentUserId: 100,
      chatCategories: [],
    });

    expect(out.userShareInBase).toBeCloseTo(50, 2);
  });

  it("returns dateRange with earliest and latest expense dates", () => {
    const out = computeSnapshotAggregations({
      details: asDetails({
        ...BASE_DETAILS,
        expenses: [
          mkExpense({ id: "e1", date: new Date("2026-04-10") }),
          mkExpense({ id: "e2", date: new Date("2026-04-03") }),
          mkExpense({ id: "e3", date: new Date("2026-04-07") }),
        ],
      }),
      rates: {},
      baseCurrency: "SGD",
      currentUserId: 100,
      chatCategories: [],
    });

    expect(out.dateRange!.earliest.getDate()).toBe(3);
    expect(out.dateRange!.latest.getDate()).toBe(10);
  });

  it("uses category rate=1 when the target rate is missing (graceful fallback)", () => {
    const out = computeSnapshotAggregations({
      details: asDetails({
        ...BASE_DETAILS,
        expenses: [mkExpense({ amount: 100, currency: "XYZ" })],
      }),
      rates: {},
      baseCurrency: "SGD",
      currentUserId: 100,
      chatCategories: [],
    });

    expect(out.totalInBase).toBeCloseTo(100, 2);
  });
});
