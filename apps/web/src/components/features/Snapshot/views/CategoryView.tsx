import { Section } from "@telegram-apps/telegram-ui";
import { formatCurrencyWithCode } from "@/utils/financial";
import { SnapshotBarChart } from "../charts/SnapshotBarChart";
import { SnapshotExpenseRow } from "./SnapshotExpenseRow";
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
      count: g.items.length,
    })),
    ...(remaining.length > 0
      ? [
          {
            key: "__more__",
            label: `➕ ${remaining.length} more`,
            value: remainingTotal,
            count: remaining.reduce((sum, g) => sum + g.items.length, 0),
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <Section header="By category · your share">
        <div className="px-4 py-3">
          <SnapshotBarChart
            data={chartData}
            orientation="horizontal"
            baseCurrency={baseCurrency}
          />
        </div>
      </Section>

      {byCategory.map((group) => (
        <Section
          key={group.key}
          header={
            <Section.Header
              large
              className="bg-(--tgui--section_bg_color) sticky z-20"
              style={{
                top: "calc(env(safe-area-inset-top, 0px) + 56px)",
              }}
            >
              <div className="flex w-full items-baseline justify-between gap-3 px-3">
                <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
                  <span className="shrink-0">{group.emoji}</span>
                  <span className="truncate">{group.title}</span>
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
