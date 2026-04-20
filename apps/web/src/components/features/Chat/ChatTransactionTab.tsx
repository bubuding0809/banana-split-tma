import {
  Cell,
  Divider,
  IconButton,
  Modal,
  Title,
  Text,
  AvatarStack,
  Avatar,
  Blockquote,
  Info,
  Section,
} from "@telegram-apps/telegram-ui";
import VirtualizedCombinedTransactionSegment from "./VirtualizedCombinedTransactionSegment";
import DateSelector from "./DateSelector";
import CurrencySelectionModal from "@/components/ui/CurrencySelectionModal";
import TransactionFiltersCell from "./TransactionFiltersCell";
import TransactionFiltersModal from "./TransactionFiltersModal";
import CategoryPickerSheet from "@/components/features/Category/CategoryPickerSheet";
import CategoriesOnboarding from "./CategoriesOnboarding";
import {
  hapticFeedback,
  initData,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  LoaderCircle,
  ChevronRight,
  ChevronsUpDown,
  X,
} from "lucide-react";
import { useState, useRef, useEffect, useMemo } from "react";
import { useTransactionHighlight } from "@/hooks/useTransactionHighlight";
import { VirtualizedCombinedTransactionSegmentRef } from "./VirtualizedCombinedTransactionSegment";
import { trpc } from "@/utils/trpc";
import { resolveCategory, type ChatCategoryRow } from "@repo/categories";

type SortByOption = "date" | "createdAt";
type SortOrderOption = "asc" | "desc";

interface ChatTransactionTabProps {
  chatId: number;
}

const ChatTransactionTab = ({ chatId }: ChatTransactionTabProps) => {
  const {
    selectedExpense,
    showPayments = true,
    relatedOnly = true,
    sortBy = "date" as SortByOption,
    sortOrder = "desc" as SortOrderOption,
  } = useSearch({ strict: false }) as {
    selectedExpense?: string;
    showPayments?: boolean;
    relatedOnly?: boolean;
    sortBy?: SortByOption;
    sortOrder?: SortOrderOption;
  };
  const tUserData = useSignal(initData.user);
  const navigate = useNavigate();

  // Route-agnostic search param updater (supports both /_tma/chat/ and /_tma/chat/$chatId)
  const updateSearchParams = (
    updater: (prev: Record<string, unknown>) => Record<string, unknown>
  ) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void navigate({ search: updater as any });
  };

  const trpcUtils = trpc.useUtils();
  const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);
  const tButtonColor = useSignal(themeParams.buttonColor);

  const userId = tUserData?.id ?? 0;

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
  const [convertFromCurrency, setConvertFromCurrency] = useState<string | null>(
    null
  );
  const [targetCurrencyModalOpen, setTargetCurrencyModalOpen] = useState(false);

  // Category filter state
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

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
  const { data: categoriesData } = trpc.category.listByChat.useQuery({
    chatId,
  });

  const allCategories = useMemo(
    () => [...(categoriesData?.base ?? []), ...(categoriesData?.custom ?? [])],
    [categoriesData]
  );

  const chatRows = useMemo<ChatCategoryRow[]>(
    () =>
      (categoriesData?.custom ?? []).map((c) => ({
        id: c.id.replace(/^chat:/, ""),
        chatId: BigInt(chatId),
        emoji: c.emoji,
        title: c.title,
      })),
    [categoriesData, chatId]
  );

  const resolvedCategory = useMemo(
    () => resolveCategory(categoryFilter, chatRows),
    [categoryFilter, chatRows]
  );

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
      setConvertFromCurrency(null);
    },
    onError: (error) => {
      hapticFeedback.notificationOccurred("error");
      alert(`❌ Conversion failed: ${error.message}`);
      setConvertFromCurrency(null);
    },
  });

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

  const handleSelectFromCurrency = (fromCurrency: string) => {
    hapticFeedback.impactOccurred("light");
    setConvertFromCurrency(fromCurrency);
    setTargetCurrencyModalOpen(true);
  };

  const handleTargetCurrencySelect = (targetCurrency: string) => {
    setTargetCurrencyModalOpen(false);
    if (convertFromCurrency) {
      handleConvertCurrency(convertFromCurrency, targetCurrency);
    }
    // convertFromCurrency is cleared in mutation onSuccess/onError
    // or in handleConvertCurrency if user cancels the confirm dialog
  };

  const handleConvertCurrency = (fromCurrency: string, toCurrency: string) => {
    if (fromCurrency === toCurrency) {
      setConvertFromCurrency(null);
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
    } else {
      setConvertFromCurrency(null);
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
      {/* Categories onboarding tooltip */}
      <CategoriesOnboarding userId={userId} chatId={chatId} />

      {/* Transaction filters section */}
      <div className="shadow-xs">
        <TransactionFiltersCell
          showPayments={showPayments}
          relatedOnly={relatedOnly}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onOpenModal={() => setFiltersOpen(true)}
          categoryFilter={categoryFilter}
          resolvedCategory={resolvedCategory}
          onOpenPicker={() => setPickerOpen(true)}
          onClearCategory={() => setCategoryFilter(null)}
        />
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
                  {`Select a foreign currency to convert, then choose which currency to convert it to`}
                </Blockquote>
              </div>
              <Section>
                {foreignCurrencies.map((c) => (
                  <Cell
                    disabled={convertCurrencyMutation.isPending}
                    onClick={() => handleSelectFromCurrency(c.currency.code)}
                    key={c.currency.code}
                    Component={"label"}
                    before={<Text>{c.currency.flagEmoji}</Text>}
                    after={
                      convertCurrencyMutation.isPending &&
                      convertFromCurrency === c.currency.code ? (
                        <LoaderCircle size={20} className="animate-spin" />
                      ) : (
                        <ChevronRight size={20} color="gray" />
                      )
                    }
                  >
                    {convertCurrencyMutation.isPending &&
                    convertFromCurrency === c.currency.code
                      ? "Converting..."
                      : `Convert all ${c.currency.code}`}
                  </Cell>
                ))}
              </Section>
            </div>
          </Modal>
        )}

        {/* Target currency selection modal for conversion */}
        <CurrencySelectionModal
          open={targetCurrencyModalOpen}
          onOpenChange={(open) => {
            setTargetCurrencyModalOpen(open);
            if (!open && !convertCurrencyMutation.isPending) {
              setConvertFromCurrency(null);
            }
          }}
          selectedCurrency={undefined}
          onCurrencySelect={handleTargetCurrencySelect}
          featuredCurrencies={[
            dChatData?.baseCurrency ?? "SGD",
            ...(foreignCurrencies
              .map((c) => c.currency.code)
              .filter((code) => code !== convertFromCurrency) ?? []),
          ]}
          showRecentlyUsed={false}
          showOthers={true}
          footerMessage={
            convertFromCurrency
              ? `Select a currency to convert all ${convertFromCurrency} transactions to`
              : undefined
          }
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
        resolvedCategory={resolvedCategory}
        onOpenPicker={() => setPickerOpen(true)}
        onClearCategory={() => setCategoryFilter(null)}
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
        categoryFilter={categoryFilter}
        chatRows={chatRows}
      />

      <CategoryPickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        categories={allCategories}
        selectedId={categoryFilter}
        onSelect={(c) => {
          setCategoryFilter(c.id);
          setPickerOpen(false);
        }}
      />
    </section>
  );
};

export default ChatTransactionTab;
