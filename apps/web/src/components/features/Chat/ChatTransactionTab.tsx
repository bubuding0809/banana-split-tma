import {
  ButtonCell,
  Cell,
  Divider,
  IconButton,
  Modal,
  Section,
  SectionProps,
  Switch,
  Title,
  Text,
  Caption,
  Info,
  AvatarStack,
  Avatar,
  Blockquote,
} from "@telegram-apps/telegram-ui";
import VirtualizedCombinedTransactionSegment from "./VirtualizedCombinedTransactionSegment";
import DateSelector from "./DateSelector";
import SortOptionsSelector from "./SortOptionsSelector";
import {
  hapticFeedback,
  initData,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import { getRouteApi } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarArrowUp,
  DollarSign,
  X,
  Link as LucideLink,
  SlidersHorizontal,
  ChevronsUpDown,
  ArrowLeftRight,
  LoaderCircle,
  ArrowDownUp,
  ChevronRight,
  ArrowDown,
  ArrowUp,
} from "lucide-react";
import { useState, useRef, useEffect, useMemo } from "react";
import { useTransactionHighlight } from "@/hooks/useTransactionHighlight";
import { VirtualizedCombinedTransactionSegmentRef } from "./VirtualizedCombinedTransactionSegment";
import { trpc } from "@/utils/trpc";

const routeApi = getRouteApi("/_tma/chat/$chatId");

type SortByOption = "date" | "createdAt";
type SortOrderOption = "asc" | "desc";

interface FilterSectionProps extends SectionProps {
  showPayments: boolean;
  relatedOnly: boolean;
  sortBy: SortByOption;
  sortOrder: SortOrderOption;
  handlePaymentsToggle: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleRelatedOnlyToggle: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onJumpToDate: () => void;
  onSortOptions: () => void;
}

const FilterSection = ({
  header,
  showPayments,
  relatedOnly,
  sortBy,
  sortOrder,
  handlePaymentsToggle,
  handleRelatedOnlyToggle,
  onJumpToDate,
  onSortOptions,
}: FilterSectionProps) => {
  const sortByLabel = sortBy === "date" ? "Transaction date" : "Created at";
  const sortOrderLabel = sortOrder === "desc" ? "Newest first" : "Oldest first";

  return (
    <Section header={header}>
      <ButtonCell before={<CalendarArrowUp size={20} />} onClick={onJumpToDate}>
        Jump to date
      </ButtonCell>
      <Cell
        Component="label"
        before={
          <span className="rounded-lg bg-green-500 p-1.5">
            <DollarSign size={20} color="white" />
          </span>
        }
        after={
          <Switch checked={showPayments} onChange={handlePaymentsToggle} />
        }
        description={
          <Caption className="text-wrap">
            Include payments in the transaction list
          </Caption>
        }
      >
        Include Payments
      </Cell>
      <Cell
        Component="label"
        before={
          <span className="rounded-lg bg-blue-500 p-1.5">
            <LucideLink size={20} color="white" />
          </span>
        }
        after={
          <Switch checked={relatedOnly} onChange={handleRelatedOnlyToggle} />
        }
        description={
          <Caption className="text-wrap">
            Show only transactions that involve you
          </Caption>
        }
      >
        Show Related Only
      </Cell>
      <Cell
        onClick={onSortOptions}
        before={
          <span className="rounded-lg bg-purple-500 p-1.5">
            <ArrowDownUp size={20} color="white" />
          </span>
        }
        after={<ChevronRight size={20} color="gray" />}
        description={
          <Caption className="text-wrap">
            {sortByLabel} &bull; {sortOrderLabel}
          </Caption>
        }
      >
        Sort options
      </Cell>
    </Section>
  );
};

interface ChatTransactionTabProps {
  chatId: number;
}

