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
        <div style={{ padding: "12px 0" }}>
          <SnapshotBarChart
            data={chartData}
            orientation="horizontal"
            baseCurrency={baseCurrency}
            height={Math.max(140, chartData.length * 32 + 20)}
          />
        </div>
      </Section>

      {byPayer.map((group) => (
        <Section
          key={group.payerId}
          header={
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ChatMemberAvatar userId={group.payerId} size={24} />
                <span>
                  {group.payer.firstName} · {group.items.length}
                  {group.items.length === 1 ? " expense" : " expenses"}
                </span>
              </div>
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
                  {item.categoryEmoji} · {format(item.date, "d MMM")}
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
