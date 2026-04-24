import { resolveCategory } from "@repo/categories";
import type { RouterOutputs } from "@dko/trpc";

type SnapshotDetails = RouterOutputs["snapshot"]["getDetails"];

type ChatCategory = { id: string; emoji: string; title: string };

type NormalizedExpense = {
  id: string;
  description: string;
  date: Date;
  amountInBase: number;
  currency: string;
  payerId: number;
  payer: { id: number; firstName: string };
  categoryKey: string;
  categoryEmoji: string;
  categoryTitle: string;
};

export type CategoryGroup = {
  key: string;
  emoji: string;
  title: string;
  totalInBase: number;
  items: NormalizedExpense[];
};

export type DateGroup = {
  key: string;
  date: Date;
  totalInBase: number;
  items: NormalizedExpense[];
};

export type PayerGroup = {
  payerId: number;
  payer: { id: number; firstName: string };
  totalInBase: number;
  items: NormalizedExpense[];
};

export type SnapshotAggregations = {
  details: SnapshotDetails;
  baseCurrency: string;
  totalInBase: number;
  dateRange: { earliest: Date; latest: Date } | null;
  userShareInBase: number;
  byCategory: CategoryGroup[];
  byDate: DateGroup[];
  byPayer: PayerGroup[];
};

type ComputeArgs = {
  details: SnapshotDetails;
  rates: Record<string, { rate: number }>;
  baseCurrency: string;
  currentUserId: number;
  chatCategories: ChatCategory[];
};

const dayKey = (d: Date): string =>
  `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

const dayDate = (d: Date): Date => {
  const normalized = new Date(d);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};

export function computeSnapshotAggregations({
  details,
  rates,
  baseCurrency,
  currentUserId,
  chatCategories,
}: ComputeArgs): SnapshotAggregations {
  const normalized: NormalizedExpense[] = [];
  let totalInBase = 0;
  let userShareInBase = 0;

  for (const expense of details.expenses) {
    const rate =
      expense.currency === baseCurrency
        ? 1
        : (rates[expense.currency]?.rate ?? 1);
    const amountInBase = Number(expense.amount) / rate;
    totalInBase += amountInBase;

    const userShare = expense.shares.find((s) => s.userId === currentUserId);
    if (userShare?.amount != null) {
      userShareInBase += Number(userShare.amount) / rate;
    }

    const resolved = resolveCategory(expense.categoryId, chatCategories);
    normalized.push({
      id: expense.id,
      description: expense.description,
      date: new Date(expense.date),
      amountInBase,
      currency: expense.currency,
      payerId: expense.payerId,
      payer: expense.payer,
      categoryKey: resolved?.id ?? "__none__",
      categoryEmoji: resolved?.emoji ?? "❓",
      categoryTitle: resolved?.title ?? "Uncategorized",
    });
  }

  const dateRange = normalized.length
    ? {
        earliest: new Date(
          Math.min(...normalized.map((e) => e.date.getTime()))
        ),
        latest: new Date(Math.max(...normalized.map((e) => e.date.getTime()))),
      }
    : null;

  // Group by category — sorted desc by total; items sorted date desc
  const catMap = new Map<string, CategoryGroup>();
  for (const item of normalized) {
    const existing = catMap.get(item.categoryKey);
    if (existing) {
      existing.items.push(item);
      existing.totalInBase += item.amountInBase;
    } else {
      catMap.set(item.categoryKey, {
        key: item.categoryKey,
        emoji: item.categoryEmoji,
        title: item.categoryTitle,
        totalInBase: item.amountInBase,
        items: [item],
      });
    }
  }
  const byCategory = [...catMap.values()].sort(
    (a, b) => b.totalInBase - a.totalInBase
  );
  for (const g of byCategory) {
    g.items.sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  // Group by calendar day — sorted asc; items sorted amount desc
  const dateMap = new Map<string, DateGroup>();
  for (const item of normalized) {
    const key = dayKey(item.date);
    const existing = dateMap.get(key);
    if (existing) {
      existing.items.push(item);
      existing.totalInBase += item.amountInBase;
    } else {
      dateMap.set(key, {
        key,
        date: dayDate(item.date),
        totalInBase: item.amountInBase,
        items: [item],
      });
    }
  }
  const byDate = [...dateMap.values()].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );
  for (const g of byDate) {
    g.items.sort((a, b) => b.amountInBase - a.amountInBase);
  }

  // Group by payer — sorted desc by total; items sorted date desc
  const payerMap = new Map<number, PayerGroup>();
  for (const item of normalized) {
    const existing = payerMap.get(item.payerId);
    if (existing) {
      existing.items.push(item);
      existing.totalInBase += item.amountInBase;
    } else {
      payerMap.set(item.payerId, {
        payerId: item.payerId,
        payer: item.payer,
        totalInBase: item.amountInBase,
        items: [item],
      });
    }
  }
  const byPayer = [...payerMap.values()].sort(
    (a, b) => b.totalInBase - a.totalInBase
  );
  for (const g of byPayer) {
    g.items.sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  return {
    details,
    baseCurrency,
    totalInBase,
    dateRange,
    userShareInBase,
    byCategory,
    byDate,
    byPayer,
  };
}
