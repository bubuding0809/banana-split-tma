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

  // Emoji-only chips — render every category in a horizontal scroll strip
  // rather than slicing to 4 + "+N more". The chip is compact enough that
  // all categories fit in the single-line overflow-x area.
  const allCats = [...custom, ...base];

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
          : "Categories are shared by everyone in this group."
      }
    >
      <Cell
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
        onClick={goManage}
      >
        Manage categories
      </Cell>

      {/* Emoji-only chip strip — sits inside the same Section card as the
          Manage cell, separated by a hairline border. Single-line horizontal
          scroll. Each chip is a tile-style panel holding just the emoji so
          the row fits many categories at a glance. */}
      <div
        role="button"
        onClick={goManage}
        className="flex cursor-pointer gap-1.5 overflow-x-auto px-4 pb-3 pt-2.5"
        style={{
          borderTop: "0.5px solid var(--tg-theme-section-separator-color)",
        }}
      >
        {allCats.map((c) => (
          <span
            key={c.id}
            title={c.title}
            className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-base leading-none"
            style={{ backgroundColor: "rgba(127, 127, 127, 0.28)" }}
          >
            {c.emoji}
          </span>
        ))}
      </div>
    </Section>
  );
}
