import { Modal } from "@telegram-apps/telegram-ui";
import { hapticFeedback } from "@telegram-apps/sdk-react";
import { Plus, Sliders } from "lucide-react";
import CategoryTile from "./CategoryTile";

// Thin wrappers around hapticFeedback — calls throw in non-TMA contexts
// (vite dev in a plain browser tab), so every call-site would need its
// own try/catch otherwise.
function tickSelection() {
  try {
    hapticFeedback.selectionChanged();
  } catch {
    /* non-TMA */
  }
}
function tickNav() {
  try {
    hapticFeedback.impactOccurred("light");
  } catch {
    /* non-TMA */
  }
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-(--tg-theme-subtitle-text-color) mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-wider opacity-80">
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
  emoji: "❓",
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
      className="border-(--tg-theme-link-color)/40 text-(--tg-theme-link-color) flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed px-1 py-2 transition-transform duration-150 ease-out active:scale-[0.97]"
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
                onClick={() => {
                  tickSelection();
                  onSelect(UNCATEGORIZED_OPTION);
                }}
              />
            </div>
          </section>
        )}

        {categories.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <div className="text-(--tg-theme-subtitle-text-color) text-[13px]">
              All categories are hidden.
            </div>
            {onOpenOrganize && (
              <button
                type="button"
                className="text-(--tg-theme-link-color) text-[13px] font-medium"
                onClick={() => {
                  tickNav();
                  onOpenOrganize();
                }}
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
                  onClick={() => {
                    tickSelection();
                    onSelect(c);
                  }}
                />
              ))}
              {/* Create tile sits at the end of the grid — same footprint
                  as a category tile but dashed + link-color to read as an
                  affordance. Users see it alongside the real tiles without
                  scrolling. */}
              {onCreateCustom && (
                <CreateCategoryTile
                  onClick={() => {
                    tickNav();
                    onCreateCustom();
                  }}
                />
              )}
            </div>
          </section>
        )}

        {/* Reorder / hide entry — iOS-style bezeled (tinted) button.
            Link-color text over a soft link-color tinted fill; no
            outline border. Scales slightly on press. */}
        {onOpenOrganize && categories.length > 0 && (
          <button
            type="button"
            onClick={() => {
              tickNav();
              onOpenOrganize();
            }}
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--tg-theme-link-color) 14%, transparent)",
            }}
            className="text-(--tg-theme-link-color) flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-medium transition-transform duration-150 ease-out active:scale-[0.98]"
          >
            <Sliders size={15} strokeWidth={2.25} />
            Reorder or hide categories
          </button>
        )}
      </div>
    </Modal>
  );
}
