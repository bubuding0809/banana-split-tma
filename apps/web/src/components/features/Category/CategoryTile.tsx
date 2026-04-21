import clsx from "clsx";

interface CategoryTileProps {
  emoji: string;
  title: string;
  selected?: boolean;
  onClick?: () => void;
}

export default function CategoryTile({
  emoji,
  title,
  selected,
  onClick,
}: CategoryTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      // Neutral mid-gray overlay — visible on both dark and light sheet
      // backgrounds without needing theme detection. Previous attempts using
      // section-bg or a color-mix against text-color rendered invisible on
      // device (Telegram themes vary and some collapse section-bg into the
      // sheet bg). Inline style bypasses the Tailwind JIT's handling of
      // arbitrary values with nested function calls.
      style={{ backgroundColor: "rgba(127, 127, 127, 0.28)" }}
      className={clsx(
        // Tighter horizontal padding (px-1) so long labels like
        // "Entertainment" have enough inner width to fit on one line at
        // text-sm without overflowing the tile.
        "flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-2xl px-1 py-2",
        "text-[var(--tg-theme-text-color)]",
        selected && "ring-2 ring-[var(--tg-theme-button-color)]"
      )}
    >
      <span className="flex h-10 items-center text-3xl leading-none">
        {emoji}
      </span>
      <span className="line-clamp-2 hyphens-auto break-words text-center text-[13px] leading-tight">
        {title}
      </span>
    </button>
  );
}
