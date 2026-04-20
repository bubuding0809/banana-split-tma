import { useState, useEffect } from "react";
import { Input, Section, Button, Snackbar } from "@telegram-apps/telegram-ui";
import { useNavigate } from "@tanstack/react-router";
import { backButton } from "@telegram-apps/sdk-react";
import { trpc } from "@/utils/trpc";

interface Props {
  chatId: number;
  categoryId?: string; // bare uuid when editing
}

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

  return (
    <div>
      <Section header={isEdit ? "EDIT CATEGORY" : "NEW CATEGORY"}>
        <Input
          header="Emoji"
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
        />
        <Input
          header="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Section>

      <div className="flex flex-col gap-2 px-4 pt-4">
        <Button
          size="l"
          onClick={onSave}
          disabled={title.trim().length === 0 || emoji.length === 0}
        >
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
