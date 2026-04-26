import { Cell, Info, Section, Text } from "@telegram-apps/telegram-ui";
import { TrendingDown } from "lucide-react";
import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";
import { formatCurrencyWithCode } from "@/utils/financial";
import { formatSnapshotDateRange } from "@/utils/date";
import type { SnapshotAggregations } from "./aggregations/computeSnapshotAggregations";

interface SnapshotHeroProps {
  aggregations: SnapshotAggregations;
}

/**
 * Mirrors the two-cell pattern used by SnapshotDetailsModal:
 *   (1) a snapshot-overview Cell: creator avatar + "By X" subhead + title
 *       + count subtitle + total in the after slot.
 *   (2) a "How much did you spend?" Section with a red TrendingDown icon
 *       showing the user's share — identical header copy + visual weight
 *       as the modal.
 */
export function SnapshotHero({ aggregations }: SnapshotHeroProps) {
  const { details, baseCurrency, totalInBase, dateRange, userShareInBase } =
    aggregations;
  const expenseCount = details.expenses.length;

  const dateRangeText = dateRange
    ? formatSnapshotDateRange(dateRange.earliest, dateRange.latest)
    : "No expenses";

  return (
    <>
      <Section>
        <Cell
          subhead={`By ${details.creator.firstName}`}
          before={<ChatMemberAvatar userId={details.creator.id} size={48} />}
          after={
            <Info type="text" subtitle={dateRangeText}>
              <Text weight="2" className="text-lg">
                {formatCurrencyWithCode(totalInBase, baseCurrency)}
              </Text>
            </Info>
          }
          subtitle={`${expenseCount} ${
            expenseCount === 1 ? "expense" : "expenses"
          }`}
        >
          <Text weight="2" className="text-lg">
            {details.title}
          </Text>
        </Cell>
      </Section>

      {userShareInBase > 0 && (
        <Section header="How much did you spend?">
          <Cell
            before={
              <span className="rounded-lg bg-red-500 p-1.5">
                <TrendingDown size={20} color="white" />
              </span>
            }
            after={
              <Info type="text" subtitle="Total">
                <Text weight="3" className="text-lg text-red-600">
                  {formatCurrencyWithCode(userShareInBase, baseCurrency)}
                </Text>
              </Info>
            }
            description="Net sum of your expense shares"
          >
            <Text weight="3">You spent</Text>
          </Cell>
        </Section>
      )}
    </>
  );
}
