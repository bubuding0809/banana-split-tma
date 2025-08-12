import {
  Cell,
  Modal,
  Section,
  SectionProps,
  Switch,
  Title,
} from "@telegram-apps/telegram-ui";
import ChatCombinedTransactionSegment from "./ChatCombinedTransactionSegment";
import { hapticFeedback } from "@telegram-apps/sdk-react";
import { getRouteApi } from "@tanstack/react-router";
import { DollarSign, Link, SlidersHorizontal } from "lucide-react";

const routeApi = getRouteApi("/_tma/chat/$chatId");

interface FilterSectionProps extends SectionProps {
  showPayments: boolean;
  relatedOnly: boolean;
  handlePaymentsToggle: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleRelatedOnlyToggle: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

const FilterSection = ({
  header,
  showPayments,
  relatedOnly,
  handlePaymentsToggle,
  handleRelatedOnlyToggle,
}: FilterSectionProps) => (
  <Section header={header}>
    <Cell
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
  const { showPayments, relatedOnly } = routeApi.useSearch();
  const navigate = routeApi.useNavigate();

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

  return (
    <>
      {/* Tranction filters section */}
      <FilterSection
        header={
          <Section.Header>
            <div className="flex items-start gap-2">
              <SlidersHorizontal size={14} />
              <span>Filters</span>
            </div>
          </Section.Header>
        }
        showPayments={showPayments}
        relatedOnly={relatedOnly}
        handlePaymentsToggle={handlePaymentsToggle}
        handleRelatedOnlyToggle={handleRelatedOnlyToggle}
      />

      {/* Transaction filters modal */}
      <Modal
        open={filtersOpen}
        header={
          <Modal.Header
            before={
              <Title level="3" weight="1">
                Filters
              </Title>
            }
          />
        }
        onOpenChange={onFiltersOpen}
      >
        <div className="min-h-40 pb-10">
          <FilterSection
            showPayments={showPayments}
            relatedOnly={relatedOnly}
            handlePaymentsToggle={handlePaymentsToggle}
            handleRelatedOnlyToggle={handleRelatedOnlyToggle}
          />
        </div>
      </Modal>

      <ChatCombinedTransactionSegment
        chatId={chatId}
        setSectionsInView={setSectionsInView}
        showPayments={showPayments}
      />
    </>
  );
};

export default ChatTransactionTab;
