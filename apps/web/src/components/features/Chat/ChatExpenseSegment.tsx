import { Placeholder, Section, Subheadline } from "@telegram-apps/telegram-ui";
import { useMemo } from "react";

import { trpc } from "@utils/trpc";
import { getMonthYear, compareDatesDesc, formatMonthYear } from "@utils/date";

import ChatExpenseCell from "./ChatExpenseCell";
import { useSearch } from "@tanstack/react-router";
import { InView } from "react-intersection-observer";

interface ChatExpenseSegmentProps {
  chatId: number;
  setSectionsInView: React.Dispatch<React.SetStateAction<string[]>>;
}
const ChatExpenseSegment = ({
  chatId,
  setSectionsInView,
}: ChatExpenseSegmentProps) => {
  // * Hooks =======================================================================================
  const { selectedCurrency } = useSearch({
    from: "/_tma/chat/$chatId",
  });

  // * Queries =====================================================================================
  const { data: expenses } = trpc.expense.getExpenseByChat.useQuery(
    {
      chatId,
      currency: selectedCurrency,
    },
    {
      enabled: !!selectedCurrency,
    }
  );

  // Allocate expenses into month buckets then sort them by date
  const { groupedExpenses, sortedKeys } = useMemo(() => {
    // Group expenses by year - month
    const groupedExpenses =
      expenses?.reduce(
        (acc, curr) => {
          const expenseDate = new Date(curr.date);
          const { month, year } = getMonthYear(expenseDate);

          // Format: YYYY-MM (month is 0-indexed from getMonth)
          const key = `${year}-${(month + 1).toString().padStart(2, "0")}`;

          if (!acc[key]) {
            acc[key] = [];
          }

          acc[key].push({
            ...curr,
          });

          return acc;
        },
        {} as Record<string, typeof expenses>
      ) ?? {};

    // Sort expenses by date (descending)
    Object.entries(groupedExpenses).forEach(([key, value]) => {
      groupedExpenses[key] = value.sort((a, b) => {
        return compareDatesDesc(new Date(a.date), new Date(b.date));
      });
    });

    // Sort the keys (year-month) in descending order
    const sortedKeys = Object.keys(groupedExpenses).sort((a, b) => {
      return compareDatesDesc(new Date(a), new Date(b));
    });

    return {
      groupedExpenses,
      sortedKeys,
    };
  }, [expenses]);

  const handleSectionViewChange = (view: boolean, key: string) => {
    if (view) {
      setSectionsInView((prev) => [...prev, key]);
    } else {
      setSectionsInView((prev) => prev.filter((k) => k !== key));
    }
  };

  return (
    <div>
      {expenses?.length === 0 && (
        <Placeholder
          header="No expenses yet"
          description="Add an expense to keep track of your spendings"
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
        const expenses = groupedExpenses[key];
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
              {expenses.map((expense) => (
                <ChatExpenseCell key={expense.id} expense={expense} />
              ))}
            </Section>
          </InView>
        );
      })}
    </div>
  );
};

export default ChatExpenseSegment;
