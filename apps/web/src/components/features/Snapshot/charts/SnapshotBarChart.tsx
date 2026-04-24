import { themeParams, useSignal } from "@telegram-apps/sdk-react";
import { Caption, Text } from "@telegram-apps/telegram-ui";
import { formatCurrencyWithCode } from "@/utils/financial";

export type SnapshotBarDatum = {
  key: string;
  label: string;
  value: number;
};

type Orientation = "horizontal" | "vertical";

interface SnapshotBarChartProps {
  data: SnapshotBarDatum[];
  orientation: Orientation;
  baseCurrency: string;
  /** Pixel height of the chart canvas (vertical only — horizontal auto-sizes). */
  height?: number;
}

// Minimum visible width so a tiny bar is still a bar, not a pixel.
const MIN_BAR_PERCENT = 3;

/**
 * Hand-rolled bar chart. Hand-rolled (rather than a charting library) is a
 * better fit here: (1) datasets are 3–15 items with heavy skew — one category
 * can be 80%+ of the total, which makes library bars hide the tail, and
 * (2) Telegram mini-app viewport + Section padding was collapsing
 * ResponsiveContainer labels to zero.
 *
 * - `horizontal` = label / bar / value row. Used on Category + Payer tabs.
 * - `vertical`   = equal-width columns growing from the bottom. Used on Date.
 */
export function SnapshotBarChart({
  data,
  orientation,
  baseCurrency,
  height = 160,
}: SnapshotBarChartProps) {
  const buttonColor = useSignal(themeParams.buttonColor) ?? "#5288c1";

  if (data.length === 0) return null;

  const max = data.reduce((m, d) => (d.value > m ? d.value : m), 0);
  if (max <= 0) return null;

  if (orientation === "horizontal") {
    return (
      <div className="flex flex-col gap-2">
        {data.map((d) => {
          const pct = Math.max((d.value / max) * 100, MIN_BAR_PERCENT);
          return (
            <div key={d.key} className="flex items-center gap-2.5">
              <Caption
                level="1"
                weight="3"
                className="w-[32%] shrink-0 truncate"
              >
                {d.label}
              </Caption>
              <div className="relative h-5 flex-1 overflow-hidden rounded bg-[rgba(255,255,255,0.06)]">
                <div
                  className="h-full rounded transition-[width] duration-300"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: buttonColor,
                  }}
                />
              </div>
              <Caption
                level="1"
                weight="2"
                className="w-[26%] shrink-0 text-right tabular-nums"
              >
                {formatCurrencyWithCode(d.value, baseCurrency)}
              </Caption>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="flex items-end gap-1 px-1"
        style={{ height: `${height}px` }}
      >
        {data.map((d) => {
          const pct = Math.max((d.value / max) * 100, MIN_BAR_PERCENT);
          return (
            <div
              key={d.key}
              className="flex flex-1 flex-col items-center justify-end"
              title={`${d.label} · ${formatCurrencyWithCode(d.value, baseCurrency)}`}
            >
              <div
                className="w-full rounded-t transition-[height] duration-300"
                style={{
                  height: `${pct}%`,
                  backgroundColor: buttonColor,
                  minHeight: 2,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex items-start gap-1 px-1">
        {data.map((d, i) => {
          const showLabel =
            data.length <= 6 ||
            i === 0 ||
            i === data.length - 1 ||
            i === Math.floor(data.length / 2);
          return (
            <div
              key={`${d.key}-label`}
              className="flex flex-1 justify-center overflow-hidden"
            >
              {showLabel && (
                <Text
                  Component="span"
                  weight="3"
                  className="truncate text-[10px] opacity-60"
                >
                  {d.label}
                </Text>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
