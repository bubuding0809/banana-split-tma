import { useMemo } from "react";
import { format, getMonth, getYear } from "date-fns";

export type TickerExpense = {
  id: string;
  date: Date;
  currency: string;
  amount: number;
  categoryId: string | null;
  payerId: number;
  shares: { userId: number; amount: number }[];
};

export type CurrencyBreakdown = {
  currency: string;
  amount: number;
};

export type CategoryAggregate = {
  categoryId: string;
  emoji: string;
  title: string;
  baseTotal: number;
  needsConversion: boolean;
  byCurrency: CurrencyBreakdown[];
};

export type MonthSummary = {
  monthKey: string;
  monthDisplay: string;
  baseTotal: number;
  needsConversion: boolean;
};

export type AggregationResult = {
  monthKey: string | null;
  baseTotal: number;
  needsConversion: boolean;
  byCategory: CategoryAggregate[];
  targetCurrencies: string[];
  monthList: MonthSummary[];
  ratesReady: boolean;
  empty: boolean;
};

export type ComputeCategoryAggregationInput = {
  expenses: TickerExpense[];
  userId: number;
  baseCurrency: string;
  categoriesIndex: Map<string, { emoji: string; title: string }>;
  categoryFilters: string[];
  pickedMonthKey: string | null;
  rates: Record<string, { rate: number }>;
  ratesReady: boolean;
};

const UNCATEGORIZED_ID = "none";
const UNCATEGORIZED_META = { emoji: "📭", title: "Uncategorized" } as const;
const UNKNOWN_META = { emoji: "🏷️", title: "Unknown" } as const;

function formatMonthKey(date: Date): string {
  return `${getYear(date)}-${(getMonth(date) + 1).toString().padStart(2, "0")}`;
}

function convertToBase(
  amount: number,
  currency: string,
  baseCurrency: string,
  rates: Record<string, { rate: number }>
): number | null {
  if (currency === baseCurrency) return amount;
  const rateInfo = rates[currency];
  if (!rateInfo) return null;
  return amount / rateInfo.rate;
}

/**
 * Pure aggregation over expenses for the ticker. Exported separately from the
 * hook so it can be unit-tested without a React render.
 *
 * Semantics:
 * - "Personal share" = the share row where userId matches the current user.
 *   Expenses the user isn't a share of (sponsor case) contribute 0 and are
 *   dropped entirely.
 * - `ratesReady` short-circuits to true when there are no foreign currencies,
 *   regardless of the input flag — matches how the FX query is disabled.
 * - Single-currency base-only categories still include their native breakdown
 *   in `byCurrency`; the renderer decides whether to show the line.
 */
