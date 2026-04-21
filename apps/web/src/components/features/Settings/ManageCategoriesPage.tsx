import { useEffect } from "react";
import { Cell, Section } from "@telegram-apps/telegram-ui";
import { Link, useNavigate } from "@tanstack/react-router";
import { backButton } from "@telegram-apps/sdk-react";
import { trpc } from "@/utils/trpc";
import { ChevronRight, Plus } from "lucide-react";

export default function ManageCategoriesPage({ chatId }: { chatId: number }) {
  const navigate = useNavigate();
  const { data } = trpc.category.listByChat.useQuery({ chatId });

  useEffect(() => {
    backButton.mount();
    backButton.show();
    const off = backButton.onClick(() => {
      navigate({
        to: "/chat/$chatId/settings",
        params: { chatId: String(chatId) },
        search: { prevTab: "transaction" },
      });
    });
    return () => {
      off();
      backButton.hide();
    };
  }, [chatId, navigate]);

  const custom = data?.custom ?? [];
  const base = data?.base ?? [];

  return (
    <main className="px-3 pb-8">
      <Section header="CUSTOM">
        {custom.length === 0 ? (
          <Cell description="Tap Create custom category below to add your first one.">
            No custom categories yet
          </Cell>
        ) : (
          custom.map((c) => (
            <Link
              key={c.id}
              to="/chat/$chatId/settings/categories/$categoryId"
              params={{
                chatId: String(chatId),
                categoryId: c.id.replace(/^chat:/, ""),
              }}
            >
              <Cell
                Component="label"
                before={<span className="text-xl">{c.emoji}</span>}
                after={<ChevronRight size={16} />}
              >
                {c.title}
              </Cell>
            </Link>
          ))
        )}
        {/* "Create custom category" lives inline at the bottom of the CUSTOM
            section — a link-colored ButtonCell-style row with a circular +
            icon, matching the Manage categories cell on the settings page. */}
        <Link
          to="/chat/$chatId/settings/categories/new"
          params={{ chatId: String(chatId) }}
        >
          <Cell
            Component="label"
            before={
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--tg-theme-link-color)]"
                style={{
                  backgroundColor:
                    "color-mix(in srgb, var(--tg-theme-link-color) 15%, transparent)",
                }}
              >
                <Plus size={16} />
              </span>
            }
          >
            <span style={{ color: "var(--tg-theme-link-color)" }}>
              Create custom category
            </span>
          </Cell>
        </Link>
      </Section>

      <Section header="BASE">
        {base.map((c) => (
          <Cell key={c.id} before={<span className="text-xl">{c.emoji}</span>}>
            {c.title}
          </Cell>
        ))}
      </Section>
    </main>
  );
}
