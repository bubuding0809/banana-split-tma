import { useMemo } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { themeParams, useSignal } from "@telegram-apps/sdk-react";
import {
  SnapshotBarTooltip,
  type SnapshotBarDatum,
} from "./SnapshotBarTooltip";

export type { SnapshotBarDatum };

type Orientation = "horizontal" | "vertical";

interface SnapshotBarChartProps {
  data: SnapshotBarDatum[];
  orientation: Orientation;
  baseCurrency: string;
  /** Pixel height of the chart canvas (width is 100%). */
  height?: number;
}

/**
 * Recharts wrapper for the snapshot views. The ONLY file (with
 * SnapshotBarTooltip) that imports from `recharts`.
 *
 * - `horizontal` = rows stacked top-to-bottom, bars grow to the right.
 *                  Used on Category + Payer tabs.
 * - `vertical`   = columns left-to-right, bars grow from the bottom.
 *                  Used on the Date tab.
 *
 * Bars are tappable: taps surface a rich Telegram-UI-styled tooltip with
 * the slice label, amount, count, and % of total.
 */
export function SnapshotBarChart({
  data,
  orientation,
  baseCurrency,
  height,
}: SnapshotBarChartProps) {
  const buttonColor = useSignal(themeParams.buttonColor) ?? "#5288c1";
  const subtitleColor = useSignal(themeParams.subtitleTextColor) ?? "#8e8e93";

  // Recharts uses layout="vertical" for visually-horizontal bars and
  // layout="horizontal" for vertical bars. Translate at the boundary so
  // our orientation prop stays intuitive.
  const rechartsLayout =
    orientation === "horizontal" ? "vertical" : "horizontal";

  const total = useMemo(
    () => data.reduce((sum, d) => sum + d.value, 0),
    [data]
  );

  if (data.length === 0) return null;

  const effectiveHeight =
    height ??
    (orientation === "horizontal" ? Math.max(140, data.length * 36 + 16) : 180);

  return (
    <ResponsiveContainer width="100%" height={effectiveHeight}>
      <BarChart
        data={data}
        layout={rechartsLayout}
        margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
        barCategoryGap={orientation === "horizontal" ? 6 : 8}
      >
        {orientation === "horizontal" ? (
          <>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: subtitleColor, fontSize: 12 }}
              width={140}
              interval={0}
            />
          </>
        ) : (
          <>
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: subtitleColor, fontSize: 10 }}
              interval="preserveStartEnd"
            />
            <YAxis hide />
          </>
        )}
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.05)" }}
          content={
            <SnapshotBarTooltip total={total} baseCurrency={baseCurrency} />
          }
          wrapperStyle={{ outline: "none", zIndex: 10 }}
        />
        <Bar
          dataKey="value"
          radius={orientation === "horizontal" ? [0, 4, 4, 0] : [4, 4, 0, 0]}
          minPointSize={3}
        >
          {data.map((d) => (
            <Cell key={d.key} fill={buttonColor} cursor="pointer" />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
