import { useEffect, useMemo, useRef, useState } from "react";
import { hapticFeedback } from "@telegram-apps/sdk-react";
import { ChevronDown } from "lucide-react";
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

// Snap points drive the pill ↔ expanded transition. Drawer.Content gets a
// fixed height matching the largest snap; Vaul translateY's the box so
// only the active snap's pixels are visible at the viewport bottom. Using
// pixel values (not viewport fractions) keeps the math consistent across
// device sizes and matches Drawer.Content's explicit height.
const SNAP_COLLAPSED = "72px";
const SNAP_EXPANDED = "520px";
const SNAP_POINTS: (string | number)[] = [SNAP_COLLAPSED, SNAP_EXPANDED];

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
  const [activeSnap, setActiveSnap] = useState<number | string | null>(
    SNAP_COLLAPSED
  );
  // Controlled open state — Vaul's snap-points system misbehaves when
  // `open={true}` is hardcoded at initial render. Flipping from false →
  // true in a useEffect lets Vaul run its normal open animation.
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    setDrawerOpen(true);
  }, []);
  const [pickedMonthKey, setPickedMonthKey] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const expanded = activeSnap !== SNAP_COLLAPSED && activeSnap !== null;

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

  // * Interactions =======================================================
  // Vaul's modal={false} doesn't provide tap-outside-to-close, so we keep
  // the hand-rolled listener. When the user taps anywhere outside the
  // drawer while expanded, snap back to the pill.
  useEffect(() => {
    if (!expanded) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      const node = rootRef.current;
      if (!node) return;
      if (node.contains(e.target as Node)) return;
      setActiveSnap(SNAP_COLLAPSED);
      setPickerOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [expanded]);

  // When filters change, close the picker — but don't collapse the drawer
  // or reset pickedMonthKey.
  useEffect(() => {
    setPickerOpen(false);
  }, [categoryFilters]);

  // * Render =============================================================
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
    setActiveSnap(expanded ? SNAP_COLLAPSED : SNAP_EXPANDED);
    setPickerOpen(false);
  };

  const toggleMonthPicker: React.MouseEventHandler = (e) => {
    e.stopPropagation();
    tick();
    setPickerOpen((p) => !p);
  };

  return (
    <Drawer.Root
      open={drawerOpen}
      onOpenChange={setDrawerOpen}
      modal={false}
      dismissible={false}
      repositionInputs={false}
      snapPoints={SNAP_POINTS}
      activeSnapPoint={activeSnap}
      setActiveSnapPoint={setActiveSnap}
    >
      <Drawer.Portal>
        {/* Drawer.Content needs the full-viewport height (h-full max-h-97%)
            for Vaul's snap math to position it correctly. Outer is kept
            edge-to-edge per Vaul convention; the visible pill lives as an
            inner centered child so our width/margin tricks don't collide
            with Vaul's transform. Outer is transparent; inner is the
            colored pill. */}
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-20 h-[520px] bg-transparent outline-none">
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
            ref={rootRef}
            className={cn(
              "mx-auto flex h-full flex-col rounded-t-[18px]",
              "w-[min(85vw,440px)] text-white",
              "shadow-[0_10px_28px_rgba(0,0,0,0.35),0_0_0_1px_rgba(255,255,255,0.1)]"
            )}
            style={{
              backgroundColor: "rgba(20,20,25,0.94)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
            }}
          >
            {/* Drag handle — with handleOnly={true}, this is the only area
                that responds to drag gestures. Content below stays
                scrollable. Visible ribbon only when expanded. */}
            <Drawer.Handle
              className={cn(
                "mx-auto my-1.5 !h-1 !w-10 shrink-0 !bg-white/25",
                !expanded && "hidden"
              )}
            />

            {/* Header row — tappable to toggle between snap points */}
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
              className="flex w-full flex-shrink-0 cursor-pointer select-none items-center gap-3 px-5 py-3 text-left"
            >
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

              <ChevronDown
                size={16}
                strokeWidth={2.5}
                className={cn(
                  "shrink-0 opacity-50 transition-transform duration-200",
                  expanded && "rotate-180"
                )}
              />
            </div>

            {expanded && (
              <div
                className="flex min-h-0 flex-1 flex-col"
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
            )}

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
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );

  return (
    <Drawer.Root
      open
      modal={false}
      dismissible={false}
      repositionInputs={false}
      snapPoints={SNAP_POINTS}
      activeSnapPoint={activeSnap}
      setActiveSnapPoint={setActiveSnap}
    >
      <Drawer.Portal>
        {/* Drawer.Content is kept edge-to-edge per Vaul's convention — its
            translateY is what Vaul animates. The actual visible pill/card
            lives inside as a centered child so we don't fight Vaul's
            transform with our own width/margin tricks. Outer is
            transparent; inner is the colored pill. */}
        <Drawer.Content
          className="fixed bottom-0 left-0 right-0 z-20 bg-transparent outline-none"
          style={{ height: SNAP_EXPANDED }}
        >
          {/* Visually-hidden title/description satisfy Radix Dialog's a11y
              requirements without adding UI chrome. */}
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
            ref={rootRef}
            className={cn(
              "mx-auto mb-3 flex h-full flex-col",
              "w-[min(85vw,440px)] text-white",
              "shadow-[0_10px_28px_rgba(0,0,0,0.35),0_0_0_1px_rgba(255,255,255,0.1)]"
            )}
            style={{
              backgroundColor: "rgba(20,20,25,0.94)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              // Fully round when collapsed (pill); softly round when
              // expanded (card). Vaul handles height; we animate the
              // corner radius to make the morph feel continuous.
              borderRadius: expanded ? 18 : 999,
              transition: "border-radius 280ms cubic-bezier(0.23,1,0.32,1)",
            }}
          >
            {/* Header row — tappable to toggle between snap points. Using
              div+role to avoid nesting a real button (the month pill)
              inside another button. */}
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
              className="flex w-full flex-shrink-0 cursor-pointer select-none items-center gap-3 px-5 py-3 text-left"
            >
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

              <ChevronDown
                size={16}
                strokeWidth={2.5}
                className={cn(
                  "shrink-0 opacity-50 transition-transform duration-200",
                  expanded && "rotate-180"
                )}
              />
            </div>

            {/* Expanded body. Only mounted when we're at (or animating to)
              the expanded snap — Vaul clips the overflow at the collapsed
              snap, but rendering nothing below avoids layout thrash. */}
            {expanded && (
              <div
                className="flex min-h-0 flex-1 flex-col"
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
            )}

            {/* Month picker popover — mounts inside the pill so its
                positioning stays relative to the card. */}
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
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
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
