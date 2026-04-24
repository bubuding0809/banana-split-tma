import {
  Cell,
  Chip,
  Section,
  Text,
  Caption,
  Title,
} from "@telegram-apps/telegram-ui";
import { UserRound } from "lucide-react";
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
  const expenseCount = details.expenses.length;

  const dateRangeText = dateRange
    ? formatSnapshotDateRange(dateRange.earliest, dateRange.latest)
    : "No expenses";

  return (
    <Section header={details.title}>
      <Cell
        multiline
        description={
          <Caption level="1" weight="3">
            {expenseCount} {expenseCount === 1 ? "expense" : "expenses"} ·{" "}
            {dateRangeText}
          </Caption>
        }
        after={
          userShareInBase > 0 ? (
            <Chip
              mode="elevated"
              before={<UserRound size={14} />}
              onClick={onYourShareClick}
            >
              You: {formatCurrencyWithCode(userShareInBase, baseCurrency)}
            </Chip>
          ) : undefined
        }
      >
        <Title level="2" weight="1">
          {formatCurrencyWithCode(totalInBase, baseCurrency)}
        </Title>
        <Text weight="3">Total spent</Text>
      </Cell>
    </Section>
  );
}
