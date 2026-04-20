import { Modal, Caption } from "@telegram-apps/telegram-ui";
import { Plus } from "lucide-react";
import CategoryTile from "./CategoryTile";

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
      <div className="max-h-[70vh] space-y-4 overflow-y-auto p-4">
        {includeNoneOption && (
          <div>
            <div className="grid grid-cols-4 gap-2">
              <CategoryTile
                emoji={UNCATEGORIZED_OPTION.emoji}
                title={UNCATEGORIZED_OPTION.title}
                selected={selectedId === UNCATEGORIZED_OPTION.id}
                onClick={() => onSelect(UNCATEGORIZED_OPTION)}
              />
            </div>
          </div>
        )}
        {custom.length > 0 && (
          <div>
            <Caption level="1" weight="2">
              Custom
            </Caption>
            <div className="mt-2 grid grid-cols-4 gap-2">
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
          </div>
        )}

        <div>
          <Caption level="1" weight="2">
            Base
          </Caption>
          <div className="mt-2 grid grid-cols-4 gap-2">
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
        </div>

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
