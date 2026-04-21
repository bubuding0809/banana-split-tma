import { useState, useEffect, useRef } from "react";
import {
  Input,
  Section,
  Button,
  Snackbar,
  Subheadline,
} from "@telegram-apps/telegram-ui";
import { useNavigate } from "@tanstack/react-router";
import { backButton, mainButton } from "@telegram-apps/sdk-react";
import EmojiPicker, {
  EmojiStyle,
  SkinTonePickerLocation,
  Theme,
} from "emoji-picker-react";
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
        `Delete "${existing?.emoji ?? ""} ${existing?.title ?? "this category"}"?\n\n` +
          "Any expenses currently tagged with this category will be set to Uncategorized. This cannot be undone."
      )
    )
      return;
    deleteMut.mutate({ chatCategoryId: categoryId });
  };

  const canSave = title.trim().length > 0 && emoji.length > 0;
  const isBusy = createMut.isPending || updateMut.isPending;

  // Keep a ref to the latest onSave so the click handler (registered once)
  // always calls the freshest closure — avoids re-subscribing on every
  // keystroke, which was making the main button flicker per input change.
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  // Register the click handler exactly once on mount.
  useEffect(() => {
    mainButton.mount();
    mainButton.setParams({ isVisible: true });
    const off = mainButton.onClick(() => onSaveRef.current());
    return () => {
      off();
      mainButton.setParams({ isVisible: false });
    };
  }, []);

  // Update params (text / enabled / loader) only when the inputs that affect
  // them actually change — not on every keystroke.
  useEffect(() => {
    mainButton.setParams({
      text: isEdit ? "Save" : "Create",
      isEnabled: canSave && !isBusy,
      isLoaderVisible: isBusy,
    });
  }, [isEdit, canSave, isBusy]);

  return (
    <main className="flex flex-col gap-4 px-3 pb-8">
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

      {/* NAME — header + counter match the Details step in AmountFormStep
          so the typography feels consistent between the two forms. */}
      <div className="flex flex-col gap-2">
        <label className="-top-7 flex w-full justify-between px-2 transition-all duration-500 ease-in-out">
          <Subheadline weight="2">Name</Subheadline>
          <span className="text-sm text-gray-500">
            {title.length} / {TITLE_MAX_LENGTH} characters
          </span>
        </label>
        <Section>
          <Input
            placeholder="e.g. Bali Trip"
            value={title}
            maxLength={TITLE_MAX_LENGTH}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Section>
      </div>

      <div className="flex flex-col gap-2">
        <label className="-top-7 flex w-full justify-between px-2 transition-all duration-500 ease-in-out">
          <Subheadline weight="2">Emoji</Subheadline>
        </label>
        {/* Full emoji picker — customized to blend into the Telegram theme:
            sheet color pulled from --tg-theme-secondary-bg-color, borders /
            separators from --tg-theme-section-separator-color, and hover
            from a hint-color mix. Skin tone selector hidden (categories are
            non-person emojis in practice). Theme is forced to DARK because
            Telegram Mini Apps typically run in dark mode; the native Theme.
            AUTO relies on `prefers-color-scheme` which doesn't always
            reflect the TMA theme. */}
        <div
          className="overflow-hidden rounded-xl"
          style={
            {
              "--epr-bg-color":
                "color-mix(in srgb, var(--tg-theme-text-color) 6%, var(--tg-theme-secondary-bg-color))",
              "--epr-category-label-bg-color":
                "var(--tg-theme-secondary-bg-color)",
              "--epr-text-color": "var(--tg-theme-text-color)",
              "--epr-search-input-bg-color":
                "color-mix(in srgb, var(--tg-theme-text-color) 8%, transparent)",
              "--epr-search-input-placeholder-color":
                "var(--tg-theme-hint-color)",
              // Strip the picker's outer border — the rounded container
              // already visually frames it against the Telegram theme.
              "--epr-picker-border-color": "transparent",
              "--epr-hover-bg-color":
                "color-mix(in srgb, var(--tg-theme-text-color) 12%, transparent)",
              "--epr-focus-bg-color":
                "color-mix(in srgb, var(--tg-theme-button-color) 20%, transparent)",
              "--epr-highlight-color": "var(--tg-theme-button-color)",
              "--epr-category-icon-active-color":
                "var(--tg-theme-button-color)",
              // Category tab icons + section labels — the package's dark
              // theme defaults blend into a dark sheet, hiding the nav
              // tabs entirely. Pull them back to the hint color so both
              // the icon row and the "Smileys & People" headers render.
              "--epr-category-navigation-button-color":
                "var(--tg-theme-hint-color)",
              "--epr-category-label-text-color": "var(--tg-theme-hint-color)",
            } as React.CSSProperties
          }
        >
          <EmojiPicker
            onEmojiClick={(e) => setEmoji(e.emoji)}
            theme={Theme.DARK}
            emojiStyle={EmojiStyle.NATIVE}
            width="100%"
            height={480}
            lazyLoadEmojis
            skinTonesDisabled
            skinTonePickerLocation={SkinTonePickerLocation.SEARCH}
            previewConfig={{ showPreview: false }}
            searchPlaceholder="Search emoji"
          />
        </div>
      </div>

      {/* Save / Create is driven by the TMA main button (see the mainButton
          effect above). Delete stays inline because the TMA surface only
          offers one main button — promoting Delete would demote Save. */}
      {isEdit && (
        <div className="flex flex-col gap-2 pt-4">
          <Button size="l" mode="plain" onClick={onDelete}>
            Delete category
          </Button>
        </div>
      )}

      {error ? (
        <Snackbar onClose={() => setError(null)} description={error}>
          Error
        </Snackbar>
      ) : null}
    </main>
  );
}
