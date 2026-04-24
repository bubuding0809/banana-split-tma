import { Section } from "@telegram-apps/telegram-ui";
import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";
import { formatCurrencyWithCode } from "@/utils/financial";
import { SnapshotBarChart } from "../charts/SnapshotBarChart";
import { SnapshotExpenseRow } from "./SnapshotExpenseRow";
import type { SnapshotAggregations } from "../aggregations/computeSnapshotAggregations";

interface PayerViewProps {
  aggregations: SnapshotAggregations;
}

export function PayerView({ aggregations }: PayerViewProps) {
  const { byPayer, baseCurrency } = aggregations;

  const chartData = byPayer.map((g) => ({
    key: String(g.payerId),
    label: g.payer.firstName,
    value: g.totalInBase,
  }));

  return (
    <div className="flex flex-col gap-6">
      <Section header="By payer">
        <div className="px-4 py-3">
          <SnapshotBarChart
            data={chartData}
            orientation="horizontal"
            baseCurrency={baseCurrency}
          />
        </div>
      </Section>

      {byPayer.map((group) => (
        <Section
          key={group.payerId}
          header={
            <Section.Header large>
              <div className="flex w-full items-baseline justify-between gap-3 px-3">
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <ChatMemberAvatar userId={group.payerId} size={20} />
                  <span className="self-baseline truncate">
                    {group.payer.firstName}
                  </span>
                  <span className="shrink-0 self-baseline opacity-50">
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
              item={item}
              baseCurrency={baseCurrency}
            />
          ))}
        </Section>
      ))}
    </div>
  );
}
