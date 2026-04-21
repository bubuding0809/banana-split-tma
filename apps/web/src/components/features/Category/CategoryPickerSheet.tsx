import { Modal } from "@telegram-apps/telegram-ui";
import { Plus } from "lucide-react";
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
  categories: PickerCategory[];
  selectedId?: string | null;
  onSelect: (c: PickerCategory) => void;
  onCreateCustom?: () => void;
  /** Render an "Uncategorized" tile at the top that emits id `"none"`. */
  includeNoneOption?: boolean;
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
}: CategoryPickerSheetProps) {
  const custom = categories.filter((c) => c.kind === "custom");
  const base = categories.filter((c) => c.kind === "base");

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

        <section>
          <SectionHeader>Standard</SectionHeader>
          <div className="grid grid-cols-4 gap-2">
            {base.map((c) => (
              <CategoryTile
                key={c.id}
                emoji={c.emoji}
                title={c.title}
                selected={selectedId === c.id}
                onClick={() => onSelect(c)}
              />
            ))}
          </div>
        </section>

        {custom.length > 0 && (
          <section>
            <SectionHeader>Custom</SectionHeader>
            <div className="grid grid-cols-4 gap-2">
              {custom.map((c) => (
                <CategoryTile
                  key={c.id}
                  emoji={c.emoji}
                  title={c.title}
                  selected={selectedId === c.id}
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
      </div>
    </Modal>
  );
}
