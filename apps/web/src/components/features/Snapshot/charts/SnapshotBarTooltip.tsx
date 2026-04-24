import { Caption, Text } from "@telegram-apps/telegram-ui";
import type { TooltipProps } from "recharts";
import { themeParams, useSignal } from "@telegram-apps/sdk-react";
import { formatCurrencyWithCode } from "@/utils/financial";

export type SnapshotBarTooltipPayload = {
  key: string;
  label: string;
  value: number;
};

export function SnapshotBarTooltip(
  props: TooltipProps<number, string> & { baseCurrency: string }
) {
  const { active, payload, baseCurrency } = props;
  const secondaryBg =
    useSignal(themeParams.secondaryBackgroundColor) ?? "#212a33";

  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0]!.payload as SnapshotBarTooltipPayload;
  return (
    <div
      style={{
        background: secondaryBg,
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 8,
        padding: "6px 10px",
        pointerEvents: "none",
      }}
    >
      <Caption weight="2" level="1">
        {datum.label}
      </Caption>
      <div>
        <Text weight="2">
          {formatCurrencyWithCode(datum.value, baseCurrency)}
        </Text>
      </div>
    </div>
  );
}
