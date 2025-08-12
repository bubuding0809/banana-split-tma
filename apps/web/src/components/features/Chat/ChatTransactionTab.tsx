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
} from "@telegram-apps/telegram-ui";
import ChatCombinedTransactionSegment from "./ChatCombinedTransactionSegment";
import DateSelector from "./DateSelector";
import {
  hapticFeedback,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import { getRouteApi } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarArrowDown,
  CalendarArrowUp,
  DollarSign,
  Link,
  X,
} from "lucide-react";
import { useState } from "react";
import { useTransactionHighlight } from "@/hooks/useTransactionHighlight";

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
      description="Hide or show payment records"
    >
      Show Payments
    </Cell>
    <Cell
      Component="label"
      before={
        <span className="rounded-lg bg-blue-500 p-1.5">
          <Link size={20} color="white" />
        </span>
      }
      after={
        <Switch checked={relatedOnly} onChange={handleRelatedOnlyToggle} />
      }
      description="Show only related transactions"
    >
      Related Only
    </Cell>
  </Section>
);

interface ChatTransactionTabProps {
  chatId: number;
  setSectionsInView: React.Dispatch<React.SetStateAction<string[]>>;
  filtersOpen: boolean;
  onFiltersOpen: (open: boolean) => void;
}

const ChatTransactionTab = ({
  chatId,
  setSectionsInView,
  filtersOpen,
  onFiltersOpen,
}: ChatTransactionTabProps) => {
  const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);
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

  const { highlightTransactions } = useTransactionHighlight(tButtonColor);

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
  const handleJumpToDateStandalone = () => {
    hapticFeedback.impactOccurred("light");
    setJumpToDateModalOpen(true);
  };

  // For modal FilterSection (inside modal) - transitions modal content
  const handleJumpToDateTransition = () => {
    hapticFeedback.impactOccurred("light");
    setModalView("jumpToDate");
  };

  const handleBackToFilters = () => {
    hapticFeedback.impactOccurred("light");
    setModalView("filters");
  };

  const handleDateSelect = (dateKey: string) => {
    if (!dateKey) return;

    // Find the transaction IDs for this date across all months
    let selectedDate:
      | { key: string; display: string; transactionIds: string[] }
      | undefined;

    for (const month of monthGroupedData) {
      selectedDate = month.dates.find((date) => date.key === dateKey);
      if (selectedDate) break;
    }

    if (!selectedDate) return;

    hapticFeedback.selectionChanged();

    // Close whichever modal is open
    if (jumpToDateModalOpen) {
      setJumpToDateModalOpen(false);
    } else {
      onFiltersOpen(false);
    }

    // Highlight all transactions for the selected date with scroll to first
    highlightTransactions(selectedDate.transactionIds, true);
  };

  return (
    <section className="flex flex-col gap-2">
      {/* Tranction filters section */}
      <div>
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
          description="Hide or show payment records"
        >
          Show Payments
        </Cell>
        <Divider />
        <Cell
          Component="label"
          before={
            <span className="rounded-lg bg-blue-500 p-1.5">
              <Link size={20} color="white" />
            </span>
          }
          after={
            <Switch checked={relatedOnly} onChange={handleRelatedOnlyToggle} />
          }
          description="Show only related transactions"
        >
          Related Only
        </Cell>
        <Divider />
        <ButtonCell
          before={<CalendarArrowDown size={20} />}
          onClick={handleJumpToDateStandalone}
        >
          Jump to date
        </ButtonCell>
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
          onFiltersOpen(open);
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

      <ChatCombinedTransactionSegment
        chatId={chatId}
        setSectionsInView={setSectionsInView}
        showPayments={showPayments}
        onAvailableDatesChange={setMonthGroupedData}
      />
    </section>
  );
};

export default ChatTransactionTab;
