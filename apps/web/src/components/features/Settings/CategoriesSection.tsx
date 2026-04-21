import { Cell, Section } from "@telegram-apps/telegram-ui";
import { Tag, ChevronRight, Sliders } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { trpc } from "@/utils/trpc";
import CategoryTile from "@/components/features/Category/CategoryTile";

const PREVIEW_ROWS = 2;
const PREVIEW_COLS = 4;
const PREVIEW_COUNT = PREVIEW_ROWS * PREVIEW_COLS;

export default function CategoriesSection({
  chatId,
  isPersonal,
}: {
  chatId: number;
  isPersonal: boolean;
}) {
  const { data } = trpc.category.listByChat.useQuery({ chatId });
  const items = data?.items ?? [];
  const visible = items.filter((c) => !c.hidden);
  const hiddenCount = items.length - visible.length;
  const custom = visible.filter((c) => c.kind === "custom");
  const total = visible.length;

  // 4×2 preview mirrors the actual picker layout (emoji + truncated label +
  // blue dot for custom tiles). The number of rows is kept low so the
  // settings card stays compact — overflow is summarized as a single line.
  const previewTiles = visible.slice(0, PREVIEW_COUNT);
  const overflowCount = Math.max(0, visible.length - PREVIEW_COUNT);

  // The overflow footer under the preview already reports the hidden
  // count, so the cell description sticks to purpose-only — what the
  // user can do here, not the current state.
  const customizeDescription = "Drag to rearrange or hide tiles";

  const overflowLine =
    overflowCount > 0 && hiddenCount > 0
      ? `+ ${overflowCount} more · ${hiddenCount} hidden`
      : overflowCount > 0
        ? `+ ${overflowCount} more`
        : hiddenCount > 0
          ? `${hiddenCount} hidden`
          : null;

  return (
    <Section
      header="CATEGORIES"
      footer={
        isPersonal
          ? "Categories are private to this chat."
          : "Shared by everyone in this group."
      }
    >
      {/* Manage categories: unchanged CRUD entry. */}
      <Link
        to="/chat/$chatId/settings/categories"
        params={{ chatId: String(chatId) }}
      >
        <Cell
          Component="label"
          before={
            <span
              className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--tg-theme-link-color)]"
              style={{
                backgroundColor:
                  "color-mix(in srgb, var(--tg-theme-link-color) 15%, transparent)",
              }}
            >
              <Tag size={20} />
            </span>
          }
          after={<ChevronRight size={20} />}
          description={
            custom.length > 0
              ? `${custom.length} custom · ${total} total`
              : `${total} standard · 0 custom`
          }
        >
          Manage categories
        </Cell>
      </Link>

      {/* Customize picker — new Organize entry. Wrapped with the preview
          grid so tapping anywhere in the preview also opens Organize. */}
      <Link
        to="/chat/$chatId/settings/categories/organize"
        params={{ chatId: String(chatId) }}
      >
        <Cell
          Component="label"
          before={
            <span
              className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--tg-theme-link-color)]"
              style={{
                backgroundColor:
                  "color-mix(in srgb, var(--tg-theme-link-color) 15%, transparent)",
              }}
            >
              <Sliders size={20} />
            </span>
          }
          after={<ChevronRight size={20} />}
          description={customizeDescription}
        >
          Customize picker
        </Cell>
        <div
          className="px-3 pb-3 pt-2"
          style={{
            borderTop: "0.5px solid var(--tg-theme-section-separator-color)",
          }}
        >
          {/* Preview tiles reuse CategoryTile directly so emoji + label
              sizing is 1:1 with the real picker — no visual drift between
              the preview and the modal it's previewing. */}
          <div className="grid grid-cols-4 gap-2">
            {previewTiles.map((c) => (
              <CategoryTile
                key={c.id}
                emoji={c.emoji}
                title={c.title}
                showCustomDot={c.kind === "custom"}
              />
            ))}
          </div>
          {overflowLine ? (
            <div className="pt-2 text-center text-[11px] text-[var(--tg-theme-subtitle-text-color)]">
              {overflowLine}
            </div>
          ) : null}
        </div>
      </Link>
    </Section>
  );
}
