import { useMemo } from "react";
import { trpc } from "@/utils/trpc";
import { initData, useSignal } from "@telegram-apps/sdk-react";
import {
  computeSnapshotAggregations,
  type SnapshotAggregations,
} from "../aggregations/computeSnapshotAggregations";

type UseSnapshotAggregationsResult = {
  status: "pending" | "success" | "error";
  error: unknown;
  /** null while any required query is loading or errored */
  aggregations: SnapshotAggregations | null;
};

export function useSnapshotAggregations(
  snapshotId: string,
  options: { enabled?: boolean } = {}
): UseSnapshotAggregationsResult {
  const enabled = options.enabled ?? true;
  const tUser = useSignal(initData.user);
  const currentUserId = tUser?.id ?? 0;

  const detailsQuery = trpc.snapshot.getDetails.useQuery(
    { snapshotId },
    { enabled }
  );

  const chatId = detailsQuery.data?.chatId ?? 0;

  const chatQuery = trpc.chat.getChat.useQuery(
    { chatId },
    { enabled: enabled && !!chatId }
  );
  const categoriesQuery = trpc.category.listByChat.useQuery(
    { chatId },
    { enabled: enabled && !!chatId }
  );

  const baseCurrency = chatQuery.data?.baseCurrency ?? "SGD";

  const foreignCurrencies = useMemo(() => {
    if (!detailsQuery.data) return [];
    return Array.from(
      new Set(detailsQuery.data.expenses.map((e) => e.currency))
    ).filter((c) => c !== baseCurrency);
  }, [detailsQuery.data, baseCurrency]);

  const ratesQuery = trpc.currency.getMultipleRates.useQuery(
    { baseCurrency, targetCurrencies: foreignCurrencies },
    { enabled: enabled && !!baseCurrency && foreignCurrencies.length > 0 }
  );

  const aggregations = useMemo<SnapshotAggregations | null>(() => {
    if (!detailsQuery.data || !chatQuery.data || !categoriesQuery.data) {
      return null;
    }
    if (foreignCurrencies.length > 0 && ratesQuery.status !== "success") {
      return null;
    }

    const chatCategories =
      categoriesQuery.data.items
        .filter((c) => c.kind === "custom")
        .map((c) => ({
          id: c.id.replace(/^chat:/, ""),
          emoji: c.emoji,
          title: c.title,
        })) ?? [];

    return computeSnapshotAggregations({
      details: detailsQuery.data,
      rates: ratesQuery.data?.rates ?? {},
      baseCurrency,
      currentUserId,
      chatCategories,
    });
  }, [
    detailsQuery.data,
    chatQuery.data,
    categoriesQuery.data,
    foreignCurrencies,
    ratesQuery.status,
    ratesQuery.data?.rates,
    baseCurrency,
    currentUserId,
  ]);

  // Derive status from data-presence, not per-query status. Disabled React Query
  // queries report "pending" indefinitely, so checking .status directly would
  // make the hook stuck in "pending" any time a dependent query is gated off.
  // If aggregations is non-null, every required input has arrived.
  const errorAny =
    detailsQuery.status === "error" ||
    chatQuery.status === "error" ||
    categoriesQuery.status === "error" ||
    (foreignCurrencies.length > 0 && ratesQuery.status === "error");

  return {
    status: errorAny ? "error" : aggregations !== null ? "success" : "pending",
    error:
      detailsQuery.error ??
      chatQuery.error ??
      categoriesQuery.error ??
      ratesQuery.error,
    aggregations,
  };
}
