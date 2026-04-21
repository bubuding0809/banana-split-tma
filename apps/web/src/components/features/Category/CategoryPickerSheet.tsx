import { Modal } from "@telegram-apps/telegram-ui";
import { Plus, Sliders } from "lucide-react";
import CategoryTile from "./CategoryTile";

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--tg-theme-subtitle-text-color)] opacity-80">
      {children}
    </div>
  );
}

interface PickerCategory {
  id: string;
  emoji: string;
  title: string;
  kind: "base" | "custom" | "none";
}

interface CategoryPickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Unordered flat list (caller passes the already-filtered visible items in
   * the picker's chosen order). `kind` still used for styling (custom dot).
   */
  categories: PickerCategory[];
  selectedId?: string | null;
  onSelect: (c: PickerCategory) => void;
  onCreateCustom?: () => void;
  /** Render an "Uncategorized" tile at the top that emits id `"none"`. */
  includeNoneOption?: boolean;
  /** Called when the empty-state link is tapped. Optional; if absent, no link. */
  onOpenOrganize?: () => void;
}

export const UNCATEGORIZED_OPTION: PickerCategory = {
  id: "none",
  emoji: "📭",
  title: "Uncategorized",
  kind: "none",
};

/**
 * In-grid "add new" tile — same shape / footprint as a CategoryTile so it
 * sits naturally at the end of the grid, but dashed + link-colored to
 * read as an affordance, not a real category.
 */
function CreateCategoryTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-[var(--tg-theme-link-color)]/40 flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed px-1 py-2 text-[var(--tg-theme-link-color)] transition-transform duration-150 ease-out active:scale-[0.97]"
    >
      <span className="flex h-10 items-center justify-center">
        <Plus size={26} strokeWidth={2.25} />
      </span>
      <span className="block w-full truncate text-center text-[13px] font-medium leading-tight">
        Create
      </span>
    </button>
  );
}

export default function CategoryPickerSheet({
  open,
  onOpenChange,
  categories,
  selectedId,
  onSelect,
  onCreateCustom,
  includeNoneOption,
  onOpenOrganize,
}: CategoryPickerSheetProps) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      header={<Modal.Header>Pick a category</Modal.Header>}
    >
      <div className="max-h-[70vh] space-y-5 overflow-y-auto p-4">
        {includeNoneOption && (
          <section>
            <SectionHeader>Uncategorized</SectionHeader>
            <div className="grid grid-cols-4 gap-2">
              <CategoryTile
                emoji={UNCATEGORIZED_OPTION.emoji}
                title={UNCATEGORIZED_OPTION.title}
                selected={selectedId === UNCATEGORIZED_OPTION.id}
                onClick={() => onSelect(UNCATEGORIZED_OPTION)}
              />
            </div>
          </section>
        )}

        {categories.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <div className="text-[13px] text-[var(--tg-theme-subtitle-text-color)]">
              All categories are hidden.
            </div>
            {onOpenOrganize && (
              <button
                type="button"
                className="text-[13px] font-medium text-[var(--tg-theme-link-color)]"
                onClick={onOpenOrganize}
              >
                Open Organize categories
              </button>
            )}
          </div>
        ) : (
          <section>
            <div className="grid grid-cols-4 gap-2">
              {categories.map((c) => (
                <CategoryTile
                  key={c.id}
                  emoji={c.emoji}
                  title={c.title}
                  selected={selectedId === c.id}
                  showCustomDot={c.kind === "custom"}
                  onClick={() => onSelect(c)}
                />
              ))}
              {/* Create tile sits at the end of the grid — same footprint
                  as a category tile but dashed + link-color to read as an
                  affordance. Users see it alongside the real tiles without
                  scrolling. */}
              {onCreateCustom && (
                <CreateCategoryTile onClick={onCreateCustom} />
              )}
            </div>
          </section>
        )}

        {/* Reorder / hide entry — outline button below the grid.
            Distinct from tiles (outline, not filled) so it reads as a
            modal-footer action, not a category choice. */}
        {onOpenOrganize && categories.length > 0 && (
          <button
            type="button"
            onClick={onOpenOrganize}
            className="border-[var(--tg-theme-link-color)]/35 flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-[13px] font-medium text-[var(--tg-theme-link-color)] transition-transform duration-150 ease-out active:scale-[0.98]"
          >
            <Sliders size={15} strokeWidth={2.25} />
            Reorder or hide categories
          </button>
        )}
      </div>
    </Modal>
  );
}
