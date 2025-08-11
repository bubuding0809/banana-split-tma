import { Placeholder, Section, Subheadline } from "@telegram-apps/telegram-ui";
import { useMemo } from "react";
import { initData, useSignal } from "@telegram-apps/sdk-react";

import { trpc } from "@utils/trpc";
import { getMonthYear, compareDatesDesc, formatMonthYear } from "@utils/date";

import ChatExpenseCell from "./ChatExpenseCell";
import ChatSettlementCell from "./ChatSettlementCell";
import { useSearch } from "@tanstack/react-router";
import { InView } from "react-intersection-observer";
import type {
  CombinedTransaction,
  GroupedTransactions,
} from "@/types/transaction.types";

interface ChatCombinedTransactionSegmentProps {
  chatId: number;
  setSectionsInView: React.Dispatch<React.SetStateAction<string[]>>;
  showPayments: boolean;
}

const ChatCombinedTransactionSegment = ({
  chatId,
  setSectionsInView,
  showPayments,
}: ChatCombinedTransactionSegmentProps) => {
  // * Hooks =======================================================================================
  const { selectedCurrency, relatedOnly } = useSearch({
    from: "/_tma/chat/$chatId",
  });
  const tUserData = useSignal(initData.user);
  const userId = tUserData?.id ?? 0;

  // * Queries =====================================================================================
  const { data: expenses, isLoading: isExpensesLoading } =
    trpc.expense.getExpenseByChat.useQuery(
      {
        chatId,
        currency: selectedCurrency,
      },
      {
        enabled: !!selectedCurrency,
      }
    );

  const { data: settlements, isLoading: isSettlementsLoading } =
    trpc.settlement.getSettlementByChat.useQuery(
      {
        chatId,
        currency: selectedCurrency,
      },
      {
        enabled: !!selectedCurrency,
      }
    );

  const isLoading = isExpensesLoading || isSettlementsLoading;

  // Combine and group transactions by month buckets then sort them by date
  const { groupedTransactions, sortedKeys } = useMemo(() => {
    // Helper function to check if a transaction is related to the current user
    const isTransactionRelated = (
      transaction: CombinedTransaction
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
        return (
          transaction.senderId === userId || transaction.receiverId === userId
        );
      }
    };
    // Combine expenses and settlements into a single array with type indicators
    let combinedTransactions: CombinedTransaction[] = [
      ...(expenses?.map((expense) => ({
        ...expense,
        type: "expense" as const,
      })) || []),
      ...(showPayments
        ? settlements?.map((settlement) => ({
            ...settlement,
            type: "settlement" as const,
          })) || []
        : []),
    ];

    // Filter by related transactions if relatedOnly is true
    if (relatedOnly) {
      combinedTransactions = combinedTransactions.filter(isTransactionRelated);
    }

    // Group transactions by year - month
    const groupedTransactions: GroupedTransactions =
      combinedTransactions.reduce((acc, curr) => {
        const transactionDate = new Date(curr.createdAt);
        const { month, year } = getMonthYear(transactionDate);

        // Format: YYYY-MM (month is 0-indexed from getMonth)
        const key = `${year}-${(month + 1).toString().padStart(2, "0")}`;

        if (!acc[key]) {
          acc[key] = [];
        }

        acc[key].push(curr);

        return acc;
      }, {} as GroupedTransactions);

    // Sort transactions within each group by date (descending)
    Object.entries(groupedTransactions).forEach(([key, value]) => {
      groupedTransactions[key] = value.sort((a, b) => {
        return compareDatesDesc(new Date(a.createdAt), new Date(b.createdAt));
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
  }, [expenses, settlements, showPayments, relatedOnly, userId]);

  const handleSectionViewChange = (view: boolean, key: string) => {
    if (view) {
      setSectionsInView((prev) => [...prev, key]);
    } else {
      setSectionsInView((prev) => prev.filter((k) => k !== key));
    }
  };

  // Check if both arrays are empty (not loading and no data)
  const hasNoTransactions =
    !isLoading && (expenses?.length || 0) + (settlements?.length || 0) === 0;

  return (
    <>
      {hasNoTransactions && (
        <Placeholder
          header="No transactions yet"
          description="Add an expense or settlement to keep track of your transactions"
        >
          <img
            alt="Telegram sticker"
            src="https://xelene.me/telegram.gif"
            style={{
              display: "block",
              height: "144px",
              width: "144px",
            }}
          />
        </Placeholder>
      )}

      {sortedKeys.map((key) => {
        const transactions = groupedTransactions[key];
        const dateDisplay = formatMonthYear(new Date(key));

        return (
          <InView
            key={key}
            onChange={(view) => handleSectionViewChange(view, key)}
          >
            <Section
              header={
                <div className="p-2">
                  <Subheadline weight="2">{dateDisplay}</Subheadline>
                </div>
              }
            >
              {transactions.map((transaction) => {
                if (transaction.type === "expense") {
                  return (
                    <ChatExpenseCell
                      key={`expense-${transaction.id}`}
                      expense={transaction}
                    />
                  );
                } else {
                  return (
                    <ChatSettlementCell
                      key={`settlement-${transaction.id}`}
                      settlement={transaction}
                    />
                  );
                }
              })}
            </Section>
          </InView>
        );
      })}
    </>
  );
};

export default ChatCombinedTransactionSegment;
