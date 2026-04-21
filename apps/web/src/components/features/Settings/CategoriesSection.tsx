import { Cell, Section } from "@telegram-apps/telegram-ui";
import { Tag, ChevronRight } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { trpc } from "@/utils/trpc";

export default function CategoriesSection({
  chatId,
  isPersonal,
}: {
  chatId: number;
  isPersonal: boolean;
}) {
  const navigate = useNavigate();
  const { data } = trpc.category.listByChat.useQuery({ chatId });
  const base = data?.base ?? [];
  const custom = data?.custom ?? [];
  const total = base.length + custom.length;

  const preview = [...custom, ...base].slice(0, 4);
  const extra = Math.max(0, total - preview.length);

  const goManage = () =>
    navigate({
      to: "/chat/$chatId/settings/categories",
      params: { chatId: String(chatId) },
    });

  return (
    <Section
      header="CATEGORIES"
      footer={
        isPersonal
          ? "Categories are private to this chat."
          : "Categories are shared by everyone in this group and help auto-assign recurring expenses."
      }
    >
      <Cell
        before={
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--tg-theme-link-color)_15%,transparent)] text-[var(--tg-theme-link-color)]">
            <Tag size={20} />
          </span>
        }
        after={<ChevronRight size={20} />}
        description={
          custom.length > 0
            ? `${custom.length} custom · ${total} total`
            : `${total} standard · 0 custom`
        }
        onClick={goManage}
      >
        Manage categories
      </Cell>

      {/* Preview chip strip — sits inside the same Section card as the
          Manage cell, separated by a hairline border. Horizontally scrolls
          rather than wrapping so the row stays a single line regardless of
          how many categories preview. */}
      <div
        role="button"
        onClick={goManage}
        className="flex cursor-pointer gap-1.5 overflow-x-auto px-4 pb-3.5 pt-2.5"
        style={{
          borderTop: "0.5px solid var(--tg-theme-section-separator-color)",
        }}
      >
        {preview.map((c) => (
          <span
            key={c.id}
            className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13px] font-medium text-[var(--tg-theme-text-color)]"
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--tg-theme-hint-color) 18%, transparent)",
            }}
          >
            <span className="text-sm leading-none">{c.emoji}</span>
            <span>{c.title}</span>
          </span>
        ))}
        {extra > 0 ? (
          <span className="inline-flex flex-shrink-0 items-center rounded-full px-2.5 py-1.5 text-[13px] font-medium text-[var(--tg-theme-hint-color)]">
            +{extra} more
          </span>
        ) : null}
      </div>
    </Section>
  );
}
