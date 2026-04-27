import { Section } from "@telegram-apps/telegram-ui";
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
    count: g.items.length,
  }));

  // List order matches the share message: newest day first.
  const listGroups = [...byDate].reverse();

  return (
    <div className="flex flex-col gap-6">
      <Section header="By date · your share">
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
              <div className="flex w-full items-baseline justify-between gap-3 px-3">
                <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
                  <span className="shrink-0">📅</span>
                  <span className="truncate">
                    {format(group.date, "d MMM yyyy")}
                  </span>
                  <span className="shrink-0 opacity-50">
                    · {group.items.length}
                  </span>
                </div>
                <span className="shrink-0 tabular-nums">
                  {formatCurrencyWithCode(group.totalInBase, baseCurrency)}
                </span>
              </div>
            </Section.Header>
          }
        >
          {group.items.map((item) => (
            <SnapshotExpenseRow
              key={item.id}
              item={{
                id: item.id,
                description: item.description,
                date: item.date,
                amountInBase: item.amountInBase,
                shareInBase: item.userShareInBase,
                payer: item.payer,
                categoryEmoji: item.categoryEmoji,
              }}
              baseCurrency={baseCurrency}
            />
          ))}
        </Section>
      ))}
    </div>
  );
}
