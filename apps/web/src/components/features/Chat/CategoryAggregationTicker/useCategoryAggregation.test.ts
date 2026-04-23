import { describe, expect, it } from "vitest";
import {
  computeCategoryAggregation,
  type TickerExpense,
} from "./useCategoryAggregation";

const USER = 111;
const OTHER = 222;

// date-fns reads local time via getYear/getMonth, so use new Date(y, m, d)
// (month 0-indexed) to avoid any UTC-vs-local drift in assertions.
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

const baseIndex = new Map([
  ["cat:food", { emoji: "🍜", title: "Food" }],
  ["cat:transport", { emoji: "🚂", title: "Transport" }],
  ["cat:travel", { emoji: "✈️", title: "Travel" }],
]);

function mkExpense(overrides: Partial<TickerExpense> = {}): TickerExpense {
  return {
    id: overrides.id ?? "exp-" + Math.random().toString(36).slice(2),
    date: overrides.date ?? d(2026, 4, 15),
    currency: overrides.currency ?? "SGD",
    amount: overrides.amount ?? 100,
    // "in" check so explicit `null` overrides the default.
    categoryId: "categoryId" in overrides ? overrides.categoryId! : "cat:food",
    payerId: overrides.payerId ?? USER,
    shares: overrides.shares ?? [{ userId: USER, amount: 100 }],
  };
}

