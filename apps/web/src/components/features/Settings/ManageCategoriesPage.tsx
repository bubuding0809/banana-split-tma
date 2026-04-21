import { useEffect } from "react";
import { Cell, Section } from "@telegram-apps/telegram-ui";
import { useNavigate } from "@tanstack/react-router";
import { backButton, mainButton } from "@telegram-apps/sdk-react";
import { trpc } from "@/utils/trpc";
import { ChevronRight } from "lucide-react";

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

  useEffect(() => {
    mainButton.mount();
    mainButton.setParams({
      text: "Create custom category",
      isVisible: true,
      isEnabled: true,
    });
    const off = mainButton.onClick(() => {
      navigate({
        to: "/chat/$chatId/settings/categories/new",
        params: { chatId: String(chatId) },
      });
    });
    return () => {
      off();
      mainButton.setParams({ isVisible: false });
    };
  }, [chatId, navigate]);

  const custom = data?.custom ?? [];
  const base = data?.base ?? [];

  return (
    <main className="px-3 pb-24">
      <Section header="CUSTOM">
        {custom.length === 0 ? (
          <Cell description="Tap Create custom category below to add your first one.">
            No custom categories yet
          </Cell>
        ) : (
          custom.map((c) => (
            <Cell
              key={c.id}
              Component="button"
              before={<span className="text-xl">{c.emoji}</span>}
              after={<ChevronRight size={16} />}
              onClick={() =>
                navigate({
                  to: "/chat/$chatId/settings/categories/$categoryId",
                  params: {
                    chatId: String(chatId),
                    categoryId: c.id.replace(/^chat:/, ""),
                  },
                })
              }
            >
              {c.title}
            </Cell>
          ))
        )}
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
