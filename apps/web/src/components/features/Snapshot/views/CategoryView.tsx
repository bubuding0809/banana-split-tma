import { Caption, Cell, Section, Text } from "@telegram-apps/telegram-ui";
import { format } from "date-fns";
import { formatCurrencyWithCode } from "@/utils/financial";
import { SnapshotBarChart } from "../charts/SnapshotBarChart";
import type { SnapshotAggregations } from "../aggregations/computeSnapshotAggregations";

const TOP_N = 8;

interface CategoryViewProps {
  aggregations: SnapshotAggregations;
}

export function CategoryView({ aggregations }: CategoryViewProps) {
  const { byCategory, baseCurrency } = aggregations;

  const top = byCategory.slice(0, TOP_N);
  const remaining = byCategory.slice(TOP_N);
  const remainingTotal = remaining.reduce((sum, g) => sum + g.totalInBase, 0);

  const chartData = [
    ...top.map((g) => ({
      key: g.key,
      label: `${g.emoji} ${g.title}`,
      value: g.totalInBase,
    })),
    ...(remaining.length > 0
      ? [
          {
            key: "__more__",
            label: `➕ ${remaining.length} more`,
            value: remainingTotal,
          },
        ]
      : []),
  ];

  return (
    <>
      <Section header="By category">
        <div style={{ padding: "12px 0" }}>
          <SnapshotBarChart
            data={chartData}
            orientation="horizontal"
            baseCurrency={baseCurrency}
            height={Math.max(160, chartData.length * 28 + 20)}
          />
        </div>
      </Section>

      {byCategory.map((group) => (
        <Section
          key={group.key}
          header={
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>
                {group.emoji} {group.title}
              </span>
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
                  {item.payer.firstName} · {format(item.date, "d MMM")}
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
