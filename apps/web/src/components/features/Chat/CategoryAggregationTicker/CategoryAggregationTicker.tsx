import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hapticFeedback } from "@telegram-apps/sdk-react";
import { ChevronDown } from "lucide-react";
import { trpc } from "@/utils/trpc";
import { formatCurrencyWithCode } from "@/utils/financial";
import { cn } from "@/utils/cn";
import CategoryFilterStrip from "../CategoryFilterStrip";
import {
  useCategoryAggregation,
  type AggregationResult,
  type CategoryAggregate,
} from "./useCategoryAggregation";
import MonthPickerPopover from "./MonthPickerPopover";

interface CategoryAggregationTickerProps {
  chatId: number;
  userId: number;
  categoryFilters: string[];
  categories: {
    id: string;
    emoji: string;
    title: string;
    kind: "base" | "custom";
  }[];
  categoryCounts: Record<string, number>;
  onCategoryFiltersChange: (ids: string[]) => void;
}

// Card max-height cap: 60vh on short viewports, 480px ceiling on tall ones.
const EXPANDED_MAX_HEIGHT = "min(60vh, 480px)";

const EASE = "cubic-bezier(0.23,1,0.32,1)";

function tick() {
  try {
    hapticFeedback.selectionChanged();
  } catch {
    /* non-TMA */
  }
}

