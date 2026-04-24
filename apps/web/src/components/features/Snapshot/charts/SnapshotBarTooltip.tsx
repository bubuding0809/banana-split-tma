import { Caption, Text } from "@telegram-apps/telegram-ui";
import { themeParams, useSignal } from "@telegram-apps/sdk-react";
import type { TooltipProps } from "recharts";
import { formatCurrencyWithCode } from "@/utils/financial";

export type SnapshotBarDatum = {
  key: string;
  label: string;
  value: number;
  count: number;
};

interface SnapshotBarTooltipProps extends TooltipProps<number, string> {
  total: number;
  baseCurrency: string;
}

export function SnapshotBarTooltip({
  active,
  payload,
  total,
  baseCurrency,
}: SnapshotBarTooltipProps) {
  const secondaryBg =
    useSignal(themeParams.secondaryBackgroundColor) ?? "#212a33";

  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0]!.payload as SnapshotBarDatum;
  const pct = total > 0 ? Math.round((datum.value / total) * 100) : 0;

  return (
    <div
      style={{
        background: secondaryBg,
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 10,
        padding: "8px 12px",
        pointerEvents: "none",
        boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
        minWidth: 160,
      }}
    >
      <Caption weight="2" level="1" className="block">
        {datum.label}
      </Caption>
      <div style={{ marginTop: 2 }}>
        <Text weight="2">
          {formatCurrencyWithCode(datum.value, baseCurrency)}
        </Text>
      </div>
      <Caption level="1" weight="3" className="mt-0.5 block opacity-60">
        {datum.count} {datum.count === 1 ? "expense" : "expenses"} · {pct}% of
        total
      </Caption>
    </div>
  );
}
