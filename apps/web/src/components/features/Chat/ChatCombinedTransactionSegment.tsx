import { Placeholder, Section, Subheadline } from "@telegram-apps/telegram-ui";
import { useEffect } from "react";
import { initData, useSignal } from "@telegram-apps/sdk-react";

import { trpc } from "@utils/trpc";
import { formatMonthYear } from "@utils/date";

import ChatExpenseCell from "./ChatExpenseCell";
import ChatSettlementCell from "./ChatSettlementCell";
import { useSearch } from "@tanstack/react-router";
import { InView } from "react-intersection-observer";
import { useTransactionGrouping } from "@/hooks/useTransactionGrouping";

interface ChatCombinedTransactionSegmentProps {
  chatId: number;
  setSectionsInView: React.Dispatch<React.SetStateAction<string[]>>;
  showPayments: boolean;
  onAvailableDatesChange?: (
    monthsData: {
      monthKey: string;
      monthDisplay: string;
      dates: { key: string; display: string; transactionIds: string[] }[];
    }[]
  ) => void;
}

const ChatCombinedTransactionSegment = ({
  chatId,
  setSectionsInView,
  showPayments,
  onAvailableDatesChange,
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

  // Use the extracted transaction grouping hook
  const { groupedTransactions, sortedKeys, monthGroupedData } =
    useTransactionGrouping({
      expenses,
      settlements,
      showPayments,
      relatedOnly,
      userId,
    });

  // Update available dates when they change
  useEffect(() => {
    if (onAvailableDatesChange && monthGroupedData.length > 0) {
      onAvailableDatesChange(monthGroupedData);
    }
  }, [monthGroupedData, onAvailableDatesChange]);

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
            <div data-month-key={key}>
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
                      <div
                        key={`expense-${transaction.id}`}
                        data-transaction-id={transaction.id}
                      >
                        <ChatExpenseCell expense={transaction} />
                      </div>
                    );
                  } else {
                    return (
                      <div
                        key={`settlement-${transaction.id}`}
                        data-transaction-id={transaction.id}
                      >
                        <ChatSettlementCell settlement={transaction} />
                      </div>
                    );
                  }
                })}
              </Section>
            </div>
          </InView>
        );
      })}
    </>
  );
};

export default ChatCombinedTransactionSegment;
