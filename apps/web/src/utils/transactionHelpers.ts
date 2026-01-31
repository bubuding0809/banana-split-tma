import {
  getMonthYear,
  compareDatesDesc,
  formatMonthYear,
  formatJumpToDate,
  formatDateKey,
} from "@/utils/date";
import type {
  CombinedTransaction,
  GroupedTransactions,
} from "@/types/transaction.types";
import type { RouterOutputs } from "@dko/trpc";

export type TransactionSortBy = "date" | "createdAt";

/**
 * Get the date value to use for sorting based on sortBy option
 */
const getTransactionSortDate = (
  transaction: CombinedTransaction,
  sortBy: TransactionSortBy
): Date => {
  return new Date(sortBy === "date" ? transaction.date : transaction.createdAt);
};

/**
 * Check if a transaction is related to the current user
 */
export const isTransactionRelated = (
  transaction: CombinedTransaction,
  userId: number
): boolean => {
  if (transaction.type === "expense") {
    // For expenses: user is related if they are the payer OR have shares
    return (
      transaction.payerId === userId ||
      transaction.shares?.some((share) => share.userId === userId) ||
      false
    );
  } else {
    // For settlements: user is related if they are sender or receiver
    return transaction.senderId === userId || transaction.receiverId === userId;
  }
};

/**
 * Filter transactions to only include those related to the user
 */
export const filterRelatedTransactions = (
  transactions: CombinedTransaction[],
  userId: number
): CombinedTransaction[] => {
  return transactions.filter((transaction) =>
    isTransactionRelated(transaction, userId)
  );
};

/**
 * Combine expenses and settlements into a single transaction array
 */
export const combineTransactions = (
  expenses: any[] = [],
  settlements: any[] = [],
  showPayments: boolean
): CombinedTransaction[] => {
  const expenseTransactions: CombinedTransaction[] = expenses.map(
    (expense) => ({
      ...expense,
      type: "expense" as const,
    })
  );

  const settlementTransactions: CombinedTransaction[] = showPayments
    ? settlements.map((settlement) => ({
        ...settlement,
        type: "settlement" as const,
      }))
    : [];

  return [...expenseTransactions, ...settlementTransactions];
};

/**
 * Group transactions by month buckets
 */
export const groupTransactionsByMonth = (
  transactions: CombinedTransaction[],
  sortBy: TransactionSortBy = "date"
): { groupedTransactions: GroupedTransactions; sortedKeys: string[] } => {
  // Group transactions by year-month based on the sortBy field
  const groupedTransactions: GroupedTransactions = transactions.reduce(
    (acc, curr) => {
      const transactionDate = getTransactionSortDate(curr, sortBy);
      const { month, year } = getMonthYear(transactionDate);

      // Format: YYYY-MM (month is 0-indexed from getMonth)
      const key = `${year}-${(month + 1).toString().padStart(2, "0")}`;

      if (!acc[key]) {
        acc[key] = [];
      }

      acc[key].push(curr);

      return acc;
    },
    {} as GroupedTransactions
  );

  // Sort transactions within each group by the sortBy field (descending)
  Object.entries(groupedTransactions).forEach(([key, value]) => {
    groupedTransactions[key] = value.sort((a, b) => {
      return compareDatesDesc(
        getTransactionSortDate(a, sortBy),
        getTransactionSortDate(b, sortBy)
      );
    });
  });

  // Sort the keys (year-month) in descending order
  const sortedKeys = Object.keys(groupedTransactions).sort((a, b) => {
    return compareDatesDesc(new Date(a), new Date(b));
  });

  return {
    groupedTransactions,
    sortedKeys,
  };
};

/**
 * Build a date map for jump-to-date functionality
 */
