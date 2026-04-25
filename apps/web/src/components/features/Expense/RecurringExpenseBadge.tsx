import { Repeat as RepeatIcon } from "lucide-react";

export default function RecurringExpenseBadge() {
  return (
    <span
      title="Active recurring schedule"
      className="inline-flex size-5 items-center justify-center rounded-full bg-violet-400 dark:bg-violet-700"
    >
      <RepeatIcon size={12} strokeWidth={2.5} color="white" />
    </span>
  );
}
