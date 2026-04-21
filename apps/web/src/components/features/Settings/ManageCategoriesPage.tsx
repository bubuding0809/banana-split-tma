import { useEffect } from "react";
import { ButtonCell, Cell, Section } from "@telegram-apps/telegram-ui";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  backButton,
  hapticFeedback,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import { trpc } from "@/utils/trpc";
import { ChevronRight, Plus } from "lucide-react";

export default function ManageCategoriesPage({ chatId }: { chatId: number }) {
  const navigate = useNavigate();
  const tButtonColor = useSignal(themeParams.buttonColor);
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
        {/* "Create custom category" uses Telegram UI's ButtonCell — same
            pattern SnapshotPage uses for "Add Snapshots" so the two
            settings-adjacent create-affordances look identical. */}
        <ButtonCell
          onClick={() => {
            navigate({
              to: "/chat/$chatId/settings/categories/new",
              params: { chatId: String(chatId) },
            });
            hapticFeedback.notificationOccurred("success");
          }}
          before={<Plus />}
          style={{ color: tButtonColor }}
        >
          Create custom category
        </ButtonCell>
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
