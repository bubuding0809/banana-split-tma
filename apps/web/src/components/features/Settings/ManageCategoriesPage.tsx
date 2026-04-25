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
import { ChevronRight, Plus, Sliders } from "lucide-react";
import CategoryTile from "@/components/features/Category/CategoryTile";

const PREVIEW_ROWS = 2;
const PREVIEW_COLS = 4;
const PREVIEW_COUNT = PREVIEW_ROWS * PREVIEW_COLS;

export default function ManageCategoriesPage({ chatId }: { chatId: number }) {
  const navigate = useNavigate();
  const tButtonColor = useSignal(themeParams.buttonColor);
  const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);
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
  const visible = items.filter((c) => !c.hidden);
  const hiddenCount = items.length - visible.length;
  const previewTiles = visible.slice(0, PREVIEW_COUNT);
  const overflowCount = Math.max(0, visible.length - PREVIEW_COUNT);
  const overflowLine =
    overflowCount > 0 && hiddenCount > 0
      ? `+ ${overflowCount} more · ${hiddenCount} hidden`
      : overflowCount > 0
        ? `+ ${overflowCount} more`
        : hiddenCount > 0
          ? `${hiddenCount} hidden`
          : null;

  return (
    <main className="px-3 pb-8">
      <Section>
        <Link
          to="/chat/$chatId/settings/categories/organize"
          params={{ chatId: String(chatId) }}
        >
          <Cell
            before={<Sliders size={20} />}
            after={<ChevronRight size={16} />}
          >
            Reorder &amp; hide tiles
          </Cell>
        </Link>
      </Section>

      {previewTiles.length > 0 && (
        <Section header="PICKER PREVIEW">
          <div className="px-3 pb-3 pt-2">
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
              <div
                className="pt-2 text-center text-[11px]"
                style={{ color: tSubtitleTextColor }}
              >
                {overflowLine}
              </div>
            ) : null}
          </div>
        </Section>
      )}

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
