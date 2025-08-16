import {
  Badge,
  ButtonCell,
  Cell,
  Divider,
  IconButton,
  Modal,
  Navigation,
  Section,
  SectionProps,
  Skeleton,
  Switch,
  Title,
  Text,
  Caption,
} from "@telegram-apps/telegram-ui";
import VirtualizedCombinedTransactionSegment from "./VirtualizedCombinedTransactionSegment";
import DateSelector from "./DateSelector";
import {
  hapticFeedback,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import { getRouteApi, Link } from "@tanstack/react-router";
import {
  Aperture,
  ArrowLeft,
  CalendarArrowUp,
  DollarSign,
  X,
  Link as LucideLink,
  SlidersHorizontal,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useTransactionHighlight } from "@/hooks/useTransactionHighlight";
import { VirtualizedCombinedTransactionSegmentRef } from "./VirtualizedCombinedTransactionSegment";
import { trpc } from "@/utils/trpc";

const routeApi = getRouteApi("/_tma/chat/$chatId");

interface FilterSectionProps extends SectionProps {
  showPayments: boolean;
  relatedOnly: boolean;
  handlePaymentsToggle: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleRelatedOnlyToggle: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onJumpToDate: () => void;
}

const FilterSection = ({
  header,
  showPayments,
  relatedOnly,
  handlePaymentsToggle,
  handleRelatedOnlyToggle,
  onJumpToDate,
}: FilterSectionProps) => (
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
      after={<Switch checked={showPayments} onChange={handlePaymentsToggle} />}
      description={
        <Caption className="text-wrap">
          Include user payments in the transaction list
        </Caption>
      }
    >
      Payments
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
          Display only transactions that are related to you
        </Caption>
      }
    >
      Related
    </Cell>
  </Section>
);

interface ChatTransactionTabProps {
  chatId: number;
}

const ChatTransactionTab = ({ chatId }: ChatTransactionTabProps) => {
  const { selectedCurrency, selectedExpense } = routeApi.useSearch();
  const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);
  const tSecondaryBackgroundColor = useSignal(
    themeParams.secondaryBackgroundColor
  );
  const tButtonColor = useSignal(themeParams.buttonColor);
  const { showPayments, relatedOnly } = routeApi.useSearch();
  const navigate = routeApi.useNavigate();

  const [modalView, setModalView] = useState<"filters" | "jumpToDate">(
    "filters"
  );
  const [jumpToDateModalOpen, setJumpToDateModalOpen] = useState(false);
  const [monthGroupedData, setMonthGroupedData] = useState<
    {
      monthKey: string;
      monthDisplay: string;
      dates: { key: string; display: string; transactionIds: string[] }[];
    }[]
  >([]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const { data: snapShots, status: snapShotsStatus } =
    trpc.snapshot.getByChat.useQuery({
      chatId,
      currency: selectedCurrency,
    });

  const { highlightTransactions } = useTransactionHighlight(tButtonColor);
  const virtualizedRef = useRef<VirtualizedCombinedTransactionSegmentRef>(null);

  useEffect(() => {
    let timeout: NodeJS.Timeout | undefined;
    if (selectedExpense) {
      timeout = setTimeout(() => {
        virtualizedRef.current?.scrollToTransaction(selectedExpense ?? "");
      }, 100);
    }
    return () => clearTimeout(timeout);
  }, [selectedExpense]);

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

  // For main FilterSection (outside modal) - opens standalone modal
  // const handleJumpToDateStandalone = () => {
  //   hapticFeedback.impactOccurred("light");
  //   setJumpToDateModalOpen(true);
  // };

  // For modal FilterSection (inside modal) - transitions modal content
  const handleJumpToDateTransition = () => {
    hapticFeedback.impactOccurred("light");
    setModalView("jumpToDate");
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
      }, 1000);
    } else {
      // Fallback to original highlighting with scroll
      highlightTransactions(selectedDate.transactionIds, true);
    }
  };

  return (
    <section className="flex h-full flex-col">
      {/* Tranction filters section */}
      <div className="shadow">
        <Link
          onClick={() => hapticFeedback.impactOccurred("light")}
          to="/chat/$chatId/snapshots"
          params={{
            chatId: chatId.toString(),
          }}
          search={{
            selectedCurrency: selectedCurrency || "SGD",
            title: "📸 Snapshots",
          }}
        >
          <Cell
            Component="label"
            before={
              <span className="rounded-lg bg-red-600 p-1.5">
                <Aperture size={20} color="white" />
              </span>
            }
            after={
              <Skeleton visible={snapShotsStatus === "pending"}>
                <Navigation>
                  <Badge type="number">{snapShots?.length}</Badge>
                </Navigation>
              </Skeleton>
            }
            description="See what you have spent"
          >
            Snapshots
          </Cell>
        </Link>
        <Divider />
        <Cell
          Component={"label"}
          before={<SlidersHorizontal size={20} />}
          after={
            <button className="w-max" onClick={() => setFiltersOpen(true)}>
              <Navigation>Filters</Navigation>
            </button>
          }
        >
          <div className="flex gap-2 overflow-auto">
            {[showPayments, relatedOnly].every((bool) => !bool) && (
              <Text className="text-neutral-500">No filters applied</Text>
            )}
            {showPayments && (
              <div
                className="flex items-center gap-1.5 rounded-full p-1 pe-3"
                style={{
                  backgroundColor: tSecondaryBackgroundColor,
                }}
              >
                <div className="rounded-full bg-green-500 p-1.5">
                  <DollarSign size={14} color="white" />
                </div>
                <Caption weight="2">Payments</Caption>
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
                  <LucideLink size={14} color="white" />
                </div>
                <Caption weight="2">Related</Caption>
              </div>
            )}
          </div>
        </Cell>
        <Divider />
      </div>

      {/* Enhanced filters modal with content transitions */}
      <Modal
        open={filtersOpen}
        header={
          <Modal.Header
            before={
              modalView === "jumpToDate" ? (
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
              {modalView === "filters" ? "" : "Jump to date"}
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
              handlePaymentsToggle={handlePaymentsToggle}
              handleRelatedOnlyToggle={handleRelatedOnlyToggle}
              onJumpToDate={handleJumpToDateTransition}
            />
          ) : (
            <DateSelector
              monthGroupedData={monthGroupedData}
              onDateSelect={handleDateSelect}
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
