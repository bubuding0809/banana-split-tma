import { Section, Cell, Selectable } from "@telegram-apps/telegram-ui";
import { hapticFeedback } from "@telegram-apps/sdk-react";
import { Calendar, Clock, ArrowDown, ArrowUp } from "lucide-react";
import type {
  TransactionSortBy,
  TransactionSortOrder,
} from "@/utils/transactionHelpers";

interface SortOptionsSelectorProps {
  sortBy: TransactionSortBy;
  sortOrder: TransactionSortOrder;
  onSortByChange: (sortBy: TransactionSortBy) => void;
  onSortOrderChange: (sortOrder: TransactionSortOrder) => void;
}

const SortOptionsSelector = ({
  sortBy,
  sortOrder,
  onSortByChange,
  onSortOrderChange,
}: SortOptionsSelectorProps) => {
  const handleSortByChange = (newSortBy: TransactionSortBy) => {
    if (newSortBy !== sortBy) {
      hapticFeedback.selectionChanged();
      onSortByChange(newSortBy);
    }
  };

  const handleSortOrderChange = (newSortOrder: TransactionSortOrder) => {
    if (newSortOrder !== sortOrder) {
      hapticFeedback.selectionChanged();
      onSortOrderChange(newSortOrder);
    }
  };

  return (
    <>
      <Section header="Sort by">
        <Cell
          Component="label"
          before={
            <span className="rounded-lg bg-orange-500 p-1.5">
              <Calendar size={20} color="white" />
            </span>
          }
          after={
            <Selectable
              name="sortBy"
              value="date"
              checked={sortBy === "date"}
              onChange={() => handleSortByChange("date")}
            />
          }
        >
          Transaction Date
        </Cell>
        <Cell
          Component="label"
          before={
            <span className="rounded-lg bg-indigo-500 p-1.5">
              <Clock size={20} color="white" />
            </span>
          }
          after={
            <Selectable
              name="sortBy"
              value="createdAt"
              checked={sortBy === "createdAt"}
              onChange={() => handleSortByChange("createdAt")}
            />
          }
        >
          Created At
        </Cell>
      </Section>

      <Section header="Order">
        <Cell
          Component="label"
          before={
            <span className="rounded-lg bg-gray-500 p-1.5">
              <ArrowDown size={20} color="white" />
            </span>
          }
          after={
            <Selectable
              name="sortOrder"
              value="desc"
              checked={sortOrder === "desc"}
              onChange={() => handleSortOrderChange("desc")}
            />
          }
        >
          Newest first
        </Cell>
        <Cell
          Component="label"
          before={
            <span className="rounded-lg bg-gray-500 p-1.5">
              <ArrowUp size={20} color="white" />
            </span>
          }
          after={
            <Selectable
              name="sortOrder"
              value="asc"
              checked={sortOrder === "asc"}
              onChange={() => handleSortOrderChange("asc")}
            />
          }
        >
          Oldest first
        </Cell>
      </Section>
    </>
  );
};

export default SortOptionsSelector;
