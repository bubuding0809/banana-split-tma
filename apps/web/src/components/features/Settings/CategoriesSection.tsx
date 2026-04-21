import { Cell, Section } from "@telegram-apps/telegram-ui";
import { Tag, ChevronRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { trpc } from "@/utils/trpc";

export default function CategoriesSection({
  chatId,
  isPersonal,
}: {
  chatId: number;
  isPersonal: boolean;
}) {
  const { data } = trpc.category.listByChat.useQuery({ chatId });
  const base = data?.base ?? [];
  const custom = data?.custom ?? [];
  const total = base.length + custom.length;

  // Emoji-only chips — render every category in a horizontal scroll strip
  // rather than slicing to 4 + "+N more". The chip is compact enough that
  // all categories fit in the single-line overflow-x area.
  const allCats = [...custom, ...base];

  return (
    <Section
      header="CATEGORIES"
      footer={
        isPersonal
          ? "Categories are private to this chat."
          : "Categories are shared by everyone in this group."
      }
    >
      {/* Nav via <Link> wrapping the Cell (Component="label"): matches
          SnapshotsLink, the tested-working pattern in this codebase. Using
          Cell's own onClick didn't reliably fire in the settings screen. */}
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

      {/* Emoji-only chip strip — also wrapped in a Link so the whole row is
          tappable + navigates to the same manage page. */}
      <Link
        to="/chat/$chatId/settings/categories"
        params={{ chatId: String(chatId) }}
      >
        <div
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
      </Link>
    </Section>
  );
}
