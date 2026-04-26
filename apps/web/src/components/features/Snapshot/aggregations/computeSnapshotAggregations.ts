import { resolveCategory } from "@repo/categories";
import type { RouterOutputs } from "@dko/trpc";

type SnapshotDetails = RouterOutputs["snapshot"]["getDetails"];

type ChatCategory = { id: string; emoji: string; title: string };

type NormalizedExpense = {
  id: string;
  description: string;
  date: Date;
  amountInBase: number;
  /**
   * The current user's share for this expense in base currency.
   * `0` when the user is not a participant — such items are filtered
   * out of the per-group `items` arrays before they reach the views.
   */
  userShareInBase: number;
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
  /** Sum of the current user's share across `items`, in base currency. */
  totalInBase: number;
  /** Only expenses where `userShareInBase > 0`. */
  items: NormalizedExpense[];
};

export type DateGroup = {
  key: string;
  date: Date;
  /** Sum of the current user's share across `items`, in base currency. */
  totalInBase: number;
  /** Only expenses where `userShareInBase > 0`. */
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
  /**
   * Resolved category emoji for every expense in the snapshot — keyed
   * by expense id. Includes expenses the user has no share in, so
   * consumers like SnapshotDetailsModal can show the right emoji even
   * for rows that don't appear in the user-share-filtered `byCategory`.
   */
  categoryEmojiByExpenseId: Map<string, string>;
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
    const expenseUserShareInBase =
      userShare?.amount != null ? Number(userShare.amount) / rate : 0;
    userShareInBase += expenseUserShareInBase;

    const resolved = resolveCategory(expense.categoryId, chatCategories);
    normalized.push({
      id: expense.id,
      description: expense.description,
      date: new Date(expense.date),
      amountInBase,
      userShareInBase: expenseUserShareInBase,
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

  // Group by category — only includes expenses where the user has a
  // share. Group total = sum of user shares. Empty groups dropped.
  // Sorted desc by user-share total; items sorted date desc.
  const catMap = new Map<string, CategoryGroup>();
  for (const item of normalized) {
    if (item.userShareInBase <= 0) continue;
    const existing = catMap.get(item.categoryKey);
    if (existing) {
      existing.items.push(item);
      existing.totalInBase += item.userShareInBase;
    } else {
      catMap.set(item.categoryKey, {
        key: item.categoryKey,
        emoji: item.categoryEmoji,
        title: item.categoryTitle,
        totalInBase: item.userShareInBase,
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

  // Group by calendar day — only includes expenses where the user has
  // a share. Group total = sum of user shares. Empty days dropped.
  // Sorted asc by date; items sorted by user-share desc within a day.
  const dateMap = new Map<string, DateGroup>();
  for (const item of normalized) {
    if (item.userShareInBase <= 0) continue;
    const key = dayKey(item.date);
    const existing = dateMap.get(key);
    if (existing) {
      existing.items.push(item);
      existing.totalInBase += item.userShareInBase;
    } else {
      dateMap.set(key, {
        key,
        date: dayDate(item.date),
        totalInBase: item.userShareInBase,
        items: [item],
      });
    }
  }
  const byDate = [...dateMap.values()].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );
  for (const g of byDate) {
    g.items.sort((a, b) => b.userShareInBase - a.userShareInBase);
  }

  // Emoji lookup spans every expense in the snapshot, regardless of
  // whether the user has a share in it — needed by consumers (e.g.
  // SnapshotDetailsModal) that list the full expense set.
  const categoryEmojiByExpenseId = new Map<string, string>();
  for (const item of normalized) {
    categoryEmojiByExpenseId.set(item.id, item.categoryEmoji);
  }

  return {
    details,
    baseCurrency,
    totalInBase,
    dateRange,
    userShareInBase,
    byCategory,
    byDate,
    categoryEmojiByExpenseId,
  };
}
