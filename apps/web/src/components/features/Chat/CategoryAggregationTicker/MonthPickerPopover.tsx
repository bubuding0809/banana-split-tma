import { hapticFeedback } from "@telegram-apps/sdk-react";
import { formatCurrencyWithCode } from "@/utils/financial";
import { cn } from "@/utils/cn";
import type { MonthSummary } from "./useCategoryAggregation";

interface MonthPickerPopoverProps {
  months: MonthSummary[];
  activeMonthKey: string | null;
  baseCurrency: string;
  onPick: (monthKey: string) => void;
}

export default function MonthPickerPopover({
  months,
  activeMonthKey,
  baseCurrency,
  onPick,
}: MonthPickerPopoverProps) {
  if (months.length === 0) return null;

  return (
    <div
      role="listbox"
      aria-label="Pick month"
      className="absolute bottom-[calc(100%+8px)] left-3 z-10 min-w-[160px] origin-bottom-left rounded-[14px] bg-[rgba(20,20,25,0.96)] py-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.12)] backdrop-blur-md"
      style={{ color: "white" }}
    >
      <div className="max-h-[220px] overflow-y-auto [&::-webkit-scrollbar]:hidden">
        {months.map((m) => {
          const active = m.monthKey === activeMonthKey;
          return (
            <button
              key={m.monthKey}
              type="button"
              role="option"
              aria-selected={active}
              onClick={() => {
                try {
                  hapticFeedback.selectionChanged();
                } catch {
                  /* non-TMA */
                }
                onPick(m.monthKey);
              }}
              className={cn(
                "flex w-full items-center justify-between gap-4 px-4 py-2 text-left transition-colors duration-150",
                active ? "bg-white/15" : "hover:bg-white/8 active:bg-white/10"
              )}
            >
              <span className="text-[13px] font-semibold">
                {m.monthDisplay}
              </span>
              <span className="text-[10.5px] font-medium tabular-nums opacity-70">
                {m.needsConversion && (
                  <span className="mr-0.5 opacity-60">≈</span>
                )}
                {formatCurrencyWithCode(m.baseTotal, baseCurrency)}
              </span>
            </button>
          );
        })}
      </div>
      {/* Arrow tail, pointing down at the month pill */}
      <div
        aria-hidden
        className="absolute -bottom-1.5 left-5 h-3 w-3 rotate-45 rounded-sm bg-[rgba(20,20,25,0.96)]"
      />
    </div>
  );
}
