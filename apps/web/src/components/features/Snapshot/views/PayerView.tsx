import { Caption, Cell, Section, Text } from "@telegram-apps/telegram-ui";
import { format } from "date-fns";
import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";
import { formatCurrencyWithCode } from "@/utils/financial";
import { SnapshotBarChart } from "../charts/SnapshotBarChart";
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
        <Cell multiline>
          <SnapshotBarChart
            data={chartData}
            orientation="horizontal"
            baseCurrency={baseCurrency}
          />
        </Cell>
      </Section>

      {byPayer.map((group) => (
        <Section key={group.payerId}>
          <Cell
            before={<ChatMemberAvatar userId={group.payerId} size={40} />}
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
            <Text weight="2">{group.payer.firstName}</Text>
          </Cell>
          {group.items.map((item) => (
            <Cell
              key={item.id}
              subhead={
                <Caption level="1" weight="3">
                  {item.categoryEmoji} · {format(item.date, "d MMM")}
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
