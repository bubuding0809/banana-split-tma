import clsx from "clsx";
import { Eye, EyeOff } from "lucide-react";

interface CategoryTileProps {
  emoji: string;
  title: string;
  selected?: boolean;
  onClick?: () => void;
  /** Small blue dot top-left signals a custom category. */
  showCustomDot?: boolean;
  /**
   * Eye/EyeOff toggle top-right. `undefined` = no toggle; `"visible"` = Eye
   * (tap to hide); `"hidden"` = EyeOff (tap to restore).
   */
  hideToggle?: "visible" | "hidden";
  onToggleHide?: () => void;
  /**
   * Dim + grayscale the tile (used when rendering a hidden tile on the
   * Organize page). Does not affect the picker.
   */
  dim?: boolean;
  /** dnd-kit `setNodeRef` + listeners/attributes when the tile is sortable. */
  sortableRef?: (node: HTMLElement | null) => void;
  sortableStyle?: React.CSSProperties;
  sortableListeners?: Record<string, unknown>;
  sortableAttributes?: Record<string, unknown>;
  /** Render state for dnd-kit. */
  isDragging?: boolean;
}

export default function CategoryTile({
  emoji,
  title,
  selected,
  onClick,
  showCustomDot,
  hideToggle,
  onToggleHide,
  dim,
  sortableRef,
  sortableStyle,
  sortableListeners,
  sortableAttributes,
  isDragging,
}: CategoryTileProps) {
  return (
    <div
      ref={sortableRef}
      style={{
        backgroundColor: "rgba(127, 127, 127, 0.28)",
        ...sortableStyle,
      }}
      className={clsx(
        "relative flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-2xl px-1 py-2",
        "text-[var(--tg-theme-text-color)]",
        selected && "ring-2 ring-[var(--tg-theme-button-color)]",
        dim && "opacity-50",
        // Grab cursor only when the tile is wired as sortable (Organize
        // page). Non-sortable pickers keep the default pointer.
        sortableRef && (isDragging ? "cursor-grabbing" : "cursor-grab"),
        isDragging &&
          "z-10 scale-[1.08] shadow-[0_12px_28px_rgba(0,0,0,0.55),0_2px_6px_rgba(0,0,0,0.3)]"
      )}
      {...(sortableAttributes ?? {})}
      {...(sortableListeners ?? {})}
    >
      {showCustomDot && (
        <span
          aria-hidden
          className="absolute left-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--tg-theme-button-color)]"
        />
      )}

      {hideToggle && (
        <button
          type="button"
          aria-label={
            hideToggle === "visible" ? "Hide category" : "Show category"
          }
          onClick={(e) => {
            e.stopPropagation();
            onToggleHide?.();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className={clsx(
            "absolute -right-1.5 -top-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full border border-black/25 shadow-[0_1px_3px_rgba(0,0,0,0.5)]",
            hideToggle === "visible"
              ? "bg-[#3a3d42] text-[var(--tg-theme-text-color)]"
              : "bg-[var(--tg-theme-button-color)] text-white"
          )}
        >
          {hideToggle === "visible" ? <Eye size={12} /> : <EyeOff size={12} />}
        </button>
      )}

      <button
        type="button"
        onClick={onClick}
        className={clsx(
          "flex w-full flex-col items-center justify-center gap-1.5",
          // Reset button styles — the outer div owns the visual box.
          "bg-transparent p-0 text-inherit",
          !onClick && "pointer-events-none"
        )}
        style={{ outline: "none" }}
      >
        <span
          className={clsx(
            "flex h-10 items-center text-3xl leading-none",
            dim && "grayscale"
          )}
        >
          {emoji}
        </span>
        <span className="block w-full truncate px-1 text-center text-[13px] font-medium leading-tight">
          {title}
        </span>
      </button>
    </div>
  );
}
