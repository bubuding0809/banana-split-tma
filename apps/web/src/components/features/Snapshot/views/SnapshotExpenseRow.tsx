import { Caption, Cell, Text } from "@telegram-apps/telegram-ui";
import { format } from "date-fns";
import { formatCurrencyWithCode } from "@/utils/financial";

type RowItem = {
  id: string;
  description: string;
  date: Date;
  amountInBase: number;
  currency: string;
  payer: { firstName: string };
  categoryEmoji: string;
};

interface SnapshotExpenseRowProps {
  item: RowItem;
  baseCurrency: string;
  /**
   * Override the default category-emoji box in the `before` slot.
   * Used by PayerView to show member avatars instead of category emojis.
   */
  before?: React.ReactNode;
}

/**
 * Shared expense row for the grouped lists inside Category/Date/Payer views.
 * Mirrors `SnapshotExpenseCell` in SnapshotDetailsModal so the two surfaces
 * read consistently.
 */
export function SnapshotExpenseRow({
  item,
  baseCurrency,
  before,
}: SnapshotExpenseRowProps) {
  const defaultBefore = (
    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[rgba(255,255,255,0.06)] text-xl leading-none">
      {item.categoryEmoji || "❓"}
    </div>
  );

  return (
    <Cell
      before={before ?? defaultBefore}
      subhead={
        <Caption weight="1" level="1">
          {item.payer.firstName} spent
        </Caption>
      }
      description={item.description}
      after={
        <Caption weight="2" className="w-max shrink-0">
          {format(item.date, "d MMM yyyy")}
        </Caption>
      }
    >
      <Text weight="2">
        {formatCurrencyWithCode(item.amountInBase, baseCurrency)}
      </Text>
    </Cell>
  );
}
