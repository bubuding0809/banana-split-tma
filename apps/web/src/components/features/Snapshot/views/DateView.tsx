import { Caption, Cell, Section, Text } from "@telegram-apps/telegram-ui";
import { format } from "date-fns";
import { CalendarDays } from "lucide-react";
import { formatCurrencyWithCode } from "@/utils/financial";
import { SnapshotBarChart } from "../charts/SnapshotBarChart";
import { SnapshotExpenseRow } from "./SnapshotExpenseRow";
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
        <div className="px-4 py-3">
          <SnapshotBarChart
            data={chartData}
            orientation="vertical"
            baseCurrency={baseCurrency}
            height={140}
          />
        </div>
      </Section>

      {listGroups.map((group) => (
        <Section key={group.key}>
          <Cell
            before={
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[rgba(255,255,255,0.06)]">
                <CalendarDays size={20} className="opacity-80" />
              </div>
            }
            subhead={
              <Caption weight="1" level="1">
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
            <SnapshotExpenseRow
              key={item.id}
              item={item}
              baseCurrency={baseCurrency}
            />
          ))}
        </Section>
      ))}
    </>
  );
}
