import { useState, useEffect } from "react";
import { Input, Section, Button, Snackbar } from "@telegram-apps/telegram-ui";
import { useNavigate } from "@tanstack/react-router";
import { backButton } from "@telegram-apps/sdk-react";
import { trpc } from "@/utils/trpc";

interface Props {
  chatId: number;
  categoryId?: string; // bare uuid when editing
}

// Matches the backend's createChatCategory / updateChatCategory zod max —
// keep them in sync. Tightened from 24 → 16 because the picker tiles
// render labels at text-[13px] on ~80px tiles, and anything longer than
// ~16 chars truncates to ellipsis.
const TITLE_MAX_LENGTH = 16;

// Curated built-in emoji picker pool — grouped loosely by theme so the grid
// reads as a quick-pick rather than random noise. Mirrors the pool used in
// the prototype (docs/superpowers/specs/.../screens.jsx).
const EMOJI_POOL = [
  "🍜",
  "🍕",
  "🍔",
  "☕",
  "🍺",
  "🍷",
  "🍰",
  "🎂",
  "🍦",
  "🥗",
  "🍱",
  "🥘",
  "🚕",
  "🚗",
  "🚲",
  "✈️",
  "🚆",
  "⛴️",
  "🛵",
  "⛽",
  "🏠",
  "🏢",
  "🛋️",
  "🛏️",
  "🧺",
  "🧹",
  "🛒",
  "🥦",
  "🍎",
  "🥕",
  "🥛",
  "🧀",
  "🎉",
  "🎊",
  "🎮",
  "🎬",
  "🎵",
  "🎤",
  "🎨",
  "📚",
  "🎁",
  "🎯",
  "🏖️",
  "🗻",
  "🏝️",
  "🗼",
  "🌴",
  "🏨",
  "🎡",
  "💊",
  "🏥",
  "💉",
  "🧘",
  "🏋️",
  "🚴",
  "⚽",
  "🏀",
  "🛍️",
  "👕",
  "👟",
  "👜",
  "💄",
  "💍",
  "💡",
  "💧",
  "📶",
  "📱",
  "📺",
  "🔌",
  "💼",
  "💰",
  "💸",
  "💳",
  "📈",
  "🧾",
  "📦",
];

export default function EditChatCategoryPage({ chatId, categoryId }: Props) {
  const isEdit = !!categoryId;
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const { data } = trpc.category.listByChat.useQuery({ chatId });
  const existing = data?.custom.find((c) => c.id === `chat:${categoryId}`);

  const [emoji, setEmoji] = useState(existing?.emoji ?? "🏷️");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existing) {
      setEmoji(existing.emoji);
      setTitle(existing.title);
    }
  }, [existing]);

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

  const goBackToList = () =>
    navigate({
      to: "/chat/$chatId/settings/categories",
      params: { chatId: String(chatId) },
    });

  const createMut = trpc.category.create.useMutation({
    onSuccess: () => {
      utils.category.listByChat.invalidate({ chatId });
      goBackToList();
    },
    onError: (e) => setError(e.message),
  });
  const updateMut = trpc.category.update.useMutation({
    onSuccess: () => {
      utils.category.listByChat.invalidate({ chatId });
      goBackToList();
    },
    onError: (e) => setError(e.message),
  });
  const deleteMut = trpc.category.delete.useMutation({
    onSuccess: () => {
      utils.category.listByChat.invalidate({ chatId });
      goBackToList();
    },
    onError: (e) => setError(e.message),
  });

  const onSave = () => {
    setError(null);
    if (isEdit && categoryId) {
      updateMut.mutate({ chatCategoryId: categoryId, emoji, title });
    } else {
      createMut.mutate({ chatId, emoji, title });
    }
  };

  const onDelete = () => {
    if (!categoryId) return;
    if (
      !window.confirm(
        "Delete this category? Expenses using it will become Uncategorized."
      )
    )
      return;
    deleteMut.mutate({ chatCategoryId: categoryId });
  };

  const canSave = title.trim().length > 0 && emoji.length > 0;

  return (
    <div className="pb-8">
      {/* Preview — emoji in a tinted panel over the category name, same
          styling as the prototype's header preview. */}
      <div className="flex flex-col items-center gap-2.5 py-6">
        <div
          className="flex h-[72px] w-[72px] items-center justify-center rounded-2xl text-[40px]"
          style={{ backgroundColor: "rgba(127, 127, 127, 0.28)" }}
        >
          {emoji}
        </div>
        <div className="text-[15px] font-semibold text-[var(--tg-theme-text-color)]">
          {title || "Category name"}
        </div>
      </div>

      <Section
        header="NAME"
        footer={`${title.length} / ${TITLE_MAX_LENGTH} characters`}
      >
        <Input
          placeholder="e.g. Bali Trip"
          value={title}
          maxLength={TITLE_MAX_LENGTH}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Section>

      <Section header="EMOJI">
        <div className="grid grid-cols-8 gap-1.5 p-3">
          {EMOJI_POOL.map((e, i) => {
            const selected = emoji === e;
            return (
              <button
                key={`${e}-${i}`}
                type="button"
                onClick={() => setEmoji(e)}
                className="flex aspect-square items-center justify-center rounded-lg text-xl leading-none"
                style={{
                  backgroundColor: selected
                    ? "color-mix(in srgb, var(--tg-theme-button-color) 20%, transparent)"
                    : "rgba(127, 127, 127, 0.16)",
                  outline: selected
                    ? "1.5px solid var(--tg-theme-button-color)"
                    : "none",
                }}
              >
                {e}
              </button>
            );
          })}
        </div>
      </Section>

      <div className="flex flex-col gap-2 px-4 pt-4">
        <Button size="l" onClick={onSave} disabled={!canSave}>
          {isEdit ? "Save" : "Create"}
        </Button>
        {isEdit && (
          <Button size="l" mode="plain" onClick={onDelete}>
            Delete category
          </Button>
        )}
      </div>

      {error ? (
        <Snackbar onClose={() => setError(null)} description={error}>
          Error
        </Snackbar>
      ) : null}
    </div>
  );
}
