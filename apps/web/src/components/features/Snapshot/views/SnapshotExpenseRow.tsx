import { Caption, Cell, Text } from "@telegram-apps/telegram-ui";
import { format } from "date-fns";
import { cn } from "@/utils/cn";
import { formatCurrencyWithCode } from "@/utils/financial";

type RowItem = {
  id: string;
  description: string;
  date: Date;
  amountInBase: number;
  shareInBase: number;
  payer: { firstName: string };
  categoryEmoji: string;
};

interface SnapshotExpenseRowProps {
  item: RowItem;
  baseCurrency: string;
  /**
   * Override the default category-emoji box in the `before` slot.
   */
  before?: React.ReactNode;
}

/**
 * Shared expense row for the grouped lists inside Category/Date views.
 * Layout mirrors ChatExpenseCell on the group transactions tab:
 *   - body: full expense amount (in base currency)
 *   - after: date / red share amount / "share" caption
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
        <div className="flex flex-col items-end gap-0.5">
          <Caption weight="2" className="w-max shrink-0">
            {format(item.date, "d MMM yyyy")}
          </Caption>
          <Text
            weight="3"
            className={cn(item.shareInBase > 0 && "text-red-600")}
          >
            {formatCurrencyWithCode(item.shareInBase, baseCurrency)}
          </Text>
          <Caption className="w-max">share</Caption>
        </div>
      }
    >
      <Text weight="2">
        {formatCurrencyWithCode(item.amountInBase, baseCurrency)}
      </Text>
    </Cell>
  );
}
