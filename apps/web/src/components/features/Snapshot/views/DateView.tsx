import { Caption, Cell, Section, Text } from "@telegram-apps/telegram-ui";
import { format } from "date-fns";
import { formatCurrencyWithCode } from "@/utils/financial";
import { SnapshotBarChart } from "../charts/SnapshotBarChart";
import type { SnapshotAggregations } from "../aggregations/computeSnapshotAggregations";

interface DateViewProps {
  aggregations: SnapshotAggregations;
}

export function DateView({ aggregations }: DateViewProps) {
  const { byDate, baseCurrency } = aggregations;

  const chartData = byDate.map((g) => ({
    key: g.key,
    label: format(g.date, "d MMM"),
    value: g.totalInBase,
  }));

  const listGroups = [...byDate].reverse();

  return (
    <>
      <Section header="By date">
        <div style={{ padding: "12px 0" }}>
          <SnapshotBarChart
            data={chartData}
            orientation="vertical"
            baseCurrency={baseCurrency}
            height={180}
          />
        </div>
      </Section>

      {listGroups.map((group) => (
        <Section
          key={group.key}
          header={
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>📅 {format(group.date, "d MMM yyyy")}</span>
              <span>
                {formatCurrencyWithCode(group.totalInBase, baseCurrency)}
              </span>
            </div>
          }
        >
          {group.items.map((item) => (
            <Cell
              key={item.id}
              subhead={
                <Caption level="1" weight="3">
                  {item.categoryEmoji} {item.payer.firstName}
                </Caption>
              }
              after={
                <Text weight="2">
                  {formatCurrencyWithCode(item.amountInBase, baseCurrency)}
                </Text>
              }
            >
              {item.description}
            </Cell>
          ))}
        </Section>
      ))}
    </>
  );
}
