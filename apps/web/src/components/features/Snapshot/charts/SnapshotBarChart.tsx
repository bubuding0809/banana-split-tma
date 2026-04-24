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
  type SnapshotBarTooltipPayload,
} from "./SnapshotBarTooltip";

type Orientation = "horizontal" | "vertical";

interface SnapshotBarChartProps {
  data: SnapshotBarTooltipPayload[];
  orientation: Orientation;
  baseCurrency: string;
  /** Pixel height of the chart canvas (width is 100%). */
  height?: number;
}

/**
 * Thin Recharts wrapper. The ONLY file (with SnapshotBarTooltip) that imports from `recharts`.
 *
 * - `horizontal` = rows stacked top-to-bottom, bars grow to the right (Category, Payer).
 * - `vertical`   = bars stacked left-to-right (Date timeline).
 */
export function SnapshotBarChart({
  data,
  orientation,
  baseCurrency,
  height = 220,
}: SnapshotBarChartProps) {
  const buttonColor = useSignal(themeParams.buttonColor) ?? "#5288c1";
  const subtitleColor = useSignal(themeParams.subtitleTextColor) ?? "#8e8e93";

  // Recharts requires `layout="vertical"` for horizontal bars. Naming clash
  // between "layout visually horizontal" vs "Recharts layout='vertical'" is
  // painful — we translate at the boundary here and keep our own prop intuitive.
  const layout = orientation === "horizontal" ? "vertical" : "horizontal";

  const paddedData = useMemo(() => data.map((d) => ({ ...d })), [data]);

  if (paddedData.length === 0) {
    return null;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={paddedData}
        layout={layout}
        margin={{ top: 6, right: 12, bottom: 6, left: 12 }}
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
              width={100}
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
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          content={<SnapshotBarTooltip baseCurrency={baseCurrency} />}
        />
        <Bar
          dataKey="value"
          radius={orientation === "horizontal" ? [0, 4, 4, 0] : [4, 4, 0, 0]}
        >
          {paddedData.map((d) => (
            <Cell key={d.key} fill={buttonColor} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