const ChatTransactionTab = ({ chatId }: ChatTransactionTabProps) => {
  const { selectedExpense, showPayments, relatedOnly, sortBy, sortOrder } =
    routeApi.useSearch();
  const tUserData = useSignal(initData.user);
  const navigate = routeApi.useNavigate();
  const trpcUtils = trpc.useUtils();
  const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);
  const tSecondaryBackgroundColor = useSignal(
    themeParams.secondaryBackgroundColor
  );
  const tButtonColor = useSignal(themeParams.buttonColor);

  const userId = tUserData?.id ?? 0;

  const firstLoadDoneRef = useRef(false);
  const [modalView, setModalView] = useState<
    "filters" | "jumpToDate" | "sortOptions"
  >("filters");
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

  useEffect(() => {
    const isFirstLoadDone = firstLoadDoneRef.current;
    const timeout = setTimeout(() => {
      if (selectedExpense && virtualizedRef.current && !isFirstLoadDone) {
        virtualizedRef.current.scrollToTransaction(selectedExpense);
      }
      firstLoadDoneRef.current = true;
    }, 100);

    return () => clearTimeout(timeout);
  }, [selectedExpense]);

  // * Queries ==================================================================================
  const { data: dChatData } = trpc.chat.getChat.useQuery({ chatId });
  const { data: currencieswithBalance, status: currenciesWithBalanceStatus } =
    trpc.currency.getCurrenciesWithBalance.useQuery({
      userId,
      chatId,
    });

  // * Mutations ==================================================================================
  const convertCurrencyMutation = trpc.expense.convertCurrencyBulk.useMutation({
    onSuccess: () => {
      // Refetch currencies to update balances
      trpcUtils.currency.getCurrenciesWithBalance.invalidate({
        userId,
        chatId,
      });
      trpcUtils.expense.getAllExpensesByChat.invalidate({ chatId });
      trpcUtils.settlement.getAllSettlementsByChat.invalidate({ chatId });
      hapticFeedback.notificationOccurred("success");
    },
    onError: (error) => {
      hapticFeedback.notificationOccurred("error");
      alert(`❌ Conversion failed: ${error.message}`);
    },
  });

  const handlePaymentsToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
    hapticFeedback.selectionChanged();
    navigate({
      search: (prev) => ({
        ...prev,
        showPayments: event.target.checked,
      }),
    });
  };

  const handleRelatedOnlyToggle = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    hapticFeedback.selectionChanged();
    navigate({
      search: (prev) => ({
        ...prev,
        relatedOnly: event.target.checked,
      }),
    });
  };

  const handleSortByChange = (newSortBy: SortByOption) => {
    hapticFeedback.selectionChanged();
    navigate({
      search: (prev) => ({
        ...prev,
        sortBy: newSortBy,
      }),
    });
  };

  const handleSortOrderChange = (newSortOrder: SortOrderOption) => {
    hapticFeedback.selectionChanged();
    navigate({
      search: (prev) => ({
        ...prev,
        sortOrder: newSortOrder,
      }),
    });
  };

  // For modal FilterSection (inside modal) - transitions modal content
  const handleJumpToDateTransition = () => {
    hapticFeedback.impactOccurred("light");
    setModalView("jumpToDate");
  };

  const handleSortOptionsTransition = () => {
    hapticFeedback.impactOccurred("light");
    setModalView("sortOptions");
  };

  const handleBackToFilters = () => {
    hapticFeedback.impactOccurred("light");
    setModalView("filters");
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

  const handleConvertCurrency = (fromCurrency: string, toCurrency: string) => {
    if (fromCurrency === toCurrency) {
      return;
    }

    const shouldConvert = confirm(
      `⚠️ Convert all ${fromCurrency} transactions to ${toCurrency}?\n\nThis action cannot be undone. All expenses and settlements in ${fromCurrency} will be converted to ${toCurrency} using current exchange rates.`
    );

    if (shouldConvert) {
      convertCurrencyMutation.mutate({
        chatId,
        fromCurrency,
        toCurrency,
        userId,
      });
    }
  };

  const foreignCurrencies = useMemo(() => {
    if (currenciesWithBalanceStatus !== "success" || !currencieswithBalance) {
      return [];
    }
    if (!dChatData?.baseCurrency) {
      return [];
    }
    return currencieswithBalance.filter(
      ({ currency }) => currency.code !== dChatData.baseCurrency
    );
  }, [
    currenciesWithBalanceStatus,
    currencieswithBalance,
    dChatData?.baseCurrency,
  ]);

  return (
    <section className="flex h-full flex-col">
      {/* Tranction filters section */}
      <div className="shadow-xs">
        <Cell
          Component={"label"}
          before={
            <span className="rounded-lg bg-slate-400 p-1.5 dark:bg-slate-700">
              <SlidersHorizontal size={20} color="white" />
            </span>
          }
          after={
            <button className="w-max" onClick={() => setFiltersOpen(true)}>
              <ChevronsUpDown size={20} color="gray" />
            </button>
          }
        >
          <div className="flex gap-1 overflow-auto">
            {showPayments && (
              <div
                className="flex items-center gap-1.5 rounded-full p-1 pe-3"
                style={{
                  backgroundColor: tSecondaryBackgroundColor,
                }}
              >
                <div className="rounded-full bg-green-500 p-1.5">
                  <DollarSign size={12} color="white" />
                </div>
                <Caption weight="2" level="2">
                  Payments
                </Caption>
              </div>
            )}
            {relatedOnly && (
              <div
                className="flex items-center gap-1.5 rounded-full p-1 pe-3"
                style={{
                  backgroundColor: tSecondaryBackgroundColor,
                }}
              >
                <div className="rounded-full bg-blue-500 p-1.5">
                  <LucideLink size={12} color="white" />
                </div>
                <Caption weight="2" level="2">
                  Related
                </Caption>
              </div>
            )}
            <div
              className="flex items-center gap-1.5 rounded-full p-1 pe-3"
              style={{
                backgroundColor: tSecondaryBackgroundColor,
              }}
            >
              <div className="rounded-full bg-purple-500 p-1.5">
                {sortOrder === "desc" ? (
                  <ArrowDown size={12} color="white" />
                ) : (
                  <ArrowUp size={12} color="white" />
                )}
              </div>
              <Caption weight="2" level="2">
                {sortBy === "date" ? "Date" : "Created"}
              </Caption>
            </div>
          </div>
        </Cell>
        <Divider />

        {foreignCurrencies.length > 0 && (
          <Modal
            dismissible={!convertCurrencyMutation.isPending}
            open={convertCurrencyMutation.isPending || undefined}
            header={
              <Modal.Header
                before={
                  <Title level="2" weight="1">
                    Convert currencies
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
              ></Modal.Header>
            }
            trigger={
              <Cell
                Component={"label"}
                before={
                  <span className="rounded-lg bg-teal-400 p-1.5 dark:bg-teal-700">
                    <ArrowLeftRight size={20} color="white" />
                  </span>
                }
                after={
                  <Info
                    type="avatarStack"
                    avatarStack={
                      <AvatarStack>
                        {foreignCurrencies.map((c) => (
                          <Avatar key={c.currency.code} size={28}>
                            {c.currency.flagEmoji}
                          </Avatar>
                        ))}
                      </AvatarStack>
                    }
                  >
                    <ChevronsUpDown size={20} />
                  </Info>
                }
              >
                Convert currencies
              </Cell>
            }
          >
            <div className="flex max-h-[70vh] min-h-40 flex-col gap-y-2 pb-20">
              <div className="px-4">
                <Blockquote>
                  {`Expenses and payments made in foreign currencies can be
                  converted to your base currency (${dChatData?.baseCurrency ?? "SGD"}) to consolidate
                  transactions`}
                </Blockquote>
              </div>
              <Section>
                {foreignCurrencies.map((c) => (
                  <Cell
                    disabled={convertCurrencyMutation.isPending}
                    onClick={() =>
                      handleConvertCurrency(
                        c.currency.code,
                        dChatData?.baseCurrency ?? "SGD"
                      )
                    }
                    key={c.currency.code}
                    Component={"label"}
                    before={<Text>{c.currency.flagEmoji}</Text>}
                    after={
                      convertCurrencyMutation.isPending ? (
                        <LoaderCircle size={20} className="animate-spin" />
                      ) : (
                        <ArrowLeftRight size={20} />
                      )
                    }
                  >
                    {convertCurrencyMutation.isPending
                      ? "Converting..."
                      : `Convert all ${c.currency.code} to ${dChatData?.baseCurrency}`}
                  </Cell>
                ))}
              </Section>
            </div>
          </Modal>
        )}
        <Divider />
      </div>

      {/* Enhanced filters modal with content transitions */}
      <Modal
        open={filtersOpen}
        header={
          <Modal.Header
            before={
              modalView !== "filters" ? (
                <IconButton size="s" mode="gray" onClick={handleBackToFilters}>
                  <ArrowLeft
                    size={20}
                    strokeWidth={3}
                    style={{
                      color: tSubtitleTextColor,
                    }}
                  />
                </IconButton>
              ) : (
                <Title level="3" weight="1">
                  Filters
                </Title>
              )
            }
            after={
              <Modal.Close>
                <IconButton
                  size="s"
                  mode="gray"
                  onClick={() => {
                    hapticFeedback.impactOccurred("light");
                    setModalView("filters"); // Reset view when closing
                  }}
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
          >
            <Title level="3" weight="1">
              {modalView === "filters"
                ? ""
                : modalView === "jumpToDate"
                  ? "Jump to date"
                  : "Sort options"}
            </Title>
          </Modal.Header>
        }
        onOpenChange={(open) => {
          if (!open) {
            setModalView("filters"); // Reset view when modal closes
          }
          setFiltersOpen(open);
        }}
      >
        <div className="min-h-64 pb-10">
          {modalView === "filters" ? (
            <FilterSection
              showPayments={showPayments}
              relatedOnly={relatedOnly}
              sortBy={sortBy}
              sortOrder={sortOrder}
              handlePaymentsToggle={handlePaymentsToggle}
              handleRelatedOnlyToggle={handleRelatedOnlyToggle}
              onJumpToDate={handleJumpToDateTransition}
              onSortOptions={handleSortOptionsTransition}
            />
          ) : modalView === "jumpToDate" ? (
            <DateSelector
              monthGroupedData={monthGroupedData}
              onDateSelect={handleDateSelect}
            />
          ) : (
            <SortOptionsSelector
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortByChange={handleSortByChange}
              onSortOrderChange={handleSortOrderChange}
            />
          )}
        </div>
      </Modal>

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
      />
    </section>
  );
};

export default ChatTransactionTab;
