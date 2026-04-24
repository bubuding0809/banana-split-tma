import { BarChart } from "@tremor/react";
import { themeParams, useSignal } from "@telegram-apps/sdk-react";
import { Caption, Text } from "@telegram-apps/telegram-ui";
import { formatCurrencyWithCode } from "@/utils/financial";

export type SnapshotBarDatum = {
  key: string;
  label: string;
  value: number;
  count: number;
};

type Orientation = "horizontal" | "vertical";

interface SnapshotBarChartProps {
  data: SnapshotBarDatum[];
  orientation: Orientation;
  baseCurrency: string;
  /** Pixel height of the chart. */
  height?: number;
}

/**
 * Tremor BarChart wrapper. Tremor sits on top of Recharts but handles
 * ResponsiveContainer + axis sizing with better defaults for dashboards.
 *
 * `horizontal` = bars grow left-to-right (Tremor `layout="vertical"`).
 *                Used on Category + Payer tabs.
 * `vertical`   = bars grow bottom-to-top (Tremor `layout="horizontal"`).
 *                Used on the Date tab.
 */
export function SnapshotBarChart({
  data,
  orientation,
  baseCurrency,
  height,
}: SnapshotBarChartProps) {
  const buttonColor = useSignal(themeParams.buttonColor) ?? "#5288c1";

  if (data.length === 0) return null;

  const total = data.reduce((sum, d) => sum + d.value, 0);
  const tremorLayout = orientation === "horizontal" ? "vertical" : "horizontal";
  const effectiveHeight =
    height ??
    (orientation === "horizontal" ? Math.max(160, data.length * 36 + 24) : 200);

  // Tremor keys categories by the `index` column, so we rename `label` → name.
  const chartRows = data.map((d) => ({
    name: d.label,
    Amount: d.value,
    __count: d.count,
    __key: d.key,
  }));

  return (
    <div style={{ height: `${effectiveHeight}px` }}>
      <BarChart
        data={chartRows}
        index="name"
        categories={["Amount"]}
        colors={[buttonColor]}
        layout={tremorLayout}
        yAxisWidth={orientation === "horizontal" ? 140 : 60}
        showLegend={false}
        showGridLines={false}
        showAnimation
        valueFormatter={(value) => formatCurrencyWithCode(value, baseCurrency)}
        customTooltip={({ active, payload }) => {
          if (!active || !payload?.length) return null;
          const datum = payload[0]!.payload as {
            name: string;
            Amount: number;
            __count: number;
          };
          const pct = total > 0 ? Math.round((datum.Amount / total) * 100) : 0;
          return (
            <div className="rounded-lg border border-white/10 bg-neutral-900/95 px-3 py-2 shadow-lg">
              <Caption weight="2" level="1" className="block">
                {datum.name}
              </Caption>
              <Text weight="2">
                {formatCurrencyWithCode(datum.Amount, baseCurrency)}
              </Text>
              <Caption level="1" weight="3" className="mt-0.5 block opacity-60">
                {datum.__count} {datum.__count === 1 ? "expense" : "expenses"} ·{" "}
                {pct}% of total
              </Caption>
            </div>
          );
        }}
      />
    </div>
  );
}