export function computeCategoryAggregation(
  input: ComputeCategoryAggregationInput
): AggregationResult {
  const {
    expenses,
    userId,
    baseCurrency,
    categoriesIndex,
    categoryFilters,
    pickedMonthKey,
    rates,
    ratesReady: ratesReadyFlag,
  } = input;

  // 1. Project expenses to the user-share + pre-computed keys.
  type Row = {
    _userShare: number;
    _monthKey: string;
    _resolvedCatId: string;
    currency: string;
    date: Date;
  };
  const rows: Row[] = [];
  for (const e of expenses) {
    const share = e.shares.find((s) => s.userId === userId);
    if (!share) continue; // sponsor case — drop
    rows.push({
      _userShare: share.amount,
      _monthKey: formatMonthKey(e.date),
      _resolvedCatId: e.categoryId ?? UNCATEGORIZED_ID,
      currency: e.currency,
      date: e.date,
    });
  }

  // 2. Apply category-chip scope.
  const filterSet =
    categoryFilters.length > 0 ? new Set(categoryFilters) : null;
  const filtered = filterSet
    ? rows.filter((r) => filterSet.has(r._resolvedCatId))
    : rows;

  // 3. Collect target currencies.
  const targetCurrencies: string[] = [];
  {
    const seen = new Set<string>();
    for (const r of filtered) {
      if (r.currency !== baseCurrency && !seen.has(r.currency)) {
        seen.add(r.currency);
        targetCurrencies.push(r.currency);
      }
    }
  }

  // When nothing needs converting, treat rates as ready regardless of the flag.
  const ratesReady = targetCurrencies.length === 0 || ratesReadyFlag;

  // 4. Build monthList buckets.
  type MonthBucket = {
    rows: Row[];
    baseTotal: number;
    hasForeign: boolean;
  };
  const monthMap = new Map<string, MonthBucket>();
  for (const r of filtered) {
    let bucket = monthMap.get(r._monthKey);
    if (!bucket) {
      bucket = { rows: [], baseTotal: 0, hasForeign: false };
      monthMap.set(r._monthKey, bucket);
    }
    bucket.rows.push(r);
    if (r.currency !== baseCurrency) bucket.hasForeign = true;
  }

  // Warn once per missing currency to keep dev noise low on repeated renders.
  const warnedCurrencies = new Set<string>();

  function addToBase(acc: number, r: Row): number {
    const converted = convertToBase(
      r._userShare,
      r.currency,
      baseCurrency,
      rates
    );
    if (converted === null) {
      if (!warnedCurrencies.has(r.currency)) {
        warnedCurrencies.add(r.currency);

        console.warn(
          `[CategoryAggregationTicker] Missing FX rate for ${r.currency} → ${baseCurrency}; expense skipped.`
        );
      }
      return acc;
    }
    return acc + converted;
  }

  for (const bucket of monthMap.values()) {
    bucket.baseTotal = bucket.rows.reduce(addToBase, 0);
  }

  const monthList: MonthSummary[] = Array.from(monthMap.entries())
    .map(([monthKey, b]) => ({
      monthKey,
      // monthKey is "YYYY-MM"; parse as first-of-month to get a display label.
      monthDisplay: format(new Date(`${monthKey}-01T00:00:00`), "MMM yyyy"),
      baseTotal: b.baseTotal,
      needsConversion: b.hasForeign,
    }))
    .sort((a, b) => (a.monthKey < b.monthKey ? 1 : -1));

  // 5. Resolve picked month.
  const effectiveMonthKey = pickedMonthKey ?? monthList[0]?.monthKey ?? null;
  const monthBucket = effectiveMonthKey
    ? monthMap.get(effectiveMonthKey)
    : undefined;

  // 6. Per-category aggregation inside the picked month.
  type CatState = {
    byCurrencyMap: Map<string, number>;
    hasForeign: boolean;
    rows: Row[];
  };
  const catMap = new Map<string, CatState>();
  for (const r of monthBucket?.rows ?? []) {
    let s = catMap.get(r._resolvedCatId);
    if (!s) {
      s = { byCurrencyMap: new Map(), hasForeign: false, rows: [] };
      catMap.set(r._resolvedCatId, s);
    }
    s.rows.push(r);
    s.byCurrencyMap.set(
      r.currency,
      (s.byCurrencyMap.get(r.currency) ?? 0) + r._userShare
    );
    if (r.currency !== baseCurrency) s.hasForeign = true;
  }

  const catArray: CategoryAggregate[] = [];
  for (const [catId, s] of catMap) {
    const meta =
      catId === UNCATEGORIZED_ID
        ? UNCATEGORIZED_META
        : (categoriesIndex.get(catId) ?? UNKNOWN_META);
    const baseTotal = s.rows.reduce(addToBase, 0);
    catArray.push({
      categoryId: catId,
      emoji: meta.emoji,
      title: meta.title,
      baseTotal,
      needsConversion: s.hasForeign,
      byCurrency: Array.from(s.byCurrencyMap.entries())
        .map(([currency, amount]) => ({ currency, amount }))
        .sort((a, b) => b.amount - a.amount),
    });
  }

  // 7. Ordering.
  let byCategory: CategoryAggregate[];
  if (categoryFilters.length > 0) {
    const orderIndex = new Map(categoryFilters.map((id, i) => [id, i]));
    byCategory = [...catArray].sort((a, b) => {
      // "none" always sinks, regardless of whether it was selected.
      if (
        a.categoryId === UNCATEGORIZED_ID &&
        b.categoryId !== UNCATEGORIZED_ID
      )
        return 1;
      if (
        b.categoryId === UNCATEGORIZED_ID &&
        a.categoryId !== UNCATEGORIZED_ID
      )
        return -1;
      return (
        (orderIndex.get(a.categoryId) ?? Number.POSITIVE_INFINITY) -
        (orderIndex.get(b.categoryId) ?? Number.POSITIVE_INFINITY)
      );
    });
  } else {
    byCategory = [...catArray].sort((a, b) => {
      if (
        a.categoryId === UNCATEGORIZED_ID &&
        b.categoryId !== UNCATEGORIZED_ID
      )
        return 1;
      if (
        b.categoryId === UNCATEGORIZED_ID &&
        a.categoryId !== UNCATEGORIZED_ID
      )
        return -1;
      return b.baseTotal - a.baseTotal;
    });
  }

  const empty = !monthBucket || monthBucket.rows.length === 0;

  return {
    monthKey: effectiveMonthKey,
    baseTotal: monthBucket?.baseTotal ?? 0,
    needsConversion: monthBucket?.hasForeign ?? false,
    byCategory,
    targetCurrencies,
    monthList,
    ratesReady,
    empty,
  };
}

export function useCategoryAggregation(
  input: ComputeCategoryAggregationInput
): AggregationResult {
  return useMemo(
    () => computeCategoryAggregation(input),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      input.expenses,
      input.userId,
      input.baseCurrency,
      input.categoriesIndex,
      input.categoryFilters,
      input.pickedMonthKey,
      input.rates,
      input.ratesReady,
    ]
  );
}
