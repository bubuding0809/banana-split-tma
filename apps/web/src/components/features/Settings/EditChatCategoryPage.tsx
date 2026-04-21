import { useState, useEffect, useRef } from "react";
import {
  Caption,
  Input,
  Section,
  Snackbar,
  Subheadline,
} from "@telegram-apps/telegram-ui";
import { useNavigate, useRouter } from "@tanstack/react-router";
import {
  backButton,
  mainButton,
  secondaryButton,
} from "@telegram-apps/sdk-react";
import EmojiPicker, { EmojiStyle, Theme } from "emoji-picker-react";
import { trpc } from "@/utils/trpc";
import { suggestEmojiForTitle } from "@/utils/suggestEmoji";

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
  const router = useRouter();
  const utils = trpc.useUtils();
  const { data } = trpc.category.listByChat.useQuery({ chatId });
  const existing = (data?.items ?? []).find(
    (c) => c.kind === "custom" && c.id === `chat:${categoryId}`
  );

  const [emoji, setEmoji] = useState(existing?.emoji ?? "🏷️");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [error, setError] = useState<string | null>(null);

  // Track whether the user has interacted with the name field so we
  // don't flash an error on a fresh form. Fires on blur or first keystroke.
  const [nameTouched, setNameTouched] = useState(false);
  const showNameError = nameTouched && title.trim().length === 0;

  // True once the user has manually picked an emoji from the picker in
  // *this* session. Stops auto-suggest from overwriting their explicit
  // choice when they continue editing the name. Seeded `false` in both
  // add and edit modes — on edit, the user often wants the emoji to
  // re-sync after a title tweak (e.g. renaming "Food" → "Gym" should
  // update 🍜 → 🏋️). The picker's onEmojiClick flips this true for the
  // rest of the session.
  const userTouchedEmojiRef = useRef(false);

  useEffect(() => {
    if (existing) {
      setEmoji(existing.emoji);
      setTitle(existing.title);
    }
  }, [existing]);

  // Leave this page by going back to wherever the user came from —
  // Manage Categories if they entered via that list, or the Add/Edit
  // expense form if they tapped "Create custom category" inside the
  // picker. Falls back to Manage if history is empty.
  const leaveCategoryPage = () => {
    if (window.history.length > 1) {
      router.history.back();
    } else {
      navigate({
        to: "/chat/$chatId/settings/categories",
        params: { chatId: String(chatId) },
      });
    }
  };

  useEffect(() => {
    backButton.mount();
    backButton.show();
    const off = backButton.onClick(() => leaveCategoryPage());
    return () => {
      off();
      backButton.hide();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  const createMut = trpc.category.create.useMutation({
    onSuccess: () => {
      utils.category.listByChat.invalidate({ chatId });
      leaveCategoryPage();
    },
    onError: (e) => setError(e.message),
  });
  const updateMut = trpc.category.update.useMutation({
    onSuccess: () => {
      utils.category.listByChat.invalidate({ chatId });
      leaveCategoryPage();
    },
    onError: (e) => setError(e.message),
  });
  const deleteMut = trpc.category.delete.useMutation({
    onSuccess: () => {
      utils.category.listByChat.invalidate({ chatId });
      leaveCategoryPage();
    },
    onError: (e) => setError(e.message),
  });

  // Emoji auto-suggest — runs synchronously against a local keyword index
  // (BASE_CATEGORIES + Unicode CLDR via emojilib). No debounce needed:
  // lookup is ~0ms, so firing on every keystroke is cheap and immediate.
  useEffect(() => {
    if (userTouchedEmojiRef.current) return;
    if (title.trim().length < 2) return;
    const suggestion = suggestEmojiForTitle(title);
    if (suggestion) setEmoji(suggestion);
  }, [title]);

  const onSave = () => {
    setError(null);
    // Validate on click instead of pre-disabling the button. Marking the
    // field touched surfaces the inline error — better than a silently
    // unresponsive button.
    if (title.trim().length === 0) {
      setNameTouched(true);
      return;
    }
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

  const isBusy = createMut.isPending || updateMut.isPending;

  // Keep a ref to the latest onSave so the click handler (registered once)
  // always calls the freshest closure — avoids re-subscribing on every
  // keystroke, which was making the main button flicker per input change.
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  // Register the main-button click handler exactly once on mount. Both
  // the mount setParams and the cleanup reset every visual field so we
  // neither inherit state from a previous page (e.g. Add Expense's
  // green save bg + shine) nor leak our state into the next one.
  useEffect(() => {
    mainButton.mount();
    mainButton.setParams({
      isVisible: true,
      backgroundColor: undefined,
      textColor: undefined,
      hasShineEffect: false,
    });
    const off = mainButton.onClick(() => onSaveRef.current());
    return () => {
      off();
      mainButton.setParams({
        isVisible: false,
        isEnabled: true,
        isLoaderVisible: false,
        backgroundColor: undefined,
        textColor: undefined,
        hasShineEffect: false,
      });
    };
  }, []);

  // Button stays enabled (except during the save roundtrip) — validation
  // happens on click, not via pre-disabling. Only the loader flag tracks
  // the mutation state.
  useEffect(() => {
    mainButton.setParams({
      text: isEdit ? "Save" : "Create",
      isEnabled: !isBusy,
      isLoaderVisible: isBusy,
    });
  }, [isEdit, isBusy]);

  // Keep a ref to the latest onDelete for the same reason we do for onSave
  // — register the secondary button click handler once and dispatch the
  // latest closure, without re-subscribing on every keystroke.
  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;

  // Secondary button registration (edit mode only) + teardown. Registers
  // the click handler exactly once. Cleanup hides the button AND resets
  // every visual field so the custom danger red doesn't leak into
  // downstream pages that use secondaryButton.
  useEffect(() => {
    if (!isEdit) return;
    secondaryButton.mount();
    secondaryButton.setParams({
      text: "Delete category",
      isVisible: true,
      backgroundColor: "#E53935",
      textColor: "#FFFFFF",
      hasShineEffect: false,
    });
    const off = secondaryButton.onClick(() => onDeleteRef.current());
    return () => {
      off();
      secondaryButton.setParams({
        isVisible: false,
        isEnabled: true,
        isLoaderVisible: false,
        backgroundColor: undefined,
        textColor: undefined,
        hasShineEffect: false,
      });
    };
  }, [isEdit]);

  // Secondary-button params — enabled + loader track the mutation state
  // without re-subscribing the click handler.
  useEffect(() => {
    if (!isEdit) return;
    secondaryButton.setParams({
      isEnabled: !isBusy && !deleteMut.isPending,
      isLoaderVisible: deleteMut.isPending,
    });
  }, [isEdit, isBusy, deleteMut.isPending]);

  return (
    <main className="flex flex-col gap-4 px-3 pb-8">
      {/* Preview — emoji in a tinted panel over the category name. Emoji
          suggestion is synchronous (local keyword lookup, see
          suggestEmojiForTitle), so there's no pending state to show. */}
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
            status={showNameError ? "error" : "default"}
            onChange={(e) => {
              setTitle(e.target.value);
              if (!nameTouched) setNameTouched(true);
            }}
            onBlur={() => setNameTouched(true)}
          />
        </Section>
        {showNameError && (
          <div className="flex flex-col gap-1 px-2">
            <Caption className="text-sm text-red-500">Name is required</Caption>
          </div>
        )}
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
            onEmojiClick={(e) => {
              // Manual pick — lock out further auto-suggest so name edits
              // don't overwrite the user's explicit choice.
              userTouchedEmojiRef.current = true;
              setEmoji(e.emoji);
            }}
            theme={Theme.DARK}
            emojiStyle={EmojiStyle.NATIVE}
            width="100%"
            height={380}
            lazyLoadEmojis
            skinTonesDisabled
            previewConfig={{ showPreview: false }}
            searchDisabled
          />
        </div>
      </div>

      {/* Save / Create is driven by the TMA main button, Delete by the TMA
          secondary button (see the mainButton / secondaryButton effects
          above). No inline buttons in the body. */}

      {error ? (
        <Snackbar onClose={() => setError(null)} description={error}>
          Error
        </Snackbar>
      ) : null}
    </main>
  );
}
