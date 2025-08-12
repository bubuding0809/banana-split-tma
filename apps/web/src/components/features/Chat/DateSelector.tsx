import { Section, Cell } from "@telegram-apps/telegram-ui";

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
    <Section>
      {monthGroupedData.length > 0 ? (
        monthGroupedData.map(({ monthKey, monthDisplay, dates }) => (
          <Cell
            key={monthKey}
            after={
              <select
                defaultValue=""
                onChange={(e) => onDateSelect(e.target.value)}
                className="appearance-none focus:outline-none"
              >
                <option value="">Select date...</option>
                {dates.map(({ key, display }) => (
                  <option key={key} value={key}>
                    {display}
                  </option>
                ))}
              </select>
            }
          >
            {monthDisplay}
          </Cell>
        ))
      ) : (
        <Cell>No months available</Cell>
      )}
    </Section>
  );
};

export default DateSelector;
