import { useVirtualizer } from "@tanstack/react-virtual";
import {
  useRef,
  useMemo,
  memo,
  useEffect,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from "react";
import { resolveCategory, type ChatCategoryRow } from "@repo/categories";
import {
  Caption,
  Cell,
  Divider,
  Info,
  Placeholder,
  Section,
  Skeleton,
  Subheadline,
  Text,
} from "@telegram-apps/telegram-ui";
import { initData, themeParams, useSignal } from "@telegram-apps/sdk-react";
import { trpc } from "@utils/trpc";
import { formatMonthYear } from "@utils/date";
import ChatExpenseCell from "./ChatExpenseCell";
import ChatSettlementCell from "./ChatSettlementCell";
import { useSearch } from "@tanstack/react-router";
import { useTransactionGrouping } from "@/hooks/useTransactionGrouping";
import { CombinedTransaction } from "@/types/transaction.types";
import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";

interface VirtualizedCombinedTransactionSegmentProps {
  chatId: number;
  showPayments: boolean;
  onAvailableDatesChange?: (
    monthsData: {
      monthKey: string;
      monthDisplay: string;
      dates: { key: string; display: string; transactionIds: string[] }[];
    }[]
  ) => void;
  categoryFilters?: string[];
  chatRows?: ChatCategoryRow[];
  /**
   * Fires whenever the top-most visible month changes as the user
   * scrolls. Used by the aggregation ticker to keep its month picker
   * in sync with the list.
   */
  onVisibleMonthChange?: (monthKey: string | null) => void;
}

export interface VirtualizedCombinedTransactionSegmentRef {
  scrollToTransaction: (transactionId: string) => Promise<boolean>;
  /**
   * Scroll the list so the given month's header (or its first
   * transaction as a fallback) aligns with the top of the viewport.
   * Returns false if the month isn't present in the current filtered
   * view.
   */
  scrollToMonth: (monthKey: string) => Promise<boolean>;
}

type VirtualListItem =
  | { type: "header"; key: string; dateDisplay: string }
  | {
      type: "transaction";
      key: string;
      transaction: CombinedTransaction;
      monthKey: string;
    };

const VirtualizedCombinedTransactionSegment = forwardRef<
  VirtualizedCombinedTransactionSegmentRef,
  VirtualizedCombinedTransactionSegmentProps
>(
  (
    {
      chatId,
      showPayments,
      onAvailableDatesChange,
      categoryFilters,
      chatRows = [],
      onVisibleMonthChange,
    },
    ref
  ) => {
    const searchParams = useSearch({ strict: false }) as {
      relatedOnly?: boolean;
      sortBy?: "date" | "createdAt";
      sortOrder?: "asc" | "desc";
    };
    const relatedOnly = searchParams.relatedOnly ?? true;
    const sortBy = searchParams.sortBy ?? "date";
    const sortOrder = searchParams.sortOrder ?? "desc";
    const parentRef = useRef<HTMLDivElement>(null);
    const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);
    const tUserData = useSignal(initData.user);
    const userId = tUserData?.id ?? 0;

    // * Queries =====================================================================================
    const { data: expenses, isLoading: isExpensesLoading } =
      trpc.expense.getAllExpensesByChat.useQuery({
        chatId,
      });

    const { data: settlements, isLoading: isSettlementsLoading } =
      trpc.settlement.getAllSettlementsByChat.useQuery({
        chatId,
      });

    const isLoading = isExpensesLoading || isSettlementsLoading;

    // Multi-select category filter. Empty array = no filter (pass through).
    // "none" in the set matches expenses with a null categoryId (Uncategorized).
    const filteredExpenses = useMemo(() => {
      if (!expenses) return expenses;
      if (!categoryFilters || categoryFilters.length === 0) return expenses;
      const selected = new Set(categoryFilters);
      return expenses.filter((e: (typeof expenses)[number]) =>
        selected.has(e.categoryId ?? "none")
      );
    }, [expenses, categoryFilters]);

    // Use the extracted transaction grouping hook
    const { groupedTransactions, sortedKeys, monthGroupedData } =
      useTransactionGrouping({
        expenses: filteredExpenses,
        settlements,
        showPayments,
        relatedOnly,
        userId,
        sortBy,
        sortOrder,
      });

    // Update available dates when they change
    useEffect(() => {
      if (onAvailableDatesChange && monthGroupedData.length > 0) {
        onAvailableDatesChange(monthGroupedData);
      }
    }, [monthGroupedData, onAvailableDatesChange]);

    // Flatten grouped transactions into virtual list items
    const virtualItems = useMemo((): VirtualListItem[] => {
      const items: VirtualListItem[] = [];

      sortedKeys.forEach((key) => {
        const transactions = groupedTransactions[key];
        const dateDisplay = formatMonthYear(new Date(key));

        // Add header
        items.push({
          type: "header",
          key: `header-${key}`,
          dateDisplay,
        });

        // Add transactions
        transactions.forEach((transaction) => {
          items.push({
            type: "transaction",
            key: `transaction-${transaction.type}-${transaction.id}`,
            transaction,
            monthKey: key,
          });
        });
      });

      return items;
    }, [sortedKeys, groupedTransactions]);

    // Create virtualizer with dynamic sizing
    const virtualizer = useVirtualizer({
      count: virtualItems.length,
      getScrollElement: () => parentRef.current,
      estimateSize: (index) => {
        const item = virtualItems[index];
        if (!item) return 80;

        // Headers are smaller
        if (item.type === "header") return 60;

        // Transactions have base height + account for content
        return 80;
      },
      overscan: 5,
      getItemKey: (index) => virtualItems[index]?.key ?? index,
    });

    // Utility function to find virtual item index from transaction ID
    const findTransactionIndex = useCallback(
      (transactionId: string): number => {
        return virtualItems.findIndex(
          (item) =>
            item.type === "transaction" && item.transaction.id === transactionId
        );
      },
      [virtualItems]
    );

    // Virtual scrolling method exposed via ref
    const scrollToTransaction = useCallback(
      async (transactionId: string): Promise<boolean> => {
        const index = findTransactionIndex(transactionId);

        if (index === -1) {
          return false;
        }

        // Scroll to the transaction using virtualizer
        virtualizer.scrollToIndex(index, {
          align: "start",
          behavior: "auto",
        });

        return true;
      },
      [virtualizer, findTransactionIndex]
    );

    // Scroll to the first item under the given month key. Prefers the
    // month's header row; falls back to its first transaction if the
    // header somehow isn't present in the current virtualItems (e.g.,
    // the filter hid everything but a single row).
    const scrollToMonth = useCallback(
      async (monthKey: string): Promise<boolean> => {
        const headerKey = `header-${monthKey}`;
        let index = virtualItems.findIndex(
          (item) => item.type === "header" && item.key === headerKey
        );
        if (index === -1) {
          index = virtualItems.findIndex(
            (item) => item.type === "transaction" && item.monthKey === monthKey
          );
        }
        if (index === -1) return false;

        virtualizer.scrollToIndex(index, {
          align: "start",
          behavior: "auto",
        });
        return true;
      },
      [virtualizer, virtualItems]
    );

    // Expose methods via ref
    useImperativeHandle(
      ref,
      () => ({
        scrollToTransaction,
        scrollToMonth,
      }),
      [scrollToTransaction, scrollToMonth]
    );

    // Watch the scroll position and emit a month-change callback when
    // the dominant visible month changes.
    //
    // Default rule: pick the month with the most vertical area inside
    // the viewport — reads as "the month you're looking at" and keeps
    // the pill stable when a neighbouring month's header peeks in.
    //
    // End-of-scroll exception: once the list is pinned to its bottom,
    // the oldest month often has too few rows to ever dominate by area
    // (footer + short tail crowd it out), so we fall back to the
    // bottom-most visible row's month. Without this the pill would
    // never reach the final month just by scrolling.
    //
    // rAF-throttled so fast scrolls don't flood the parent.
    const lastEmittedMonthRef = useRef<string | null>(null);
    useEffect(() => {
      if (!onVisibleMonthChange) return;
      const el = parentRef.current;
      if (!el) return;

      let raf = 0;
      const detect = () => {
        raf = 0;
        const items = virtualizer.getVirtualItems();
        if (items.length === 0) return;
        const offset = virtualizer.scrollOffset ?? 0;
        const viewportEnd = offset + el.clientHeight;
        const atBottom = viewportEnd >= el.scrollHeight - 1;

        const itemMonthKey = (idx: number): string | null => {
          const item = virtualItems[idx];
          if (!item) return null;
          return item.type === "header"
            ? item.key.replace(/^header-/, "")
            : item.monthKey;
        };

        let monthKey: string | null = null;

        if (atBottom) {
          // Bottom-most visible row — iterates from the tail so we
          // hit the last row whose extents overlap the viewport.
          for (let i = items.length - 1; i >= 0; i--) {
            const v = items[i];
            if (v.start < viewportEnd && v.end > offset) {
              monthKey = itemMonthKey(v.index);
              break;
            }
          }
        } else {
          // Max-area — sum visible height per month and keep the
          // largest.
          const areaByMonth = new Map<string, number>();
          for (const v of items) {
            const top = Math.max(v.start, offset);
            const bottom = Math.min(v.end, viewportEnd);
            const visible = bottom - top;
            if (visible <= 0) continue;
            const key = itemMonthKey(v.index);
            if (!key) continue;
            areaByMonth.set(key, (areaByMonth.get(key) ?? 0) + visible);
          }
          let bestArea = 0;
          for (const [m, a] of areaByMonth) {
            if (a > bestArea) {
              bestArea = a;
              monthKey = m;
            }
          }
        }

        if (!monthKey) return;
        if (monthKey === lastEmittedMonthRef.current) return;
        lastEmittedMonthRef.current = monthKey;
        onVisibleMonthChange(monthKey);
      };
      const onScroll = () => {
        if (raf !== 0) return;
        raf = requestAnimationFrame(detect);
      };

      el.addEventListener("scroll", onScroll, { passive: true });
      // Fire once on mount so the initial top month propagates.
      detect();

      return () => {
        el.removeEventListener("scroll", onScroll);
        if (raf !== 0) cancelAnimationFrame(raf);
      };
    }, [virtualizer, virtualItems, onVisibleMonthChange]);

    // Check if both arrays are empty (not loading and no data)
    const hasNoTransactions =
      !isLoading && (expenses?.length || 0) + (settlements?.length || 0) === 0;

    if (isLoading) {
      return (
        <ul className="p-2">
          <div className="p-2">
            <Skeleton visible>
              <Text>Loading</Text>
            </Skeleton>
          </div>
          {Array.from({ length: 10 }).map((_, i) => (
            <>
              <Cell
                key={i}
                before={<ChatMemberAvatar userId={398} size={48} />}
                subhead={
                  <Skeleton visible>
                    <Caption weight="1" level="1">
                      Loading
                    </Caption>
                  </Skeleton>
                }
                description={
                  <Skeleton visible>
                    <Caption weight="1" level="2">
                      Loading
                    </Caption>
                  </Skeleton>
                }
                after={
                  <Info
                    avatarStack={
                      <Skeleton visible>
                        <Info type="text">
                          <div className="flex flex-col items-end gap-1.5">
                            <Caption className="w-max" weight="2">
                              Loading
                            </Caption>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xl">💰</span>
                              <span className="pe-0.5">▶︎</span>
                            </div>
                          </div>
                        </Info>
                      </Skeleton>
                    }
                    type="avatarStack"
                  />
                }
              >
                <Skeleton visible>Loading</Skeleton>
              </Cell>
              <Divider />
            </>
          ))}
        </ul>
      );
    }

    if (hasNoTransactions) {
      return (
        <Placeholder
          className="h-full"
          header="No transactions yet"
          description="Created expenses and settlements will appear here"
        >
          <img
            alt="Telegram sticker"
            src="https://xelene.me/telegram.gif"
            style={{
              display: "block",
              height: "144px",
              width: "144px",
            }}
          />
        </Placeholder>
      );
    }

    // Filters hid every transaction. Distinct from "no transactions yet"
    // because the chat does have content — users just need to relax filters.
    const hasNoFilteredResults = sortedKeys.length === 0;
    if (hasNoFilteredResults) {
      return (
        <Placeholder
          className="h-full"
          header="No matching transactions"
          description="Try adjusting your filters to see more"
        >
          <img
            alt="Telegram sticker"
            src="https://xelene.me/telegram.gif"
            style={{
              display: "block",
              height: "144px",
              width: "144px",
            }}
          />
        </Placeholder>
      );
    }

    return (
      <div
        ref={parentRef}
        className="h-full overflow-auto p-2 shadow-inner"
        style={{
          contain: "strict",
          scrollbarWidth: "thin",
        }}
      >
        <div
          style={{
            height: virtualizer.getTotalSize(),
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const item = virtualItems[virtualItem.index];
            if (!item) return null;

            return (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                {item.type === "header" ? (
                  <div
                    className="mt-2"
                    data-month-key={item.key.replace("header-", "")}
                  >
                    <Section
                      header={
                        <div className="p-2 px-4">
                          <Subheadline weight="2">
                            {item.dateDisplay}
                          </Subheadline>
                        </div>
                      }
                    />
                  </div>
                ) : (
                  <>
                    <Divider />
                    <VirtualTransactionItem
                      transaction={item.transaction}
                      monthKey={item.monthKey}
                      sortBy={sortBy}
                      chatRows={chatRows}
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>
        <Divider />
        <footer className="flex h-16 items-center justify-center">
          <Caption
            style={{
              color: tSubtitleTextColor,
            }}
          >
            Thats all the transactions!
          </Caption>
        </footer>
      </div>
    );
  }
);

VirtualizedCombinedTransactionSegment.displayName =
  "VirtualizedCombinedTransactionSegment";

const VirtualTransactionItem = memo(
  ({
    transaction,
    monthKey,
    sortBy,
    chatRows,
  }: {
    transaction: CombinedTransaction;
    monthKey: string;
    sortBy: "date" | "createdAt";
    chatRows: ChatCategoryRow[];
  }) => {
    if (transaction.type === "expense") {
      const categoryEmoji = resolveCategory(
        transaction.categoryId,
        chatRows
      )?.emoji;
      return (
        <div data-transaction-id={transaction.id} data-month-key={monthKey}>
          <ChatExpenseCell
            expense={transaction}
            sortBy={sortBy}
            categoryEmoji={categoryEmoji}
          />
        </div>
      );
    } else {
      return (
        <div data-transaction-id={transaction.id} data-month-key={monthKey}>
          <ChatSettlementCell settlement={transaction} />
        </div>
      );
    }
  }
);

VirtualTransactionItem.displayName = "VirtualTransactionItem";

export default VirtualizedCombinedTransactionSegment;
