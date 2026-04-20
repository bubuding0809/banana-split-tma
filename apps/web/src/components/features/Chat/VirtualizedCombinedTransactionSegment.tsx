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
  categoryFilter?: string | null;
  chatRows?: ChatCategoryRow[];
}

export interface VirtualizedCombinedTransactionSegmentRef {
  scrollToTransaction: (transactionId: string) => Promise<boolean>;
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
      categoryFilter,
      chatRows = [],
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

    // Apply category filter predicate to expenses before grouping.
    // "none" is the synthetic "Uncategorized" filter: matches rows with categoryId === null.
    const filteredExpenses = useMemo(() => {
      if (!expenses) return expenses;
      if (!categoryFilter) return expenses;
      if (categoryFilter === "none") {
        return expenses.filter(
          (e: (typeof expenses)[number]) => e.categoryId === null
        );
      }
      return expenses.filter(
        (e: (typeof expenses)[number]) => e.categoryId === categoryFilter
      );
    }, [expenses, categoryFilter]);

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

    // Expose methods via ref
    useImperativeHandle(
      ref,
      () => ({
        scrollToTransaction,
      }),
      [scrollToTransaction]
    );

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
