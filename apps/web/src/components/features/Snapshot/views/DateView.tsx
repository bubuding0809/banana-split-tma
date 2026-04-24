import { Caption, Cell, Section, Text } from "@telegram-apps/telegram-ui";
import { format } from "date-fns";
import { CalendarDays } from "lucide-react";
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

  // List order matches the share message: newest day first.
  const listGroups = [...byDate].reverse();

  return (
    <>
      <Section header="By date">
        <Cell multiline>
          <SnapshotBarChart
            data={chartData}
            orientation="vertical"
            baseCurrency={baseCurrency}
            height={140}
          />
        </Cell>
      </Section>

      {listGroups.map((group) => (
        <Section key={group.key}>
          <Cell
            before={
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[rgba(255,255,255,0.06)]">
                <CalendarDays size={18} className="opacity-80" />
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
            <Text weight="2">{format(group.date, "d MMM yyyy")}</Text>
          </Cell>
          {group.items.map((item) => (
            <Cell
              key={item.id}
              subhead={
                <Caption level="1" weight="3">
                  {item.categoryEmoji} {item.payer.firstName}
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
