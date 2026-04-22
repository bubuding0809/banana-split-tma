import { useEffect, useMemo, useState } from "react";
import {
  hapticFeedback,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import { IconButton, Modal } from "@telegram-apps/telegram-ui";
import { ChevronDown, ChevronUp } from "lucide-react";
import { trpc } from "@/utils/trpc";
import { formatCurrencyWithCode } from "@/utils/financial";
import { cn } from "@/utils/cn";
import CategoryFilterStrip from "../CategoryFilterStrip";
import {
  useCategoryAggregation,
  type AggregationResult,
  type CategoryAggregate,
} from "./useCategoryAggregation";

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
  // Tracks whether any telegram-ui Modal anywhere on the page is open
  // (including our own — we don't want the pill peeking from behind our
  // own modal either, since it only takes up 50vh).
  const [anyModalOpen, setAnyModalOpen] = useState(false);
  const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);
  const tSectionBackgroundColor = useSignal(themeParams.sectionBackgroundColor);
  const tSectionHeaderTextColor = useSignal(themeParams.sectionHeaderTextColor);

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

  // Watch for any modal opening anywhere on the page. telegram-ui's
  // Modal is built on Vaul which uses Radix Dialog — its content root
  // carries role="dialog" and data-state="open" when visible. The
  // observer fires on any data-state change so we can toggle the pill
  // in lockstep.
  useEffect(() => {
    const update = () => {
      const openDialogs = document.querySelectorAll(
        '[role="dialog"][data-state="open"]'
      );
      setAnyModalOpen(openDialogs.length > 0);
    };
    const observer = new MutationObserver(update);
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state"],
      childList: true,
    });
    update();
    return () => observer.disconnect();
  }, []);

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

  return (
    <>
      {/* Always-visible pill. Slides down out of view when any other modal
          opens so it doesn't show behind them. Strong ease-out curve +
          translateY(120%) + opacity via CSS transitions (interruptible,
          hardware-accelerated). */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-3 py-2 pb-4 shadow-lg"
        style={{
          transform: anyModalOpen ? "translateY(120%)" : "translateY(0)",
          opacity: anyModalOpen ? 0 : 1,
          transition:
            "transform 260ms cubic-bezier(0.23, 1, 0.32, 1), opacity 180ms ease-out",
        }}
        aria-hidden={anyModalOpen}
      >
        <button
          type="button"
          onClick={openModal}
          aria-label="Open category damage summary"
          tabIndex={anyModalOpen ? -1 : 0}
          className={cn(
            "pointer-events-auto flex cursor-pointer select-none items-center gap-3 rounded-full",
            "w-[min(85vw,440px)] px-5 py-3 text-left text-white",
            "transition-transform duration-150 active:scale-[0.98]"
          )}
          style={{
            // Dark translucent base — low alpha so the backdrop shows
            // through and the blur+saturate has something to work on.
            // A subtle top-to-bottom white gradient simulates light
            // hitting the top of the glass.
            backgroundImage:
              "linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.02) 100%)",
            backgroundColor: "rgba(20,20,25,0.55)",
            backdropFilter: "blur(24px) saturate(180%)",
            WebkitBackdropFilter: "blur(24px) saturate(180%)",
            // Layered shadows give the glass its lift: an inset top
            // highlight (specular edge), an inset hairline border,
            // plus two drop shadows (close + ambient).
            boxShadow: [
              "inset 0 1px 0 rgba(255,255,255,0.22)",
              "inset 0 0 0 1px rgba(255,255,255,0.08)",
              "0 1px 2px rgba(0,0,0,0.25)",
              "0 12px 32px rgba(0,0,0,0.35)",
            ].join(", "),
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
              // Simple native <select> — triggers the OS wheel picker on
              // iOS/Android with zero chrome. Minimal styling; lets the
              // header title slot stay compact.
              <select
                aria-label="Pick month"
                value={monthKey ?? ""}
                onChange={(e) => {
                  hapticFeedback.selectionChanged.ifAvailable?.();
                  setPickedMonthKey(e.target.value);
                }}
                className="cursor-pointer rounded-md px-2 py-1 text-[15px] font-semibold outline-none"
                style={{
                  color: tSectionHeaderTextColor,
                  backgroundColor: tSectionBackgroundColor,
                  // color-scheme makes the browser tint the native
                  // dropdown arrow in line with the element's color —
                  // pure-CSS, no SVG overrides.
                  colorScheme: "light dark",
                }}
              >
                {monthList.map((m) => (
                  <option key={m.monthKey} value={m.monthKey}>
                    {m.monthDisplay}
                  </option>
                ))}
              </select>
            }
            after={
              <Modal.Close>
                <IconButton
                  size="s"
                  mode="gray"
                  onClick={() => hapticFeedback.impactOccurred("light")}
                >
                  <ChevronDown
                    size={20}
                    strokeWidth={3}
                    style={{ color: tSubtitleTextColor }}
                  />
                </IconButton>
              </Modal.Close>
            }
          >
            <span
              className="whitespace-nowrap text-[15px] font-bold tabular-nums"
              style={{ color: "var(--tg-theme-link-color)" }}
            >
              {formatCurrencyWithCode(baseTotal, baseCurrency)}
            </span>
          </Modal.Header>
        }
      >
        <div className="flex h-[50vh] flex-col pb-4">
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
