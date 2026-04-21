import { hapticFeedback } from "@telegram-apps/sdk-react";
import { useMemo } from "react";

interface FilterCategory {
  id: string;
  emoji: string;
  title: string;
  kind: "base" | "custom" | "none";
}

interface CategoryFilterStripProps {
  categories: {
    id: string;
    emoji: string;
    title: string;
    kind: "base" | "custom";
  }[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

// Synthetic chip so users can pull out expenses whose categoryId is null.
// Matches the "none" id used in the expense-list predicate.
const UNCATEGORIZED: FilterCategory = {
  id: "none",
  emoji: "📭",
  title: "Uncategorized",
  kind: "none",
};

function tickSelection() {
  try {
    hapticFeedback.selectionChanged();
  } catch {
    /* non-TMA */
  }
}

/**
 * Standalone emoji-only chip strip for filtering the expense list by
 * category. Multi-select — tapping a chip toggles it. Selected chips float
 * to the start so active filters are always visible without scrolling.
 *
 * Selected chips get a gray fill + link-color highlight ring + drop
 * shadow — they visually lift off the strip. Unselected chips have no
 * background at all, so the strip feels airy and the active state pops.
 */
export default function CategoryFilterStrip({
  categories,
  selectedIds,
  onChange,
}: CategoryFilterStripProps) {
  const allChips = useMemo<FilterCategory[]>(
    () => [...categories, UNCATEGORIZED],
    [categories]
  );

  // Selected chips float to the start. Relative order inside each group
  // follows the natural source order (picker ordering + Uncategorized last),
  // not selection recency — predictable and avoids chips jumping around
  // as the user toggles neighbours.
  const displayOrder = useMemo(() => {
    const selectedSet = new Set(selectedIds);
    const selected = allChips.filter((c) => selectedSet.has(c.id));
    const unselected = allChips.filter((c) => !selectedSet.has(c.id));
    return [...selected, ...unselected];
  }, [allChips, selectedIds]);

  const toggle = (id: string) => {
    tickSelection();
    const set = new Set(selectedIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    onChange(Array.from(set));
  };

  if (allChips.length === 0) return null;

  return (
    <div className="flex gap-1.5 overflow-x-auto px-3 py-2 [&::-webkit-scrollbar]:hidden">
      {displayOrder.map((c) => {
        const selected = selectedIds.includes(c.id);
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => toggle(c.id)}
            aria-pressed={selected}
            aria-label={`${selected ? "Clear" : "Filter by"} ${c.title}`}
            className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] text-[18px] leading-none transition-[transform,box-shadow,background-color] duration-200 ease-out active:scale-[0.94]"
            style={
              selected
                ? {
                    // Gray tint + link-color ring + link-color halo. On dark
                    // Telegram themes a black drop shadow disappears into the
                    // background, so the "lift" effect is delivered via a
                    // colored glow instead of a neutral shadow.
                    backgroundColor: "rgba(255,255,255,0.08)",
                    boxShadow: [
                      "0 0 0 1.5px var(--tg-theme-link-color)",
                      "0 0 10px color-mix(in srgb, var(--tg-theme-link-color) 40%, transparent)",
                      "0 3px 8px rgba(0,0,0,0.4)",
                    ].join(", "),
                  }
                : { backgroundColor: "transparent" }
            }
          >
            {c.emoji}
          </button>
        );
      })}
    </div>
  );
}
