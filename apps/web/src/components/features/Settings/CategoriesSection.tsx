import { Cell, Section } from "@telegram-apps/telegram-ui";
import { Tag, ChevronRight } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { trpc } from "@/utils/trpc";
import { CategoryPill } from "@/components/features/Category";

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
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500/15 text-blue-500">
            <Tag size={16} />
          </span>
        }
        after={<ChevronRight size={16} />}
        description={`${custom.length} custom · ${total} total`}
        onClick={() =>
          navigate({
            to: "/chat/$chatId/settings/categories",
            params: { chatId: String(chatId) },
          })
        }
      >
        Manage categories
      </Cell>

      <div className="flex flex-wrap gap-2 px-4 pb-3">
        {preview.map((c) => (
          <CategoryPill key={c.id} emoji={c.emoji} label={c.title} />
        ))}
        {extra > 0 ? <CategoryPill label={`+${extra} more`} dashed /> : null}
      </div>
    </Section>
  );
}
