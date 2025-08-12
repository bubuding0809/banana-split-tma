import { Section, Cell, Navigation, Badge } from "@telegram-apps/telegram-ui";
import { hapticFeedback } from "@telegram-apps/sdk-react";

interface DateData {
  key: string;
  display: string;
  transactionIds: string[];
}

interface MonthData {
  monthKey: string;
  monthDisplay: string;
  dates: DateData[];
}

interface DateSelectorProps {
  monthGroupedData: MonthData[];
  onDateSelect: (dateKey: string) => void;
}

const DateSelector = ({
  monthGroupedData,
  onDateSelect,
}: DateSelectorProps) => {
  return (
    <Section header="Choose via a month">
      {monthGroupedData.length > 0 ? (
        monthGroupedData.map(({ monthKey, monthDisplay, dates }) => {
          return (
            <Cell
              Component="label"
              key={monthKey}
              htmlFor={`select-${monthKey}`}
              after={
                <div className="relative">
                  <select
                    id={`select-${monthKey}`}
                    onChange={(e) => {
                      onDateSelect(e.target.value);
                      hapticFeedback.impactOccurred("medium");
                    }}
                    className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                  >
                    <option>Select a date</option>
                    {dates.map(({ key, display }) => (
                      <option key={key} value={key}>
                        {display}
                      </option>
                    ))}
                  </select>

                  <Navigation>
                    <Badge type="number">{dates.length}</Badge>
                  </Navigation>
                </div>
              }
            >
              {monthDisplay}
            </Cell>
          );
        })
      ) : (
        <Cell>No months available</Cell>
      )}
    </Section>
  );
};

export default DateSelector;
