import { trpc } from "@/utils/trpc";
import { backButton, hapticFeedback } from "@telegram-apps/sdk-react";
import {
  Cell,
  Section,
  Modal,
  Button,
  Input,
} from "@telegram-apps/telegram-ui";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Trash2, Plus } from "lucide-react";
import EmojiPicker from "../Expense/EmojiPicker";

interface Props {
  chatId: number;
}

const ManageCategoriesPage = ({ chatId }: Props) => {
  const navigate = useNavigate();
  const trpcUtils = trpc.useUtils();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [createSearch, setCreateSearch] = useState("");

  const { data: categories } = trpc.category.listForChat.useQuery({
    chatId: BigInt(chatId),
  });

  const createMutation = trpc.category.createCustom.useMutation({
    onSuccess: () =>
      trpcUtils.category.listForChat.invalidate({ chatId: BigInt(chatId) }),
  });

  const deleteMutation = trpc.category.deleteCustom.useMutation({
    onSuccess: () =>
      trpcUtils.category.listForChat.invalidate({ chatId: BigInt(chatId) }),
  });

  useEffect(() => {
    backButton.show();
    const offClick = backButton.onClick(() => {
      navigate({
        to: "/chat/$chatId/settings",
        params: { chatId: chatId.toString() },
      });
    });
    return () => {
      offClick();
      backButton.hide();
    };
  }, [navigate, chatId]);

  const handleDelete = (id: string, name: string) => {
    hapticFeedback.impactOccurred("medium");
    if (confirm(`Are you sure you want to delete the category "${name}"?`)) {
      deleteMutation.mutate({ id, chatId: BigInt(chatId) });
    }
  };

  const handleCreate = async (icon: string) => {
    hapticFeedback.impactOccurred("medium");
    setIsEmojiPickerOpen(false);
    setIsCreateOpen(false);

    try {
      await createMutation.mutateAsync({
        chatId: BigInt(chatId),
        name: createSearch,
        icon,
      });
    } catch (e) {
      alert("Failed to create category");
    }
    setCreateSearch("");
  };

  const customCategories = categories?.filter((c) => c.chatId !== null) || [];
  const baseCategories = categories?.filter((c) => c.chatId === null) || [];

  return (
    <div className="flex flex-col gap-4 pb-12 pt-4">
      <Section header="Custom Categories">
        {customCategories.length === 0 ? (
          <Cell className="opacity-50">No custom categories created yet.</Cell>
        ) : (
          customCategories.map((cat) => (
            <Cell
              key={cat.id}
              before={<span className="text-2xl">{cat.icon}</span>}
              after={
                <div
                  className="p-2 text-[var(--tg-theme-destructive-text-color)]"
                  onClick={() => handleDelete(cat.id, cat.name)}
                >
                  <Trash2 size={20} />
                </div>
              }
            >
              {cat.name}
            </Cell>
          ))
        )}
        <Cell
          onClick={() => setIsCreateOpen(true)}
          before={
            <Plus size={24} className="text-[var(--tg-theme-link-color)]" />
          }
          className="text-[var(--tg-theme-link-color)]"
        >
          Add Custom Category
        </Cell>
      </Section>

      <Section header="Base Categories (Locked)">
        {baseCategories.map((cat) => (
          <Cell
            key={cat.id}
            before={<span className="text-2xl">{cat.icon}</span>}
            after={
              <span className="text-xs text-[var(--tg-theme-hint-color)]">
                Default
              </span>
            }
          >
            {cat.name}
          </Cell>
        ))}
      </Section>

      <Modal
        header={
          <Modal.Header>
            <div className="px-4 py-2 font-semibold">New Category</div>
          </Modal.Header>
        }
        open={isCreateOpen}
        onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) setCreateSearch("");
        }}
        snapPoints={[1]}
        style={{ height: "90vh" }}
      >
        <div className="flex h-full flex-col gap-4 px-4 pb-8 pt-4">
          <Input
            header="Category Name"
            placeholder="e.g. Board Games"
            value={createSearch}
            onChange={(e: any) => setCreateSearch(e.target.value)}
          />
          <Button
            size="l"
            stretched
            disabled={!createSearch.trim()}
            onClick={() => setIsEmojiPickerOpen(true)}
          >
            Select Icon
          </Button>
        </div>
      </Modal>

      {isEmojiPickerOpen && (
        <EmojiPicker
          isOpen={isEmojiPickerOpen}
          onClose={() => setIsEmojiPickerOpen(false)}
          onSelect={handleCreate}
          categoryName={createSearch}
        />
      )}
    </div>
  );
};

export default ManageCategoriesPage;
