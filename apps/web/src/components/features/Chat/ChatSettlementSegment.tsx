import { Placeholder, Section, Subheadline } from "@telegram-apps/telegram-ui";
import { useMemo } from "react";

import { trpc } from "@utils/trpc";
import { getMonthYear, compareDatesDesc, formatMonthYear } from "@utils/date";
import ChatSettlementCell from "./ChatSettlementCell";
import { useSearch } from "@tanstack/react-router";

interface ChatSettlementSegmentProps {
  chatId: number;
}
const ChatSettlementSegment = ({ chatId }: ChatSettlementSegmentProps) => {
  const { selectedCurrency } = useSearch({
    from: "/_tma/chat/$chatId",
  });

  // * Queries ====================================================================================
  const { data: settlements } = trpc.settlement.getSettlementByChat.useQuery(
    {
      chatId,
      currency: selectedCurrency,
    },
    {
      enabled: !!selectedCurrency,
    }
  );

  // Allocate settlements into month buckets then sort them by date
  const { groupedSettlements, sortedKeys } = useMemo(() => {
    // Group settlements by year - month
    const groupedSettlements =
      settlements?.reduce(
        (acc, curr) => {
          const settlementDate = new Date(curr.date);
          const { month, year } = getMonthYear(settlementDate);

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
        {} as Record<string, typeof settlements>
      ) ?? {};

    // Sort settlements by date (descending)
    Object.entries(groupedSettlements).forEach(([key, value]) => {
      groupedSettlements[key] = value.sort((a, b) => {
        return compareDatesDesc(new Date(a.date), new Date(b.date));
      });
    });

    // Sort the keys (year-month) in descending order
    const sortedKeys = Object.keys(groupedSettlements).sort((a, b) => {
      return compareDatesDesc(new Date(a), new Date(b));
    });

    return {
      groupedSettlements,
      sortedKeys,
    };
  }, [settlements]);

  return (
    <>
      {settlements?.length === 0 && (
        <Placeholder
          header="No settlements yet"
          description="Add an settlement to keep track of your spendings"
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
        const settlements = groupedSettlements[key];
        const dateDisplay = formatMonthYear(new Date(key));

        return (
          <Section
            key={key}
            header={
              <div className="p-2">
                <Subheadline weight="2">{dateDisplay}</Subheadline>
              </div>
            }
          >
            {settlements.map((settlement) => (
              <ChatSettlementCell key={settlement.id} settlement={settlement} />
            ))}
          </Section>
        );
      })}
    </>
  );
};

export default ChatSettlementSegment;
