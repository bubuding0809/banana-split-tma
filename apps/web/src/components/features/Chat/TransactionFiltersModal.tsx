import {
  ButtonCell,
  Caption,
  Cell,
  IconButton,
  Modal,
  Section,
  Switch,
  Title,
} from "@telegram-apps/telegram-ui";
import {
  ArrowLeft,
  ArrowDownUp,
  DollarSign,
  X,
  Link as LucideLink,
  ChevronRight,
  CalendarArrowUp,
} from "lucide-react";
import {
  hapticFeedback,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import { useState } from "react";
import DateSelector from "./DateSelector";
import SortOptionsSelector from "./SortOptionsSelector";
import { type ResolvedCategory } from "@repo/categories";
import { Button } from "@telegram-apps/telegram-ui";

type SortByOption = "date" | "createdAt";
type SortOrderOption = "asc" | "desc";

export interface TransactionFiltersModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showPayments: boolean;
  relatedOnly: boolean;
  sortBy: SortByOption;
  sortOrder: SortOrderOption;
  onTogglePayments: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onToggleRelatedOnly: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSortByChange: (sortBy: SortByOption) => void;
  onSortOrderChange: (sortOrder: SortOrderOption) => void;
  monthGroupedData: {
    monthKey: string;
    monthDisplay: string;
    dates: { key: string; display: string; transactionIds: string[] }[];
  }[];
  onDateSelect: (dateKey: string) => void;
  resolvedCategory: ResolvedCategory | null;
  onOpenPicker: () => void;
  onClearCategory: () => void;
}

export default function TransactionFiltersModal({
  open,
  onOpenChange,
  showPayments,
  relatedOnly,
  sortBy,
  sortOrder,
  onTogglePayments,
  onToggleRelatedOnly,
  onSortByChange,
  onSortOrderChange,
  monthGroupedData,
  onDateSelect,
  resolvedCategory,
  onOpenPicker,
  onClearCategory,
}: TransactionFiltersModalProps) {
  const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);
  const [modalView, setModalView] = useState<
    "filters" | "jumpToDate" | "sortOptions"
  >("filters");

  const sortByLabel = sortBy === "date" ? "Transaction date" : "Created at";
  const sortOrderLabel = sortOrder === "desc" ? "Newest first" : "Oldest first";

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

  return (
    <Modal
      open={open}
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
                  setModalView("filters");
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
          setModalView("filters");
        }
        onOpenChange(open);
      }}
    >
      <div className="min-h-64 pb-10">
        {modalView === "filters" ? (
          <Section>
            <Cell
              before={
                <span className="text-xl">
                  {resolvedCategory?.emoji ?? "🗂️"}
                </span>
              }
              after={
                resolvedCategory ? (
                  <Button
                    mode="plain"
                    size="s"
                    onClick={(e) => {
                      e.stopPropagation();
                      onClearCategory();
                    }}
                  >
                    Clear
                  </Button>
                ) : (
                  <ChevronRight size={16} />
                )
              }
              onClick={onOpenPicker}
            >
              {resolvedCategory ? resolvedCategory.title : "Category"}
            </Cell>
            <ButtonCell
              before={<CalendarArrowUp size={20} />}
              onClick={handleJumpToDateTransition}
            >
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
                <Switch checked={showPayments} onChange={onTogglePayments} />
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
                <Switch checked={relatedOnly} onChange={onToggleRelatedOnly} />
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
              onClick={handleSortOptionsTransition}
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
        ) : modalView === "jumpToDate" ? (
          <DateSelector
            monthGroupedData={monthGroupedData}
            onDateSelect={onDateSelect}
          />
        ) : (
          <SortOptionsSelector
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortByChange={onSortByChange}
            onSortOrderChange={onSortOrderChange}
          />
        )}
      </div>
    </Modal>
  );
}
