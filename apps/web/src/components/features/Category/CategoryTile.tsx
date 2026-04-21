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
      className={clsx(
        "flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-2xl p-2",
        // Mix the text color into the section bg so the tile always has a
        // visible panel against the modal sheet. Pure section-bg blends too
        // readily with the sheet in some Telegram themes, leaving the tiles
        // as invisible outlines on a flat background.
        "bg-[color-mix(in_srgb,var(--tg-theme-text-color)_8%,var(--tg-theme-section-bg-color))]",
        "text-[var(--tg-theme-text-color)]",
        selected && "ring-2 ring-[var(--tg-theme-button-color)]"
      )}
    >
      <span className="flex h-8 items-center text-2xl leading-none">
        {emoji}
      </span>
      <span className="line-clamp-2 text-center text-xs leading-tight">
        {title}
      </span>
    </button>
  );
}
