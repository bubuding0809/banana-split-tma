import { useEffect, useMemo, useState } from "react";
import { backButton } from "@telegram-apps/sdk-react";
import { useNavigate } from "@tanstack/react-router";
import { trpc } from "@/utils/trpc";
import CategoryTile from "@/components/features/Category/CategoryTile";

interface OrganizeItem {
  categoryKey: string;
  emoji: string;
  title: string;
  kind: "base" | "custom";
  sortOrder: number;
  hidden: boolean;
}

export default function OrganizeCategoriesPage({ chatId }: { chatId: number }) {
  const navigate = useNavigate();
  const { data } = trpc.category.listByChat.useQuery({ chatId });

  const initial = useMemo<OrganizeItem[]>(() => {
    if (!data) return [];
    return data.items
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((it) => ({
        categoryKey: it.id,
        emoji: it.emoji,
        title: it.title,
        kind: it.kind,
        sortOrder: it.sortOrder,
        hidden: it.hidden,
      }));
  }, [data]);

  const [items, setItems] = useState<OrganizeItem[]>([]);
  useEffect(() => {
    setItems(initial);
  }, [initial]);

  const visible = items.filter((i) => !i.hidden);
  const hidden = items.filter((i) => i.hidden);

  useEffect(() => {
    backButton.mount();
    backButton.show();
    const off = backButton.onClick(() =>
      navigate({
        to: "/chat/$chatId/settings/categories",
        params: { chatId: String(chatId) },
      })
    );
    return () => {
      off();
      backButton.hide();
    };
  }, [chatId, navigate]);

  return (
    <main className="flex flex-col gap-4 px-3 pb-24">
      <p className="px-1 pt-2 text-[12px] leading-snug text-[var(--tg-theme-subtitle-text-color)]">
        Drag to reorder. Drag into the Hidden zone (or tap the eye icon) to
        hide. Shared with everyone in this group.
      </p>

      <section>
        <div className="mb-2 flex items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--tg-theme-subtitle-text-color)]">
          <span>Visible</span>
          <span>
            {visible.length} / {items.length}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2 rounded-xl bg-[rgba(255,255,255,0.02)] p-1">
          {visible.map((it) => (
            <CategoryTile
              key={it.categoryKey}
              emoji={it.emoji}
              title={it.title}
              showCustomDot={it.kind === "custom"}
              hideToggle="visible"
            />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--tg-theme-subtitle-text-color)]">
          <span>Hidden</span>
          <span>{hidden.length} hidden</span>
        </div>
        <div className="grid min-h-[92px] grid-cols-4 gap-2 rounded-xl border border-dashed border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.02)] p-1">
          {hidden.length === 0 ? (
            <div className="col-span-4 px-3 py-7 text-center text-[11px] italic text-[var(--tg-theme-subtitle-text-color)] opacity-70">
              Drag a tile here (or tap its eye) to hide it from the picker.
            </div>
          ) : (
            hidden.map((it) => (
              <CategoryTile
                key={it.categoryKey}
                emoji={it.emoji}
                title={it.title}
                showCustomDot={it.kind === "custom"}
                hideToggle="hidden"
                dim
              />
            ))
          )}
        </div>
      </section>
    </main>
  );
}
