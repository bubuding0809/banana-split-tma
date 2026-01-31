import { useMemo } from "react";
import type { GroupedTransactions } from "@/types/transaction.types";
import {
  combineTransactions,
  filterRelatedTransactions,
  groupTransactionsByMonth,
  buildDateMap,
  type TransactionSortBy,
  type TransactionSortOrder,
} from "@/utils/transactionHelpers";

interface UseTransactionGroupingParams {
  expenses?: any[];
  settlements?: any[];
  showPayments: boolean;
  relatedOnly: boolean;
  userId: number;
  sortBy: TransactionSortBy;
  sortOrder: TransactionSortOrder;
}

interface UseTransactionGroupingReturn {
  groupedTransactions: GroupedTransactions;
  sortedKeys: string[];
  monthGroupedData: {
    monthKey: string;
    monthDisplay: string;
    dates: { key: string; display: string; transactionIds: string[] }[];
  }[];
}

/**
 * Hook for processing and grouping transaction data
 */
export const useTransactionGrouping = ({
  expenses,
  settlements,
  showPayments,
  relatedOnly,
  userId,
  sortBy,
  sortOrder,
}: UseTransactionGroupingParams): UseTransactionGroupingReturn => {
  // Combine and group transactions by month buckets then sort them by the sortBy field
  const { groupedTransactions, sortedKeys } = useMemo(() => {
    // Combine expenses and settlements into a single array with type indicators
    let combinedTransactions = combineTransactions(
      expenses,
      settlements,
      showPayments
    );

    // Filter by related transactions if relatedOnly is true
    if (relatedOnly) {
      combinedTransactions = filterRelatedTransactions(
        combinedTransactions,
        userId
      );
    }

    return groupTransactionsByMonth(combinedTransactions, sortBy, sortOrder);
  }, [
    expenses,
    settlements,
    showPayments,
    relatedOnly,
    userId,
    sortBy,
    sortOrder,
  ]);

  // Extract available dates grouped by months from all combined transactions
  const monthGroupedData = useMemo(() => {
    // Get all transactions from the combined array (same filtering as above)
    let combinedTransactions = combineTransactions(
      expenses,
      settlements,
      showPayments
    );

    // Filter by related transactions if relatedOnly is true (same logic as above)
    if (relatedOnly) {
      combinedTransactions = filterRelatedTransactions(
        combinedTransactions,
        userId
      );
    }

    return buildDateMap(combinedTransactions, sortBy, sortOrder);
  }, [
    expenses,
    settlements,
    showPayments,
    relatedOnly,
    userId,
    sortBy,
    sortOrder,
  ]);

  return {
    groupedTransactions,
    sortedKeys,
    monthGroupedData,
  };
};
