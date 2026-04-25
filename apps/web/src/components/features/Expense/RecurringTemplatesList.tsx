import { Section, Skeleton, Text } from "@telegram-apps/telegram-ui";
import { backButton, hapticFeedback } from "@telegram-apps/sdk-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { resolveCategory, type ChatCategoryRow } from "@repo/categories";

import { trpc } from "@/utils/trpc";
import RecurringExpenseCell, {
  type RecurringTemplateForCell,
} from "./RecurringExpenseCell";

interface Props {
  chatId: number;
}

type RecurringTemplate = RecurringTemplateForCell & {
  status: "ACTIVE" | "CANCELED" | "ENDED";
};

export default function RecurringTemplatesList({ chatId }: Props) {
  const globalNavigate = useNavigate();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null
  );

  const { data, status } = trpc.expense.recurring.list.useQuery({ chatId });
  const { data: categoriesData } = trpc.category.listByChat.useQuery({
    chatId,
  });

  // Show / hide Telegram BackButton for the page
  useEffect(() => {
    backButton.show.ifAvailable();
    return () => {
      backButton.hide();
    };
  }, []);

  // Wire BackButton click to navigate back to chat settings
  useEffect(() => {
    const offClick = backButton.onClick(() => {
      hapticFeedback.notificationOccurred("success");
      globalNavigate({
        to: "/chat/$chatId/settings",
        params: { chatId: String(chatId) },
      });
    });
    return () => offClick();
  }, [chatId, globalNavigate]);

  const chatRows = useMemo<ChatCategoryRow[]>(
    () =>
      (categoriesData?.items ?? [])
        .filter((c) => c.kind === "custom")
        .map((c) => ({
          id: c.id.replace(/^chat:/, ""),
          emoji: c.emoji,
          title: c.title,
        })),
    [categoriesData]
  );

  if (status === "pending") {
    return (
      <main className="px-3 pb-8">
        <Section header="Recurring expenses">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="px-4 py-3">
              <Skeleton visible>
                <span>Loading template placeholder</span>
              </Skeleton>
            </div>
          ))}
        </Section>
      </main>
    );
  }

  if (status === "error" || !data) {
    return (
      <main className="px-3 pb-8">
        <div className="text-(--tg-theme-subtitle-text-color) p-6 text-center">
          Failed to load recurring expenses.
        </div>
      </main>
    );
  }

  const templates = data as RecurringTemplate[];

  if (templates.length === 0) {
    return (
      <main className="px-3 pb-8">
        <div className="text-(--tg-theme-subtitle-text-color) p-6 text-center">
          <Text>No recurring expenses yet.</Text>
        </div>
      </main>
    );
  }

  const selectedTemplate =
    templates.find((t) => t.id === selectedTemplateId) ?? null;

  return (
    <main className="px-3 pb-8">
      <Section header="Recurring expenses">
        {templates.map((t) => {
          const resolved = t.categoryId
            ? resolveCategory(t.categoryId, chatRows)
            : null;
          return (
            <RecurringExpenseCell
              key={t.id}
              template={t}
              categoryEmoji={resolved?.emoji}
              onClick={() => setSelectedTemplateId(t.id)}
            />
          );
        })}
      </Section>

      {/* Placeholder — replaced by RecurringExpenseDetailsModal in Task 5 */}
      {selectedTemplate && (
        <div data-testid="modal-placeholder" hidden>
          {selectedTemplate.id}
        </div>
      )}
    </main>
  );
}
