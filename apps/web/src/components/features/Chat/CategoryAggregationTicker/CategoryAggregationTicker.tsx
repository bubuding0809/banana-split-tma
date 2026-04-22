import { useEffect, useMemo, useState } from "react";
import {
  hapticFeedback,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import { IconButton, Modal, Title } from "@telegram-apps/telegram-ui";
import { ChevronDown, ChevronUp, X } from "lucide-react";
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
  const [modalOpen, setModalOpen] = useState(false);
  const [pickedMonthKey, setPickedMonthKey] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);

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

  // Close the month picker whenever filters change or modal closes.
  useEffect(() => {
    setPickerOpen(false);
  }, [categoryFilters, modalOpen]);

  // * Render =============================================================
  if (!expensesData || aggregation.monthList.length === 0) {
    return null;
  }

  const { monthKey, baseTotal, byCategory, monthList, ratesReady, empty } =
    aggregation;

  const monthDisplay =
    monthList.find((m) => m.monthKey === monthKey)?.monthDisplay ?? "—";

  const chipSummary = renderChipSummary(categoryFilters, categoriesIndex);

  const openModal = () => {
    tick();
    setModalOpen(true);
  };

  const toggleMonthPicker: React.MouseEventHandler = (e) => {
    e.stopPropagation();
    tick();
    setPickerOpen((p) => !p);
  };

  return (
    <>
      {/* Always-visible pill. Tap → opens the modal below. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-3">
        <button
          type="button"
          onClick={openModal}
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

      {/* Telegram UI Modal, summoned by tapping the pill. Same pattern as
          TransactionFiltersModal / MultiCurrencyBalanceModal elsewhere
          in the app. */}
      <Modal
        open={modalOpen}
        onOpenChange={setModalOpen}
        header={
          <Modal.Header
            before={
              <Title level="3" weight="1">
                Damage · {monthDisplay}
              </Title>
            }
            after={
              <Modal.Close>
                <IconButton
                  size="s"
                  mode="gray"
                  onClick={() => hapticFeedback.impactOccurred("light")}
                >
                  <X
                    size={20}
                    strokeWidth={3}
                    style={{ color: tSubtitleTextColor }}
                  />
                </IconButton>
              </Modal.Close>
            }
          />
        }
      >
        <div className="flex max-h-[70vh] min-h-64 flex-col pb-4">
          {/* Sub-header — month pill (opens picker) + chip summary + amount */}
          <div className="relative flex w-full shrink-0 items-center gap-3 px-5 py-3">
            <button
              type="button"
              onClick={toggleMonthPicker}
              aria-haspopup="listbox"
              aria-expanded={pickerOpen}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[13px] font-semibold transition-colors",
                pickerOpen
                  ? "bg-black/15 dark:bg-white/25"
                  : "bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/15"
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

            <span
              className="h-3.5 w-px shrink-0 bg-black/15 dark:bg-white/20"
              aria-hidden
            />

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
              style={{ color: "var(--tg-theme-link-color)" }}
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

          {/* Interactive category filter strip */}
          {categories.length > 0 && (
            <div className="dark:border-white/12 shrink-0 border-t border-black/5 py-1">
              <CategoryFilterStrip
                categories={categories}
                selectedIds={categoryFilters}
                counts={categoryCounts}
                onChange={onCategoryFiltersChange}
              />
            </div>
          )}

          {/* Scrollable category list */}
          {empty ? (
            <div className="dark:border-white/12 border-t border-black/5 px-4 py-8 text-center text-[12px] opacity-65">
              No expenses in {monthDisplay} match this filter.
            </div>
          ) : (
            <div className="dark:border-white/12 flex-1 overflow-y-auto border-t border-black/5 [&::-webkit-scrollbar]:hidden">
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
      </Modal>
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
    <div className="dark:border-white/6 grid grid-cols-[1fr_auto] items-start gap-x-4 border-t border-black/5 px-5 py-3 first:border-t-0">
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
          style={{ color: "var(--tg-theme-link-color)" }}
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