export default function CategoryAggregationTicker({
  chatId,
  userId,
  categoryFilters,
  categories,
  categoryCounts,
  onCategoryFiltersChange,
}: CategoryAggregationTickerProps) {
  const [expanded, setExpanded] = useState(false);
  const [pickedMonthKey, setPickedMonthKey] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const rootRef = useRef<HTMLDivElement | null>(null);

  // * Queries ============================================================
  const { data: expensesData } = trpc.expense.getAllExpensesByChat.useQuery(
    { chatId },
    { enabled: chatId > 0 }
  );
  const { data: chatData } = trpc.chat.getChat.useQuery(
    { chatId },
    { enabled: chatId > 0 }
  );
  const { data: categoriesData } = trpc.category.listByChat.useQuery(
    { chatId },
    { enabled: chatId > 0 }
  );

  const baseCurrency = chatData?.baseCurrency ?? "SGD";

  const categoriesIndex = useMemo(() => {
    const m = new Map<string, { emoji: string; title: string }>();
    for (const c of categoriesData?.items ?? []) {
      m.set(c.id, { emoji: c.emoji, title: c.title });
    }
    return m;
  }, [categoriesData?.items]);

  // First pass — compute targetCurrencies from the dataset without rates, so
  // we can drive the FX query's `enabled` flag correctly.
  const preliminary: AggregationResult = useCategoryAggregation({
    expenses: expensesData ?? [],
    userId,
    baseCurrency,
    categoriesIndex,
    categoryFilters,
    pickedMonthKey,
    rates: {},
    ratesReady: true,
  });

  const { data: ratesData, status: ratesStatus } =
    trpc.currency.getMultipleRates.useQuery(
      {
        baseCurrency,
        targetCurrencies: preliminary.targetCurrencies,
      },
      {
        enabled:
          !!baseCurrency &&
          preliminary.targetCurrencies.length > 0 &&
          // Only fetch once we actually have a user id — avoids a stray
          // request on first paint.
          userId > 0,
      }
    );

  // Second pass — now with live rates.
  const aggregation = useCategoryAggregation({
    expenses: expensesData ?? [],
    userId,
    baseCurrency,
    categoriesIndex,
    categoryFilters,
    pickedMonthKey,
    rates: ratesData?.rates ?? {},
    ratesReady:
      preliminary.targetCurrencies.length === 0 || ratesStatus === "success",
  });

  // * Interactions =======================================================
  const collapseAll = useCallback(() => {
    setExpanded(false);
    setPickerOpen(false);
  }, []);

  // Tap outside collapses the card + picker. Use mousedown to match the feel
  // of Telegram modals (pre-release dismissal).
  useEffect(() => {
    if (!expanded) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      const node = rootRef.current;
      if (!node) return;
      if (node.contains(e.target as Node)) return;
      collapseAll();
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [expanded, collapseAll]);

  // When filters change, close the picker — but don't collapse the card or
  // reset pickedMonthKey (spec: user keeps their picked month even if it
  // becomes empty under a new filter).
  useEffect(() => {
    setPickerOpen(false);
  }, [categoryFilters]);

  // * Render =============================================================
  // Hide the ticker entirely when there's nothing to show. Two cases: chat
  // has no expenses at all, or user has no shares anywhere in the chat.
  if (!expensesData || aggregation.monthList.length === 0) {
    return null;
  }

  const { monthKey, baseTotal, byCategory, monthList, ratesReady, empty } =
    aggregation;

  const monthDisplay =
    monthList.find((m) => m.monthKey === monthKey)?.monthDisplay ?? "—";

  const chipSummary = renderChipSummary(categoryFilters, categoriesIndex);

  const togglePill = () => {
    tick();
    setExpanded((prev) => !prev);
    setPickerOpen(false);
  };

  const toggleMonthPicker: React.MouseEventHandler = (e) => {
    e.stopPropagation();
    tick();
    setPickerOpen((p) => !p);
  };

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-3"
      aria-live="polite"
    >
      <div
        ref={rootRef}
        className={cn(
          "pointer-events-auto relative overflow-visible text-white",
          "shadow-[0_10px_28px_rgba(0,0,0,0.35),0_0_0_1px_rgba(255,255,255,0.1)]"
        )}
        style={{
          backgroundColor: "rgba(20,20,25,0.94)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          borderRadius: expanded ? 18 : 999,
          minWidth: "min(88vw, 300px)",
          maxWidth: "min(94vw, 440px)",
          transition: `border-radius 280ms ${EASE}`,
        }}
      >
        {/* Header row — tappable to toggle expanded state. Using div+role to
            avoid nesting a real <button> (month pill) inside another. */}
        <div
          role="button"
          tabIndex={0}
          onClick={togglePill}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              togglePill();
            }
          }}
          aria-expanded={expanded}
          aria-label={
            expanded
              ? "Collapse aggregation ticker"
              : "Expand aggregation ticker"
          }
          className="flex w-full cursor-pointer select-none items-center gap-3 px-5 py-3 text-left"
        >
          {/* Month pill — separate tap target when expanded */}
          {expanded ? (
            <button
              type="button"
              onClick={toggleMonthPicker}
              aria-haspopup="listbox"
              aria-expanded={pickerOpen}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[13px] font-semibold transition-colors",
                pickerOpen
                  ? "bg-white/25"
                  : "bg-white/10 hover:bg-white/15 active:bg-white/20"
              )}
            >
              <span>{monthDisplay}</span>
              <ChevronDown
                size={14}
                strokeWidth={2.5}
                className={cn(
                  "opacity-70 transition-transform duration-200",
                  pickerOpen && "rotate-180"
                )}
              />
            </button>
          ) : (
            <span className="text-[13px] font-semibold opacity-85">
              {monthDisplay}
            </span>
          )}

          <span className="h-3.5 w-px shrink-0 bg-white/20" aria-hidden />

          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[14px] font-semibold tracking-tight",
              chipSummary.dim && "text-[11.5px] uppercase opacity-65"
            )}
          >
            {chipSummary.content}
          </span>

          <span
            className={cn(
              "shrink-0 whitespace-nowrap text-[15px] font-bold tabular-nums",
              empty && "opacity-45",
              !ratesReady && !empty && "opacity-50"
            )}
            style={{ color: empty ? undefined : "#66b3ff" }}
          >
            {formatCurrencyWithCode(baseTotal, baseCurrency)}
          </span>

          {/* Expand/collapse caret (kept subtle; the whole row is tappable) */}
          <ChevronDown
            size={16}
            strokeWidth={2.5}
            className={cn(
              "shrink-0 opacity-50 transition-transform duration-200",
              expanded && "rotate-180"
            )}
          />
        </div>

        {/* Expanded body */}
        <div
          className="overflow-hidden"
          style={{
            maxHeight: expanded ? EXPANDED_MAX_HEIGHT : 0,
            opacity: expanded ? 1 : 0,
            transition: `max-height 280ms ${EASE}, opacity 220ms ${EASE}`,
          }}
          aria-hidden={!expanded}
        >
          <div className="bg-white/12 h-px" />
          {categories.length > 0 && (
            <div className="py-1">
              <CategoryFilterStrip
                categories={categories}
                selectedIds={categoryFilters}
                counts={categoryCounts}
                onChange={onCategoryFiltersChange}
              />
            </div>
          )}
          <div className="bg-white/12 h-px" />
          {empty ? (
            <div className="px-4 py-5 text-center text-[11px] opacity-65">
              No expenses in {monthDisplay} match this filter.
            </div>
          ) : (
            <div
              className="max-h-[60vh] overflow-y-auto [&::-webkit-scrollbar]:hidden"
              style={{ maxHeight: "min(60vh, 420px)" }}
            >
              {byCategory.map((cat) => (
                <CategoryRow
                  key={cat.categoryId}
                  cat={cat}
                  baseCurrency={baseCurrency}
                  ratesReady={ratesReady}
                />
              ))}
            </div>
          )}
        </div>

        {/* Month picker popover — positioned above the month pill */}
        {expanded && pickerOpen && (
          <MonthPickerPopover
            months={monthList}
            activeMonthKey={monthKey}
            baseCurrency={baseCurrency}
            onPick={(mk) => {
              setPickedMonthKey(mk);
              setPickerOpen(false);
            }}
          />
        )}
      </div>
    </div>
  );
}

