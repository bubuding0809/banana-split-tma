import { useEffect, useMemo, useRef, useState } from "react";
import { Caption, Text, Tooltip } from "@telegram-apps/telegram-ui";
import { themeParams, useSignal } from "@telegram-apps/sdk-react";
import { formatCurrencyWithCode } from "@/utils/financial";
import { cn } from "@/utils/cn";

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
  /** Pixel height of the chart canvas. Applies to both orientations. */
  height?: number;
}

// Minimum visible extent so a tiny bar is still a bar, not a pixel.
const MIN_BAR_PERCENT = 2;

/**
 * Hand-rolled, tappable bar chart built around Telegram UI's Tooltip
 * primitive. Each bar is a button; tapping it anchors a Telegram UI
 * Tooltip with the slice label, amount, count, and % of total.
 *
 * Hand-rolling the geometry (rather than going through Recharts or
 * Tremor) keeps rendering reliable inside the Telegram mini-app viewport
 * where Recharts' ResponsiveContainer was collapsing Y-axis labels and
 * Tremor's Tailwind 3 classnames weren't resolving under our Tailwind 4
 * build.
 */
export function SnapshotBarChart({
  data,
  orientation,
  baseCurrency,
  height,
}: SnapshotBarChartProps) {
  const buttonColor = useSignal(themeParams.buttonColor) ?? "#5288c1";

  const [activeKey, setActiveKey] = useState<string | null>(null);
  const barRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());
  const containerRef = useRef<HTMLDivElement | null>(null);

  const total = useMemo(
    () => data.reduce((sum, d) => sum + d.value, 0),
    [data]
  );
  const max = useMemo(
    () => data.reduce((m, d) => (d.value > m ? d.value : m), 0),
    [data]
  );

  // Dismiss the tooltip on any tap outside the chart, matching native
  // popover UX on iOS/Android.
  useEffect(() => {
    if (!activeKey) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setActiveKey(null);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [activeKey]);

  const activeDatum = activeKey
    ? (data.find((d) => d.key === activeKey) ?? null)
    : null;
  const activeRef = activeKey ? (barRefs.current.get(activeKey) ?? null) : null;
  const activePct =
    activeDatum && total > 0
      ? Math.round((activeDatum.value / total) * 100)
      : 0;

  if (data.length === 0) return null;
  if (max <= 0) return null;

  const tooltip =
    activeDatum && activeRef ? (
      <Tooltip mode="dark" targetRef={{ current: activeRef }} placement="top">
        <div className="flex flex-col gap-0.5">
          <Caption weight="2" level="1">
            {activeDatum.label}
          </Caption>
          <Text weight="2">
            {formatCurrencyWithCode(activeDatum.value, baseCurrency)}
          </Text>
          <Caption level="1" weight="3" className="opacity-70">
            {activeDatum.count}{" "}
            {activeDatum.count === 1 ? "expense" : "expenses"} · {activePct}% of
            total
          </Caption>
        </div>
      </Tooltip>
    ) : null;

  if (orientation === "horizontal") {
    return (
      <div ref={containerRef} className="flex flex-col gap-3">
        {data.map((d) => {
          const pct = Math.max((d.value / max) * 100, MIN_BAR_PERCENT);
          const isActive = d.key === activeKey;
          return (
            <button
              key={d.key}
              type="button"
              ref={(el) => {
                barRefs.current.set(d.key, el);
              }}
              onClick={() =>
                setActiveKey((cur) => (cur === d.key ? null : d.key))
              }
              className={cn(
                "flex flex-col gap-1 rounded-md text-left outline-none transition-opacity",
                activeKey && !isActive && "opacity-60"
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <Caption
                  level="1"
                  weight="2"
                  className="min-w-0 flex-1 truncate"
                >
                  {d.label}
                </Caption>
                <Caption
                  level="1"
                  weight="3"
                  className="shrink-0 tabular-nums opacity-80"
                >
                  {formatCurrencyWithCode(d.value, baseCurrency)}
                </Caption>
              </div>
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-[rgba(255,255,255,0.08)]">
                <div
                  className="h-full rounded-full transition-[width] duration-300"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: buttonColor,
                  }}
                />
              </div>
            </button>
          );
        })}
        {tooltip}
      </div>
    );
  }

  // vertical — bars grow from bottom
  const chartHeight = height ?? 160;
  return (
    <div ref={containerRef} className="flex flex-col gap-1.5">
      <div className="flex gap-1.5 px-1" style={{ height: `${chartHeight}px` }}>
        {data.map((d) => {
          const pct = Math.max((d.value / max) * 100, MIN_BAR_PERCENT);
          const isActive = d.key === activeKey;
          return (
            <button
              key={d.key}
              type="button"
              ref={(el) => {
                barRefs.current.set(d.key, el);
              }}
              onClick={() =>
                setActiveKey((cur) => (cur === d.key ? null : d.key))
              }
              className={cn(
                "flex flex-1 flex-col justify-end rounded-t outline-none transition-opacity",
                activeKey && !isActive && "opacity-60"
              )}
            >
              <div
                className="w-full rounded-t transition-[height] duration-300"
                style={{
                  height: `${pct}%`,
                  backgroundColor: buttonColor,
                  minHeight: 2,
                }}
              />
            </button>
          );
        })}
      </div>
      <div className="flex items-start gap-1.5 px-1">
        {data.map((d, i) => {
          const showLabel =
            data.length <= 6 ||
            i === 0 ||
            i === data.length - 1 ||
            i === Math.floor(data.length / 2);
          return (
            <div key={`${d.key}-label`} className="flex flex-1 justify-center">
              {showLabel && (
                <Text
                  Component="span"
                  weight="3"
                  className="whitespace-nowrap text-[10px] opacity-60"
                >
                  {d.label}
                </Text>
              )}
            </div>
          );
        })}
      </div>
      {tooltip}
    </div>
  );
}
