import { Caption, Cell } from "@telegram-apps/telegram-ui";
import {
  SlidersHorizontal,
  ChevronsUpDown,
  DollarSign,
  Link as LucideLink,
  ArrowDown,
  ArrowUp,
} from "lucide-react";
import { useSignal, themeParams } from "@telegram-apps/sdk-react";
import React from "react";

type SortByOption = "date" | "createdAt";
type SortOrderOption = "asc" | "desc";

export interface TransactionFiltersCellProps {
  showPayments: boolean;
  relatedOnly: boolean;
  sortBy: SortByOption;
  sortOrder: SortOrderOption;
  onOpenModal: () => void;
}

export default function TransactionFiltersCell({
  showPayments,
  relatedOnly,
  sortBy,
  sortOrder,
  onOpenModal,
}: TransactionFiltersCellProps) {
  const tSecondaryBackgroundColor = useSignal(
    themeParams.secondaryBackgroundColor
  );

  type Pill = { key: string; node: React.ReactNode };
  const activePills: Pill[] = [];

  if (showPayments) {
    activePills.push({
      key: "payments",
      node: (
        <div
          className="flex items-center gap-1.5 rounded-full p-1 pe-3"
          style={{ backgroundColor: tSecondaryBackgroundColor }}
        >
          <div className="rounded-full bg-green-500 p-1.5">
            <DollarSign size={12} color="white" />
          </div>
          <Caption weight="2" level="2">
            Payments
          </Caption>
        </div>
      ),
    });
  }

  if (relatedOnly) {
    activePills.push({
      key: "related",
      node: (
        <div
          className="flex items-center gap-1.5 rounded-full p-1 pe-3"
          style={{ backgroundColor: tSecondaryBackgroundColor }}
        >
          <div className="rounded-full bg-blue-500 p-1.5">
            <LucideLink size={12} color="white" />
          </div>
          <Caption weight="2" level="2">
            Related
          </Caption>
        </div>
      ),
    });
  }

  // Sort pill always visible — category filtering moved to its own standalone
  // strip below this cell, so the pill row only reflects toggle + sort state.
  activePills.push({
    key: "sort",
    node: (
      <div
        className="flex items-center gap-1.5 rounded-full p-1 pe-3"
        style={{ backgroundColor: tSecondaryBackgroundColor }}
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
    ),
  });

  return (
    <Cell
      Component={"label"}
      before={
        <span className="rounded-lg bg-slate-400 p-1.5 dark:bg-slate-700">
          <SlidersHorizontal size={20} color="white" />
        </span>
      }
      after={
        <button
          className="w-max"
          onClick={(e) => {
            e.stopPropagation();
            onOpenModal();
          }}
        >
          <ChevronsUpDown size={20} color="gray" />
        </button>
      }
      onClick={onOpenModal}
    >
      <div className="flex gap-1 overflow-auto">
        {activePills.map((pill) => (
          <React.Fragment key={pill.key}>{pill.node}</React.Fragment>
        ))}
      </div>
    </Cell>
  );
}