interface CategoryRowProps {
  cat: CategoryAggregate;
  baseCurrency: string;
  ratesReady: boolean;
}

function CategoryRow({ cat, baseCurrency, ratesReady }: CategoryRowProps) {
  // Skip native breakdown lines when the category has just one currency and
  // that currency is the base — the total already conveys the same number.
  const showBreakdown =
    cat.byCurrency.length > 1 ||
    (cat.byCurrency.length === 1 &&
      cat.byCurrency[0].currency !== baseCurrency);

  const loading = !ratesReady && cat.needsConversion;
  return (
    <div className="border-white/6 grid grid-cols-[1fr_auto] items-start gap-x-4 border-t px-5 py-3 first:border-t-0">
      <div className="flex items-center gap-2.5 text-[14px] font-semibold">
        <span className="text-[18px] leading-none">{cat.emoji}</span>
        <span className="truncate">{cat.title}</span>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <div
          className={cn(
            "whitespace-nowrap text-[15px] font-bold tabular-nums",
            loading && "opacity-50"
          )}
          style={{ color: "#66b3ff" }}
        >
          {formatCurrencyWithCode(cat.baseTotal, baseCurrency)}
        </div>
        {showBreakdown &&
          cat.byCurrency.map((bc) => (
            <div
              key={bc.currency}
              className="whitespace-nowrap text-[11px] font-medium tabular-nums opacity-55"
            >
              {formatCurrencyWithCode(bc.amount, bc.currency)}
            </div>
          ))}
      </div>
    </div>
  );
}

// Renders the "chips or 'All'" summary in the collapsed/expanded header.
function renderChipSummary(
  categoryFilters: string[],
  categoriesIndex: Map<string, { emoji: string; title: string }>
): { content: React.ReactNode; dim: boolean } {
  if (categoryFilters.length === 0) {
    return { content: "All", dim: true };
  }
  // Show the emoji run up to 3 chips; collapse past that.
  if (categoryFilters.length <= 3) {
    const emojis = categoryFilters
      .map((id) =>
        id === "none" ? "📭" : (categoriesIndex.get(id)?.emoji ?? "🏷️")
      )
      .join("");
    return {
      content: <span className="text-[13px] tracking-[-1px]">{emojis}</span>,
      dim: false,
    };
  }
  return { content: `${categoryFilters.length} cat.`, dim: true };
}