export const buildDateMap = (
  transactions: CombinedTransaction[],
  sortBy: TransactionSortBy = "date"
): {
  monthKey: string;
  monthDisplay: string;
  dates: { key: string; display: string; transactionIds: string[] }[];
}[] => {
  const dateMap = new Map<
    string,
    { display: string; transactionIds: string[] }
  >();

  // Sort transactions by the sortBy field (most recent first) to ensure correct transactionIds ordering
  const sortedTransactions = transactions.sort((a, b) =>
    compareDatesDesc(
      getTransactionSortDate(a, sortBy),
      getTransactionSortDate(b, sortBy)
    )
  );

  // Group by date and collect transaction IDs (now in correct order)
  sortedTransactions.forEach((transaction) => {
    const sortDate = getTransactionSortDate(transaction, sortBy);
    const dateKey = formatDateKey(sortDate);
    const dateDisplay = formatJumpToDate(sortDate);

    if (!dateMap.has(dateKey)) {
      dateMap.set(dateKey, { display: dateDisplay, transactionIds: [] });
    }
    dateMap.get(dateKey)!.transactionIds.push(String(transaction.id));
  });

  // Convert to array of dates
  const allDates = Array.from(dateMap.entries())
    .map(([key, data]) => ({
      key,
      display: data.display,
      transactionIds: data.transactionIds,
    }))
    .sort((a, b) => compareDatesDesc(new Date(a.key), new Date(b.key)));

  // Group dates by months
  const monthMap = new Map<
    string,
    { display: string; dates: typeof allDates }
  >();

  allDates.forEach((date) => {
    const monthKey = date.key.substring(0, 7); // YYYY-MM
    const monthDisplay = formatMonthYear(new Date(monthKey + "-01"));

    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, { display: monthDisplay, dates: [] });
    }
    monthMap.get(monthKey)!.dates.push(date);
  });

  // Convert to array and sort months by date (most recent first)
  return Array.from(monthMap.entries())
    .map(([monthKey, data]) => ({
      monthKey,
      monthDisplay: data.display,
      dates: data.dates, // Already sorted above
    }))
    .sort((a, b) =>
      compareDatesDesc(new Date(a.monthKey), new Date(b.monthKey))
    );
};

/**
 * Build a date map for expense jump-to-date functionality
 */
export const buildExpenseDateMap = (
  expenses: RouterOutputs["expense"]["getExpenseByChat"],
  sortBy: TransactionSortBy = "date"
): {
  monthKey: string;
  monthDisplay: string;
  dates: { key: string; display: string; expenseIds: string[] }[];
}[] => {
  const dateMap = new Map<string, { display: string; expenseIds: string[] }>();

  // Sort expenses by the sortBy field (most recent first) to ensure correct expenseIds ordering
  const sortedExpenses = expenses.sort((a, b) =>
    compareDatesDesc(
      new Date(sortBy === "date" ? a.date : a.createdAt),
      new Date(sortBy === "date" ? b.date : b.createdAt)
    )
  );

  // Group by date and collect expense IDs (now in correct order)
  sortedExpenses.forEach((expense) => {
    const sortDate = new Date(
      sortBy === "date" ? expense.date : expense.createdAt
    );
    const dateKey = formatDateKey(sortDate);
    const dateDisplay = formatJumpToDate(sortDate);

    if (!dateMap.has(dateKey)) {
      dateMap.set(dateKey, { display: dateDisplay, expenseIds: [] });
    }
    dateMap.get(dateKey)!.expenseIds.push(expense.id);
  });

  // Convert to array of dates
  const allDates = Array.from(dateMap.entries())
    .map(([key, data]) => ({
      key,
      display: data.display,
      expenseIds: data.expenseIds,
    }))
    .sort((a, b) => compareDatesDesc(new Date(a.key), new Date(b.key)));

  // Group dates by months
  const monthMap = new Map<
    string,
    { display: string; dates: typeof allDates }
  >();

  allDates.forEach((date) => {
    const monthKey = date.key.substring(0, 7); // YYYY-MM
    const monthDisplay = formatMonthYear(new Date(monthKey + "-01"));

    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, { display: monthDisplay, dates: [] });
    }
    monthMap.get(monthKey)!.dates.push(date);
  });

  // Convert to array and sort months by date (most recent first)
  return Array.from(monthMap.entries())
    .map(([monthKey, data]) => ({
      monthKey,
      monthDisplay: data.display,
      dates: data.dates, // Already sorted above
    }))
    .sort((a, b) =>
      compareDatesDesc(new Date(a.monthKey), new Date(b.monthKey))
    );
};
