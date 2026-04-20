import clsx from "clsx";
import { X as XIcon } from "lucide-react";

interface CategoryPillProps {
  emoji?: string;
  label: string;
  active?: boolean;
  dashed?: boolean;
  onClick?: () => void;
  onClear?: () => void;
}

export default function CategoryPill({
  emoji,
  label,
  active,
  dashed,
  onClick,
  onClear,
}: CategoryPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "inline-flex h-7 select-none items-center gap-1 rounded-full px-2.5 text-xs font-medium",
        active
          ? "bg-[var(--tg-theme-button-color)] text-[var(--tg-theme-button-text-color)]"
          : dashed
            ? "border border-dashed border-[var(--tg-theme-hint-color)] text-[var(--tg-theme-hint-color)]"
            : "bg-[var(--tg-theme-section-bg-color)] text-[var(--tg-theme-text-color)]"
      )}
    >
      {emoji ? <span className="leading-none">{emoji}</span> : null}
      <span className="max-w-[8rem] truncate">{label}</span>
      {onClear ? (
        <span
          role="button"
          aria-label="Clear"
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          className="ml-1 flex items-center justify-center rounded-full p-0.5 hover:bg-black/10"
        >
          <XIcon size={12} />
        </span>
      ) : null}
    </button>
  );
}