describe("computeCategoryAggregation", () => {
  it("returns an empty, non-erroring result when there are no expenses", () => {
    const result = computeCategoryAggregation({
      expenses: [],
      userId: USER,
      baseCurrency: "SGD",
      categoriesIndex: baseIndex,
      categoryFilters: [],
      pickedMonthKey: null,
      rates: {},
      ratesReady: true,
    });

    expect(result.monthList).toEqual([]);
    expect(result.byCategory).toEqual([]);
    expect(result.baseTotal).toBe(0);
    expect(result.empty).toBe(true);
    expect(result.needsConversion).toBe(false);
  });

  it("filters out expenses where the user holds no share (sponsor case)", () => {
    // User paid but isn't in shares — they sponsored others. Contributes 0.
    const result = computeCategoryAggregation({
      expenses: [
        mkExpense({
          payerId: USER,
          shares: [{ userId: OTHER, amount: 40 }],
        }),
      ],
      userId: USER,
      baseCurrency: "SGD",
      categoriesIndex: baseIndex,
      categoryFilters: [],
      pickedMonthKey: null,
      rates: {},
      ratesReady: true,
    });

    expect(result.monthList).toEqual([]);
    expect(result.byCategory).toEqual([]);
  });

  it("sums user's share for a single base-currency expense", () => {
    const result = computeCategoryAggregation({
      expenses: [
        mkExpense({
          amount: 100,
          shares: [
            { userId: USER, amount: 40 },
            { userId: OTHER, amount: 60 },
          ],
        }),
      ],
      userId: USER,
      baseCurrency: "SGD",
      categoriesIndex: baseIndex,
      categoryFilters: [],
      pickedMonthKey: null,
      rates: {},
      ratesReady: true,
    });

    expect(result.baseTotal).toBe(40);
    expect(result.needsConversion).toBe(false);
    expect(result.byCategory).toHaveLength(1);
    expect(result.byCategory[0]).toMatchObject({
      categoryId: "cat:food",
      baseTotal: 40,
      needsConversion: false,
    });
    expect(result.byCategory[0].byCurrency).toEqual([
      { currency: "SGD", amount: 40, convertedAmount: 40 },
    ]);
  });

  it("converts foreign currency using provided rates (amount / rate)", () => {
    // USD rate against SGD base = 0.74 (so 1 USD = 1/0.74 ≈ 1.351 SGD)
    const result = computeCategoryAggregation({
      expenses: [
        mkExpense({
          currency: "USD",
          shares: [{ userId: USER, amount: 37 }],
        }),
      ],
      userId: USER,
      baseCurrency: "SGD",
      categoriesIndex: baseIndex,
      categoryFilters: [],
      pickedMonthKey: null,
      rates: { USD: { rate: 0.74 } },
      ratesReady: true,
    });

    expect(result.baseTotal).toBeCloseTo(37 / 0.74, 4);
    expect(result.needsConversion).toBe(true);
    expect(result.byCategory[0].byCurrency).toEqual([
      { currency: "USD", amount: 37, convertedAmount: 37 / 0.74 },
    ]);
  });

  it("groups multi-currency expenses under the same category with exact native breakdown", () => {
    const result = computeCategoryAggregation({
      expenses: [
        mkExpense({
          id: "e1",
          currency: "SGD",
          shares: [{ userId: USER, amount: 30 }],
        }),
        mkExpense({
          id: "e2",
          currency: "USD",
          shares: [{ userId: USER, amount: 25 }],
        }),
        mkExpense({
          id: "e3",
          currency: "USD",
          shares: [{ userId: USER, amount: 10 }],
        }),
      ],
      userId: USER,
      baseCurrency: "SGD",
      categoriesIndex: baseIndex,
      categoryFilters: [],
      pickedMonthKey: null,
      rates: { USD: { rate: 0.74 } },
      ratesReady: true,
    });

    expect(result.byCategory).toHaveLength(1);
    const cat = result.byCategory[0];
    expect(cat.needsConversion).toBe(true);
    expect(cat.byCurrency).toEqual([
      // USD entry first (35 > 30 in native units, sorted desc by native amount)
      { currency: "USD", amount: 35, convertedAmount: 35 / 0.74 },
      { currency: "SGD", amount: 30, convertedAmount: 30 },
    ]);
    expect(cat.baseTotal).toBeCloseTo(30 + 35 / 0.74, 4);
  });

  it("scopes to selected category filters and respects their selection order", () => {
    // Three categories, two selected in a specific order.
    const result = computeCategoryAggregation({
      expenses: [
        mkExpense({
          categoryId: "cat:food",
          shares: [{ userId: USER, amount: 10 }],
        }),
        mkExpense({
          categoryId: "cat:transport",
          shares: [{ userId: USER, amount: 20 }],
        }),
        mkExpense({
          categoryId: "cat:travel",
          shares: [{ userId: USER, amount: 30 }],
        }),
      ],
      userId: USER,
      baseCurrency: "SGD",
      categoriesIndex: baseIndex,
      categoryFilters: ["cat:transport", "cat:food"], // transport first
      pickedMonthKey: null,
      rates: {},
      ratesReady: true,
    });

    expect(result.byCategory).toHaveLength(2);
    expect(result.byCategory[0].categoryId).toBe("cat:transport");
    expect(result.byCategory[1].categoryId).toBe("cat:food");
    expect(result.baseTotal).toBe(30); // 20 + 10, travel excluded
  });

  it("sorts categories by baseTotal desc when no filter is applied", () => {
    const result = computeCategoryAggregation({
      expenses: [
        mkExpense({
          categoryId: "cat:food",
          shares: [{ userId: USER, amount: 10 }],
        }),
        mkExpense({
          categoryId: "cat:transport",
          shares: [{ userId: USER, amount: 50 }],
        }),
        mkExpense({
          categoryId: "cat:travel",
          shares: [{ userId: USER, amount: 30 }],
        }),
      ],
      userId: USER,
      baseCurrency: "SGD",
      categoriesIndex: baseIndex,
      categoryFilters: [],
      pickedMonthKey: null,
      rates: {},
      ratesReady: true,
    });

    expect(result.byCategory.map((c) => c.categoryId)).toEqual([
      "cat:transport",
      "cat:travel",
      "cat:food",
    ]);
  });

  it("always sinks 'Uncategorized' to the bottom, even with amounts larger than others", () => {
    const result = computeCategoryAggregation({
      expenses: [
        mkExpense({
          categoryId: "cat:food",
          shares: [{ userId: USER, amount: 10 }],
        }),
        mkExpense({
          categoryId: null, // uncategorized
          shares: [{ userId: USER, amount: 500 }],
        }),
      ],
      userId: USER,
      baseCurrency: "SGD",
      categoriesIndex: baseIndex,
      categoryFilters: [],
      pickedMonthKey: null,
      rates: {},
      ratesReady: true,
    });

    const ids = result.byCategory.map((c) => c.categoryId);
    expect(ids[ids.length - 1]).toBe("none");
    expect(
      result.byCategory.find((c) => c.categoryId === "none")
    ).toMatchObject({
      emoji: "❓",
      title: "Uncategorized",
    });
  });

  it("builds a monthList covering every month that has ≥1 matching expense", () => {
    const result = computeCategoryAggregation({
      expenses: [
        mkExpense({
          date: d(2026, 4, 15),
          shares: [{ userId: USER, amount: 10 }],
        }),
        mkExpense({
          date: d(2026, 3, 10),
          shares: [{ userId: USER, amount: 20 }],
        }),
        mkExpense({
          date: d(2025, 12, 1),
          shares: [{ userId: USER, amount: 30 }],
        }),
      ],
      userId: USER,
      baseCurrency: "SGD",
      categoriesIndex: baseIndex,
      categoryFilters: [],
      pickedMonthKey: null,
      rates: {},
      ratesReady: true,
    });

    expect(result.monthList.map((m) => m.monthKey)).toEqual([
      "2026-04",
      "2026-03",
      "2025-12",
    ]);
    expect(result.monthList[0].baseTotal).toBe(10);
    expect(result.monthList[1].baseTotal).toBe(20);
    expect(result.monthList[2].baseTotal).toBe(30);
  });

  it("defaults pickedMonthKey to the latest month with matches", () => {
    const result = computeCategoryAggregation({
      expenses: [
        mkExpense({
          date: d(2026, 4, 15),
          shares: [{ userId: USER, amount: 50 }],
        }),
        mkExpense({
          date: d(2026, 2, 1),
          shares: [{ userId: USER, amount: 10 }],
        }),
      ],
      userId: USER,
      baseCurrency: "SGD",
      categoriesIndex: baseIndex,
      categoryFilters: [],
      pickedMonthKey: null,
      rates: {},
      ratesReady: true,
    });

    expect(result.monthKey).toBe("2026-04");
    expect(result.baseTotal).toBe(50);
  });

  it("returns empty state when the picked month has no matches", () => {
    const result = computeCategoryAggregation({
      expenses: [
        mkExpense({
          date: d(2026, 4, 15),
          shares: [{ userId: USER, amount: 50 }],
        }),
      ],
      userId: USER,
      baseCurrency: "SGD",
      categoriesIndex: baseIndex,
      categoryFilters: [],
      pickedMonthKey: "2026-01", // no expenses
      rates: {},
      ratesReady: true,
    });

    expect(result.monthKey).toBe("2026-01");
    expect(result.baseTotal).toBe(0);
    expect(result.empty).toBe(true);
    expect(result.byCategory).toEqual([]);
  });

  it("exposes targetCurrencies for the FX-rate query", () => {
    const result = computeCategoryAggregation({
      expenses: [
        mkExpense({
          currency: "SGD",
          shares: [{ userId: USER, amount: 10 }],
        }),
        mkExpense({
          currency: "USD",
          shares: [{ userId: USER, amount: 10 }],
        }),
        mkExpense({
          currency: "EUR",
          shares: [{ userId: USER, amount: 10 }],
        }),
      ],
      userId: USER,
      baseCurrency: "SGD",
      categoriesIndex: baseIndex,
      categoryFilters: [],
      pickedMonthKey: null,
      rates: { USD: { rate: 0.74 }, EUR: { rate: 0.68 } },
      ratesReady: true,
    });

    expect(new Set(result.targetCurrencies)).toEqual(new Set(["USD", "EUR"]));
  });

  it("marks ratesReady false when foreign currencies are present but rates are pending", () => {
    const result = computeCategoryAggregation({
      expenses: [
        mkExpense({
          currency: "USD",
          shares: [{ userId: USER, amount: 10 }],
        }),
      ],
      userId: USER,
      baseCurrency: "SGD",
      categoriesIndex: baseIndex,
      categoryFilters: [],
      pickedMonthKey: null,
      rates: {},
      ratesReady: false,
    });

    expect(result.ratesReady).toBe(false);
    // Without rates, conversion is skipped; baseTotal is 0 for the foreign
    // portion rather than throwing.
    expect(result.baseTotal).toBe(0);
  });

  it("ratesReady stays true when there are no foreign currencies regardless of input flag", () => {
    const result = computeCategoryAggregation({
      expenses: [
        mkExpense({
          currency: "SGD",
          shares: [{ userId: USER, amount: 10 }],
        }),
      ],
      userId: USER,
      baseCurrency: "SGD",
      categoriesIndex: baseIndex,
      categoryFilters: [],
      pickedMonthKey: null,
      rates: {},
      ratesReady: false, // query would be disabled in reality
    });

    expect(result.ratesReady).toBe(true);
    expect(result.targetCurrencies).toEqual([]);
  });

  it("falls back to a generic icon/title when a category is missing from the index", () => {
    const result = computeCategoryAggregation({
      expenses: [
        mkExpense({
          categoryId: "cat:unknown",
          shares: [{ userId: USER, amount: 10 }],
        }),
      ],
      userId: USER,
      baseCurrency: "SGD",
      categoriesIndex: new Map(), // empty
      categoryFilters: [],
      pickedMonthKey: null,
      rates: {},
      ratesReady: true,
    });

    expect(result.byCategory[0]).toMatchObject({
      categoryId: "cat:unknown",
      emoji: "🏷️",
      title: "Unknown",
    });
  });

  it("treats null categoryId as the synthetic 'none' bucket with ❓ Uncategorized metadata", () => {
    const result = computeCategoryAggregation({
      expenses: [
        mkExpense({
          categoryId: null,
          shares: [{ userId: USER, amount: 10 }],
        }),
      ],
      userId: USER,
      baseCurrency: "SGD",
      categoriesIndex: baseIndex,
      categoryFilters: [],
      pickedMonthKey: null,
      rates: {},
      ratesReady: true,
    });

    expect(result.byCategory[0]).toMatchObject({
      categoryId: "none",
      emoji: "❓",
      title: "Uncategorized",
    });
  });

  it("keeps 'none' at the bottom when filters are applied and 'none' was explicitly selected", () => {
    const result = computeCategoryAggregation({
      expenses: [
        mkExpense({
          categoryId: "cat:food",
          shares: [{ userId: USER, amount: 10 }],
        }),
        mkExpense({
          categoryId: null,
          shares: [{ userId: USER, amount: 10 }],
        }),
      ],
      userId: USER,
      baseCurrency: "SGD",
      categoriesIndex: baseIndex,
      categoryFilters: ["none", "cat:food"], // user put "none" first in selection
      pickedMonthKey: null,
      rates: {},
      ratesReady: true,
    });

    // Even when user selected "none" first, it still sinks — consistent rule.
    expect(result.byCategory.map((c) => c.categoryId)).toEqual([
      "cat:food",
      "none",
    ]);
  });

  it("skips expenses whose foreign rate is missing instead of crashing", () => {
    const result = computeCategoryAggregation({
      expenses: [
        mkExpense({
          currency: "JPY",
          shares: [{ userId: USER, amount: 1000 }],
        }),
        mkExpense({
          currency: "SGD",
          shares: [{ userId: USER, amount: 20 }],
        }),
      ],
      userId: USER,
      baseCurrency: "SGD",
      categoriesIndex: baseIndex,
      categoryFilters: [],
      pickedMonthKey: null,
      rates: {}, // no JPY rate
      ratesReady: true,
    });

    // SGD portion contributes, JPY silently skipped.
    expect(result.baseTotal).toBe(20);
  });
});
