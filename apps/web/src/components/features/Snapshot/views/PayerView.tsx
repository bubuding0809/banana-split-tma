import { Caption, Cell, Section, Text } from "@telegram-apps/telegram-ui";
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
    <>
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
        <Section key={group.payerId}>
          <Cell
            before={<ChatMemberAvatar userId={group.payerId} size={40} />}
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
            <Text weight="2">{group.payer.firstName}</Text>
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
