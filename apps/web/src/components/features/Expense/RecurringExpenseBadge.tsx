import { Repeat as RepeatIcon } from "lucide-react";

export default function RecurringExpenseBadge() {
  return (
    <span
      title="Recurring expense"
      className="bg-(--tg-theme-link-color)/15 text-(--tg-theme-link-color) inline-flex h-5 w-5 items-center justify-center rounded-full"
    >
      <RepeatIcon size={12} strokeWidth={2.5} />
    </span>
  );
}
