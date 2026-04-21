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
            </div>
          </section>
        )}

        {onCreateCustom && (
          <button
            type="button"
            onClick={onCreateCustom}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--tg-theme-section-bg-color)] py-3 text-sm font-medium"
          >
            <Plus size={16} /> Create custom category
          </button>
        )}

        {/* In-picker contextual entry to the Organize page. Shown always when
            the caller wires onOpenOrganize — lets the user discover the
            customization flow at the exact moment they'd want it. */}
        {onOpenOrganize && categories.length > 0 && (
          <button
            type="button"
            onClick={onOpenOrganize}
            className="flex w-full items-center justify-center gap-2 rounded-2xl py-2.5 text-[13px] font-medium text-[var(--tg-theme-link-color)]"
          >
            <Sliders size={14} /> Reorder or hide these tiles
          </button>
        )}
      </div>
    </Modal>
  );
}
