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
        <Cell multiline>
          <SnapshotBarChart
            data={chartData}
            orientation="horizontal"
            baseCurrency={baseCurrency}
          />
        </Cell>
      </Section>

      {byCategory.map((group) => (
        <Section key={group.key}>
          <Cell
            before={
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[rgba(255,255,255,0.06)] text-lg leading-none">
                {group.emoji}
              </div>
            }
            subtitle={
              <Caption level="1" weight="3">
                {group.items.length}{" "}
                {group.items.length === 1 ? "expense" : "expenses"}
              </Caption>
            }
            after={
              <Text weight="2">
                {formatCurrencyWithCode(group.totalInBase, baseCurrency)}
              </Text>
            }
          >
            <Text weight="2">{group.title}</Text>
          </Cell>
          {group.items.map((item) => (
            <Cell
              key={item.id}
              subhead={
                <Caption level="1" weight="3">
                  {item.payer.firstName} · {format(item.date, "d MMM")}
                </Caption>
              }
              after={
                <Text weight="3">
                  {formatCurrencyWithCode(item.amountInBase, baseCurrency)}
                </Text>
              }
            >
              <Text weight="3">{item.description}</Text>
            </Cell>
          ))}
        </Section>
      ))}
    </>
  );
}
