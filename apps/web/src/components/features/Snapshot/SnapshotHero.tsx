import { Cell, Info, Section, Text } from "@telegram-apps/telegram-ui";
import { formatCurrencyWithCode } from "@/utils/financial";
import { formatSnapshotDateRange } from "@/utils/date";
import type { SnapshotAggregations } from "./aggregations/computeSnapshotAggregations";

interface SnapshotHeroProps {
  aggregations: SnapshotAggregations;
}

/**
 * Single-cell hero matching the snapshot list-row layout used on the
 * snapshots index page: title + date range on the left, red user-share
 * total + expense count on the right. Trip total and creator avatar
 * are intentionally omitted — the user-share is the page's anchor.
 */
export function SnapshotHero({ aggregations }: SnapshotHeroProps) {
  const { details, baseCurrency, dateRange, userShareInBase } = aggregations;
  const expenseCount = details.expenses.length;

  const dateRangeText = dateRange
    ? formatSnapshotDateRange(dateRange.earliest, dateRange.latest)
    : "No expenses";

  return (
    <Section>
      <Cell
        after={
          <Info
            type="text"
            subtitle={`${expenseCount} ${
              expenseCount === 1 ? "Expense" : "Expenses"
            }`}
          >
            <Text weight="3" className="text-red-600">
              {formatCurrencyWithCode(userShareInBase, baseCurrency)}
            </Text>
          </Info>
        }
        description={dateRangeText}
      >
        <Text weight="2" className="text-lg">
          {details.title}
        </Text>
      </Cell>
    </Section>
  );
}
