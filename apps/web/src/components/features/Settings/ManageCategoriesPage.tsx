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

  const items = data?.items ?? [];
  const custom = items.filter((c) => c.kind === "custom");
  const base = items.filter((c) => c.kind === "base");

  return (
    <main className="px-3 pb-8">
      <Section header="CUSTOM">
        {/* "Create custom category" sits at the top of the section — mirrors
            SnapshotPage's "Add Snapshots" ButtonCell placement. The
            "Customize picker" (reorder + hide) entry lives on the main
            Settings screen now, promoted to a full preview card. */}
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

        {custom.length === 0 ? (
          <Cell description="Tap Create custom category above to add your first one.">
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
