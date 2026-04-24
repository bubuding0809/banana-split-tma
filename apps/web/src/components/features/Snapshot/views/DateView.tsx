import { Section, Text } from "@telegram-apps/telegram-ui";
import { format } from "date-fns";
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
        <Section
          key={group.key}
          header={
            <Section.Header large>
              <div className="flex w-full items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate">
                    📅 {format(group.date, "d MMM yyyy")}
                  </span>
                  <span className="shrink-0 opacity-60">
                    · {group.items.length}
                  </span>
                </div>
                <Text weight="2" className="shrink-0">
                  {formatCurrencyWithCode(group.totalInBase, baseCurrency)}
                </Text>
              </div>
            </Section.Header>
          }
        >
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
