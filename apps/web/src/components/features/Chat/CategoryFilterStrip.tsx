import { Badge, Caption } from "@telegram-apps/telegram-ui";
import { hapticFeedback } from "@telegram-apps/sdk-react";
import { X } from "lucide-react";
import { useLayoutEffect, useMemo, useRef } from "react";

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
  /**
   * Expense counts per category id. "none" key counts uncategorized
   * expenses. Categories with no expenses get no badge (rather than a
   * "0" badge) so the strip stays uncluttered for empty categories.
   */
  counts?: Record<string, number>;
  onChange: (ids: string[]) => void;
}

function formatCount(n: number): string {
  return n > 99 ? "99+" : String(n);
}

// Synthetic chip so users can pull out expenses whose categoryId is null.
// Matches the "none" id used in the expense-list predicate.
const UNCATEGORIZED: FilterCategory = {
  id: "none",
  emoji: "❓",
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
  counts,
  onChange,
}: CategoryFilterStripProps) {
  const allChips = useMemo<FilterCategory[]>(
    () => [UNCATEGORIZED, ...categories],
    [categories]
  );

  // Selected chips render in the order they were selected — newly tapped
  // chips append to the end of the selected group rather than jumping into
  // the middle by count. Unselected chips sort by count desc (most-used
  // first, zero-count last) so the scroll-right direction still surfaces
  // the categories the user reaches for most. Uncategorized is pinned to
  // the head of the unselected group (regardless of count) because the
  // chip doubles as an "untagged items" affordance — users need to reach
  // it without horizontal-scrolling past every real category.
  const displayOrder = useMemo(() => {
    const selectedSet = new Set(selectedIds);
    const byId = new Map(allChips.map((c) => [c.id, c]));
    const selected = selectedIds
      .map((id) => byId.get(id))
      .filter((c): c is FilterCategory => c !== undefined);
    const unselected = allChips
      .filter((c) => !selectedSet.has(c.id))
      .sort((a, b) => {
        if (a.id === UNCATEGORIZED.id) return -1;
        if (b.id === UNCATEGORIZED.id) return 1;
        return (counts?.[b.id] ?? 0) - (counts?.[a.id] ?? 0);
      });
    return [...selected, ...unselected];
  }, [allChips, selectedIds, counts]);

  const toggle = (id: string) => {
    tickSelection();
    const set = new Set(selectedIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    onChange(Array.from(set));
  };

  // FLIP animation: when displayOrder changes (user selects/deselects a
  // chip), each chip slides smoothly from its previous position to its
  // new one instead of teleporting. We capture positions in
  // useLayoutEffect — which runs after DOM mutation but before paint —
  // compare against the previous render's positions, apply an inverse
  // transform to make the chip *look* like it's still in the old spot,
  // then clear the transform on the next frame so the existing
  // `transition-[transform]` class carries it to the new spot.
  const chipRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const prevRects = useRef<Map<string, DOMRect>>(new Map());

  useLayoutEffect(() => {
    const nextRects = new Map<string, DOMRect>();
    for (const c of displayOrder) {
      const el = chipRefs.current.get(c.id);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      nextRects.set(c.id, rect);
      const prev = prevRects.current.get(c.id);
      if (!prev) continue;
      const dx = prev.left - rect.left;
      if (Math.abs(dx) < 0.5) continue;
      el.style.transition = "none";
      el.style.transform = `translateX(${dx}px)`;
      requestAnimationFrame(() => {
        el.style.transition = "";
        el.style.transform = "";
      });
    }
    prevRects.current = nextRects;
  }, [displayOrder]);

  if (allChips.length === 0) return null;

  const hasSelection = selectedIds.length > 0;

  return (
    <div className="flex items-center gap-2 px-3">
      {/* py-2 has to live on the scroll container (not the outer wrapper)
          so the count badges — which sit absolutely positioned below the
          chips — have vertical room to render. CSS forces overflow-y:auto
          when overflow-x:auto is set, so any content that pokes below
          the container's content box triggers an accidental vertical
          scroll. Padding inside the scroll container absorbs the badge
          overhang. */}
      {!hasSelection && (
        <div className="rounded-full bg-[rgba(127,127,127,0.22)] px-2 py-1 text-xs uppercase">
          <Caption weight="1" className="tracking-tight">
            All
          </Caption>
        </div>
      )}
      <div className="flex flex-1 gap-1.5 overflow-x-auto py-2 [&::-webkit-scrollbar]:hidden">
        {displayOrder.map((c) => {
          const selected = selectedIds.includes(c.id);
          return (
            <button
              key={c.id}
              ref={(el) => {
                if (el) chipRefs.current.set(c.id, el);
                else chipRefs.current.delete(c.id);
              }}
              type="button"
              onClick={() => toggle(c.id)}
              aria-pressed={selected}
              aria-label={`${selected ? "Clear" : "Filter by"} ${c.title}`}
              className="duration-280 relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-[18px] leading-none transition-[transform,box-shadow,background-color] ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.94]"
              style={
                selected
                  ? {
                      // Fixed translucent gray — theme-aware mixing
                      // kept producing fills that either blended into
                      // the bg (light mode) or looked washed out
                      // (dark). A flat rgba mid-gray layers to a
                      // visible pale gray on white and a softer grey
                      // on dark without fighting the theme. Ring +
                      // halo remain link-coloured so the selected
                      // state still reads as "active".
                      backgroundColor: "rgba(127,127,127,0.22)",
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
              {(() => {
                const count = counts?.[c.id] ?? 0;
                if (count === 0) return null;
                // Badge sits slightly overlapped with the tile (-0.5) and
                // is scaled down from its library default so it doesn't
                // dominate the 36px tile. Origin anchored to bottom-right
                // so the scale doesn't push it off-corner.
                return (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -bottom-0.5 -right-1 origin-bottom-right scale-[0.8]"
                  >
                    <Badge type="number" mode="primary">
                      {formatCount(count)}
                    </Badge>
                  </div>
                );
              })()}
            </button>
          );
        })}
      </div>
      {/* Clear-all button — appears only when ≥1 chip is selected.
          Sits outside the scroll container so it's always tappable
          regardless of how far the chip strip has scrolled. */}
      {hasSelection && (
        <button
          type="button"
          onClick={() => {
            tickSelection();
            onChange([]);
          }}
          aria-label={`Clear ${selectedIds.length} category filter${
            selectedIds.length === 1 ? "" : "s"
          }`}
          className="duration-280 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] transition-[transform] ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.94]"
          style={{ color: "var(--tg-theme-link-color)" }}
        >
          <X size={18} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}
