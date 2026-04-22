import { useEffect, useMemo, useRef, useState } from "react";
import { hapticFeedback } from "@telegram-apps/sdk-react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Drawer } from "vaul";
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pickedMonthKey, setPickedMonthKey] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const drawerContentRef = useRef<HTMLDivElement | null>(null);
  const pillRef = useRef<HTMLButtonElement | null>(null);

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
          userId > 0,
      }
    );

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

  // Close the month picker whenever filters change or drawer is closed.
  useEffect(() => {
    setPickerOpen(false);
  }, [categoryFilters, drawerOpen]);

  // Tap-outside-to-close. With modal={false}, Vaul doesn't dim the
  // background or intercept clicks, so we wire it up ourselves. Taps on
  // the pill itself are excluded so the re-open doesn't flicker.
  useEffect(() => {
    if (!drawerOpen) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (drawerContentRef.current?.contains(target)) return;
      if (pillRef.current?.contains(target)) return;
      setDrawerOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [drawerOpen]);

  // * Render =============================================================
  if (!expensesData || aggregation.monthList.length === 0) {
    return null;
  }

  const { monthKey, baseTotal, byCategory, monthList, ratesReady, empty } =
    aggregation;

  const monthDisplay =
    monthList.find((m) => m.monthKey === monthKey)?.monthDisplay ?? "—";

  const chipSummary = renderChipSummary(categoryFilters, categoriesIndex);

  const openDrawer = () => {
    tick();
    setDrawerOpen(true);
  };

  const toggleMonthPicker: React.MouseEventHandler = (e) => {
    e.stopPropagation();
    tick();
    setPickerOpen((p) => !p);
  };

  return (
    <>
      {/* Always-visible pill. Pure custom component — tapping opens the
          drawer below. Position: absolute inside the transaction tab
          section so it disappears on tab change. pointer-events on outer
          wrapper are disabled so empty space above the pill doesn't
          block taps on the expense list behind. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-3">
        <button
          ref={pillRef}
          type="button"
          onClick={openDrawer}
          aria-label="Open category damage summary"
          className={cn(
            "pointer-events-auto flex cursor-pointer select-none items-center gap-3 rounded-full",
            "w-[min(85vw,440px)] px-5 py-3 text-left text-white",
            "shadow-[0_10px_28px_rgba(0,0,0,0.35),0_0_0_1px_rgba(255,255,255,0.1)]",
            "transition-transform duration-150 active:scale-[0.98]"
          )}
          style={{
            backgroundColor: "rgba(20,20,25,0.94)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
          }}
        >
          <span className="text-[13px] font-semibold opacity-85">
            {monthDisplay}
          </span>

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

          <ChevronUp
            size={16}
            strokeWidth={2.5}
            className="shrink-0 opacity-50"
          />
        </button>
      </div>

      {/* Standard Vaul bottom sheet, summoned by tapping the pill. */}
      <Drawer.Root
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        modal={false}
        repositionInputs={false}
      >
        <Drawer.Portal>
          <Drawer.Content
            ref={drawerContentRef}
            className="fixed bottom-0 left-0 right-0 z-30 mt-24 flex h-[70vh] flex-col rounded-t-[18px] text-white outline-none"
          >
            <Drawer.Title className="sr-only">
              Category damage · {monthDisplay}
            </Drawer.Title>
            <Drawer.Description className="sr-only">
              Your personal share of expenses for {monthDisplay},
              {chipSummary.label
                ? ` filtered by ${chipSummary.label}`
                : " across all categories"}
              .
            </Drawer.Description>

            <div
              className="relative flex flex-1 flex-col overflow-hidden rounded-t-[18px]"
              style={{
                backgroundColor: "rgba(20,20,25,0.97)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
              }}
            >
              {/* Drag handle */}
              <div
                aria-hidden
                className="mx-auto my-2 h-1 w-10 shrink-0 rounded-full bg-white/25"
              />

              {/* Header row — month pill button (opens picker) + chips
                  summary + amount. Same info as the collapsed pill for
                  continuity. */}
              <div className="relative flex w-full shrink-0 items-center gap-3 px-5 pb-2 pt-1">
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
                  className="shrink-0 whitespace-nowrap text-[15px] font-bold tabular-nums"
                  style={{ color: "#66b3ff" }}
                >
                  {formatCurrencyWithCode(baseTotal, baseCurrency)}
                </span>

                {pickerOpen && (
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

              <div className="bg-white/12 h-px" />

              {/* Interactive category filter strip */}
              {categories.length > 0 && (
                <div className="shrink-0 py-1">
                  <CategoryFilterStrip
                    categories={categories}
                    selectedIds={categoryFilters}
                    counts={categoryCounts}
                    onChange={onCategoryFiltersChange}
                  />
                </div>
              )}

              <div className="bg-white/12 h-px" />

              {/* Scrollable category list */}
              {empty ? (
                <div className="px-4 py-8 text-center text-[12px] opacity-65">
                  No expenses in {monthDisplay} match this filter.
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden">
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
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  );
}

interface CategoryRowProps {
  cat: CategoryAggregate;
  baseCurrency: string;
  ratesReady: boolean;
}

function CategoryRow({ cat, baseCurrency, ratesReady }: CategoryRowProps) {
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

function renderChipSummary(
  categoryFilters: string[],
  categoriesIndex: Map<string, { emoji: string; title: string }>
): { content: React.ReactNode; dim: boolean; label: string } {
  if (categoryFilters.length === 0) {
    return { content: "All", dim: true, label: "" };
  }
  if (categoryFilters.length <= 3) {
    const emojis = categoryFilters
      .map((id) =>
        id === "none" ? "📭" : (categoriesIndex.get(id)?.emoji ?? "🏷️")
      )
      .join("");
    return {
      content: <span className="text-[13px] tracking-[-1px]">{emojis}</span>,
      dim: false,
      label: `${categoryFilters.length} ${categoryFilters.length === 1 ? "category" : "categories"}`,
    };
  }
  return {
    content: `${categoryFilters.length} cat.`,
    dim: true,
    label: `${categoryFilters.length} categories`,
  };
}
