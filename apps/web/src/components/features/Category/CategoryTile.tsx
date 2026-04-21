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
      // Tile bg is set via inline style, not a Tailwind arbitrary class,
      // because `color-mix(...)` doesn't reliably round-trip through the
      // Tailwind JIT parser (commas + nested function calls). The expression
      // lays a translucent text-color overlay on the sheet: ~12% white in
      // dark themes, ~12% black in light themes — always a visible panel.
      style={{
        backgroundColor:
          "color-mix(in srgb, var(--tg-theme-text-color) 12%, transparent)",
      }}
      className={clsx(
        "flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-2xl p-2",
        "text-[var(--tg-theme-text-color)]",
        selected && "ring-2 ring-[var(--tg-theme-button-color)]"
      )}
    >
      <span className="flex h-10 items-center text-3xl leading-none">
        {emoji}
      </span>
      <span className="line-clamp-2 text-center text-sm leading-tight">
        {title}
      </span>
    </button>
  );
}
