import { Divider, IconButton, Modal, Title } from "@telegram-apps/telegram-ui";
import VirtualizedCombinedTransactionSegment from "./VirtualizedCombinedTransactionSegment";
import DateSelector from "./DateSelector";
import TransactionFiltersCell from "./TransactionFiltersCell";
import TransactionFiltersModal from "./TransactionFiltersModal";
import {
  hapticFeedback,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { X } from "lucide-react";
import {
  useState,
  useRef,
  useEffect,
  useMemo,
  useImperativeHandle,
  forwardRef,
} from "react";
import { useTransactionHighlight } from "@/hooks/useTransactionHighlight";
import { type VirtualizedCombinedTransactionSegmentRef } from "./VirtualizedCombinedTransactionSegment";
import { trpc } from "@/utils/trpc";
import { type ChatCategoryRow } from "@repo/categories";

type SortByOption = "date" | "createdAt";
type SortOrderOption = "asc" | "desc";

export type ChatTransactionTabRef = VirtualizedCombinedTransactionSegmentRef;

interface ChatTransactionTabProps {
  chatId: number;
  /**
   * Notified when the top-most visible month in the list changes.
   * The parent page wires this to the shared category-aggregation
   * ticker so its month picker stays in sync with the list's scroll
   * position.
   */
  onVisibleMonthChange?: (monthKey: string | null) => void;
}

const ChatTransactionTab = forwardRef<
  ChatTransactionTabRef,
  ChatTransactionTabProps
>(({ chatId, onVisibleMonthChange }, ref) => {
  const {
    selectedExpense,
    showPayments = true,
    relatedOnly = true,
    sortBy = "date" as SortByOption,
    sortOrder = "desc" as SortOrderOption,
    categoryFilters = [],
  } = useSearch({ strict: false }) as {
    selectedExpense?: string;
    showPayments?: boolean;
    relatedOnly?: boolean;
    sortBy?: SortByOption;
    sortOrder?: SortOrderOption;
    categoryFilters?: string[];
  };
  const navigate = useNavigate();

  // Route-agnostic search param updater (supports both /_tma/chat/ and /_tma/chat/$chatId)
  const updateSearchParams = (
    updater: (prev: Record<string, unknown>) => Record<string, unknown>
  ) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void navigate({ search: updater as any });
  };

  const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);
  const tButtonColor = useSignal(themeParams.buttonColor);

  const firstLoadDoneRef = useRef(false);
  const [jumpToDateModalOpen, setJumpToDateModalOpen] = useState(false);
  const [monthGroupedData, setMonthGroupedData] = useState<
    {
      monthKey: string;
      monthDisplay: string;
      dates: { key: string; display: string; transactionIds: string[] }[];
    }[]
  >([]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const { highlightTransactions } = useTransactionHighlight(tButtonColor);
  const virtualizedRef = useRef<VirtualizedCombinedTransactionSegmentRef>(null);

  // Expose the virtualized list's imperative API to the parent so the
  // floating aggregation ticker (now mounted at the page level) can
  // drive scrollToMonth without having to climb back through a ref
  // chain.
  useImperativeHandle(
    ref,
    () => ({
      scrollToTransaction: (transactionId: string) =>
        virtualizedRef.current?.scrollToTransaction(transactionId) ??
        Promise.resolve(false),
      scrollToMonth: (monthKey: string) =>
        virtualizedRef.current?.scrollToMonth(monthKey) ??
        Promise.resolve(false),
    }),
    []
  );

  // Auto-scroll to a deep-linked expense (e.g. tapped from a bot
  // notification's "View Expense" button). The virtualized segment's
  // `scrollToTransaction` only succeeds once the expenses query has
  // resolved AND the target is present in the current filtered view.
  // On a cold deep-link open the data isn't there yet, so the first
  // call returns false. Poll on a short interval until it succeeds or
  // we hit the cap — cheap, contained to this mount, and naturally
  // gives up for deleted/filtered-out expenses without user-visible
  // noise.
  useEffect(() => {
    if (!selectedExpense || firstLoadDoneRef.current) return;

    let cancelled = false;
    const MAX_ATTEMPTS = 25; // ~5s at 200ms
    const INTERVAL_MS = 200;

    const run = async () => {
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        if (cancelled) return;
        const ok =
          await virtualizedRef.current?.scrollToTransaction(selectedExpense);
        if (ok) {
          firstLoadDoneRef.current = true;
          return;
        }
        await new Promise((r) => setTimeout(r, INTERVAL_MS));
      }
      // Give up quietly. Target may be deleted or filtered out — the
      // user still lands on the transaction tab and can scroll/filter
      // manually.
      firstLoadDoneRef.current = true;
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [selectedExpense]);

  // * Queries ==================================================================================
  const { data: categoriesData } = trpc.category.listByChat.useQuery({
    chatId,
  });

  const chatRows = useMemo<ChatCategoryRow[]>(
    () =>
      (categoriesData?.items ?? [])
        .filter((c) => c.kind === "custom")
        .map((c) => ({
          id: c.id.replace(/^chat:/, ""),
          emoji: c.emoji,
          title: c.title,
        })),
    [categoriesData]
  );

  const handlePaymentsToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
    hapticFeedback.selectionChanged();
    updateSearchParams((prev) => ({
      ...prev,
      showPayments: event.target.checked,
    }));
  };

  const handleRelatedOnlyToggle = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    hapticFeedback.selectionChanged();
    updateSearchParams((prev) => ({
      ...prev,
      relatedOnly: event.target.checked,
    }));
  };

  const handleSortByChange = (newSortBy: SortByOption) => {
    hapticFeedback.selectionChanged();
    updateSearchParams((prev) => ({
      ...prev,
      sortBy: newSortBy,
    }));
  };

  const handleSortOrderChange = (newSortOrder: SortOrderOption) => {
    hapticFeedback.selectionChanged();
    updateSearchParams((prev) => ({
      ...prev,
      sortOrder: newSortOrder,
    }));
  };

  const handleDateSelect = async (dateKey: string) => {
    if (!dateKey) return;

    // Find the transaction IDs for this date across all months
    let selectedDate:
      | { key: string; display: string; transactionIds: string[] }
      | undefined;

    for (const month of monthGroupedData) {
      selectedDate = month.dates.find((date) => date.key === dateKey);
      if (selectedDate) break;
    }

    if (!selectedDate || selectedDate.transactionIds.length === 0) return;

    hapticFeedback.selectionChanged();

    // Close whichever modal is open
    if (jumpToDateModalOpen) {
      setJumpToDateModalOpen(false);
    } else {
      setFiltersOpen(false);
    }

    // Use virtual scrolling if available, otherwise fallback to DOM scrolling
    const firstTransactionId = selectedDate.transactionIds[0];
    const scrollSuccess =
      await virtualizedRef.current?.scrollToTransaction(firstTransactionId);

    if (scrollSuccess) {
      // Wait for virtual elements to be rendered, then highlight
      setTimeout(() => {
        highlightTransactions(selectedDate!.transactionIds, false);
      }, 100);
    } else {
      // Fallback to original highlighting with scroll
      highlightTransactions(selectedDate.transactionIds, true);
    }
  };

  return (
    <section className="relative flex h-full flex-col">
      {/* Transaction filters section */}
      <div className="shadow-xs">
        <TransactionFiltersCell
          showPayments={showPayments}
          relatedOnly={relatedOnly}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onOpenModal={() => setFiltersOpen(true)}
        />
        <Divider />
      </div>

      {/* Enhanced filters modal */}
      <TransactionFiltersModal
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        showPayments={showPayments}
        relatedOnly={relatedOnly}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onTogglePayments={handlePaymentsToggle}
        onToggleRelatedOnly={handleRelatedOnlyToggle}
        onSortByChange={handleSortByChange}
        onSortOrderChange={handleSortOrderChange}
        monthGroupedData={monthGroupedData}
        onDateSelect={handleDateSelect}
      />

      {/* Standalone Jump to date modal */}
      <Modal
        open={jumpToDateModalOpen}
        header={
          <Modal.Header
            before={
              <Title level="3" weight="1">
                Jump to date
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
                    style={{
                      color: tSubtitleTextColor,
                    }}
                  />
                </IconButton>
              </Modal.Close>
            }
          />
        }
        onOpenChange={setJumpToDateModalOpen}
      >
        <div className="min-h-64 pb-10">
          <DateSelector
            monthGroupedData={monthGroupedData}
            onDateSelect={handleDateSelect}
          />
        </div>
      </Modal>

      <VirtualizedCombinedTransactionSegment
        ref={virtualizedRef}
        chatId={chatId}
        showPayments={showPayments}
        onAvailableDatesChange={setMonthGroupedData}
        categoryFilters={categoryFilters}
        chatRows={chatRows}
        onVisibleMonthChange={onVisibleMonthChange}
      />
    </section>
  );
});

ChatTransactionTab.displayName = "ChatTransactionTab";

export default ChatTransactionTab;
