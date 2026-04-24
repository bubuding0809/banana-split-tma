import { Cell, Info, Section, Text, Caption } from "@telegram-apps/telegram-ui";
import { BarChart3, TrendingDown } from "lucide-react";
import { themeParams, useSignal } from "@telegram-apps/sdk-react";
import { formatCurrencyWithCode } from "@/utils/financial";
import { formatSnapshotDateRange } from "@/utils/date";
import type { SnapshotAggregations } from "./aggregations/computeSnapshotAggregations";

interface SnapshotHeroProps {
  aggregations: SnapshotAggregations;
  onYourShareClick?: () => void;
}

export function SnapshotHero({
  aggregations,
  onYourShareClick,
}: SnapshotHeroProps) {
  const { details, baseCurrency, totalInBase, dateRange, userShareInBase } =
    aggregations;
  const buttonColor = useSignal(themeParams.buttonColor) ?? "#5288c1";
  const expenseCount = details.expenses.length;

  const dateRangeText = dateRange
    ? formatSnapshotDateRange(dateRange.earliest, dateRange.latest)
    : "No expenses";

  const sharePercent =
    totalInBase > 0 && userShareInBase > 0
      ? Math.round((userShareInBase / totalInBase) * 100)
      : 0;

  return (
    <>
      <Section header="Overview">
        <Cell
          before={
            <span
              className="rounded-lg p-1.5"
              style={{ backgroundColor: buttonColor }}
            >
              <BarChart3 size={20} color="white" />
            </span>
          }
          subtitle={
            <Caption level="1" weight="3">
              {expenseCount} {expenseCount === 1 ? "expense" : "expenses"} ·{" "}
              {dateRangeText}
            </Caption>
          }
          after={
            <Info type="text" subtitle="Total">
              <Text weight="2">
                {formatCurrencyWithCode(totalInBase, baseCurrency)}
              </Text>
            </Info>
          }
        >
          <Text weight="2">{details.title}</Text>
        </Cell>
      </Section>

      {userShareInBase > 0 && (
        <Section header="Your share">
          <Cell
            before={
              <span className="rounded-lg bg-red-500 p-1.5">
                <TrendingDown size={20} color="white" />
              </span>
            }
            onClick={onYourShareClick}
            after={
              <Info
                type="text"
                subtitle={sharePercent > 0 ? `${sharePercent}%` : undefined}
              >
                <Text weight="2" className="text-red-600">
                  {formatCurrencyWithCode(userShareInBase, baseCurrency)}
                </Text>
              </Info>
            }
          >
            <Text weight="2">You spent</Text>
          </Cell>
        </Section>
      )}
    </>
  );
}
