import { Section, Skeleton, Text } from "@telegram-apps/telegram-ui";
import { backButton, hapticFeedback } from "@telegram-apps/sdk-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { trpc } from "@/utils/trpc";
import { type CanonicalFrequency, type Weekday } from "./recurrencePresets";
import RecurringExpenseCell, {
  type RecurringTemplateForCell,
} from "./RecurringExpenseCell";

interface Props {
  chatId: number;
}

interface RecurringTemplate {
  id: string;
  description: string;
  amount: string | number;
  currency: string;
  payerId: number;
  chatId: number;
  frequency: CanonicalFrequency;
  interval: number;
  weekdays: Weekday[];
  startDate: Date | string;
  endDate: Date | string | null;
  categoryId: string | null;
  status: "ACTIVE" | "CANCELED" | "ENDED";
}

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

  // Build categoryId → emoji map (the API prefixes custom-category ids
  // with "chat:" but template.categoryId is the bare UUID).
  const categoryById = useMemo(() => {
    const map = new Map<string, { emoji: string; title: string }>();
    (categoriesData?.items ?? []).forEach((c) => {
      const id = c.id.replace(/^chat:/, "");
      map.set(id, { emoji: c.emoji, title: c.title });
    });
    return map;
  }, [categoriesData]);

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
          const cat = t.categoryId ? categoryById.get(t.categoryId) : null;
          const cellTemplate: RecurringTemplateForCell = {
            id: t.id,
            description: t.description,
            amount: t.amount,
            currency: t.currency,
            payerId: t.payerId,
            chatId: t.chatId,
            frequency: t.frequency,
            interval: t.interval,
            weekdays: t.weekdays,
            startDate: t.startDate,
            endDate: t.endDate,
            categoryId: t.categoryId,
          };
          return (
            <RecurringExpenseCell
              key={t.id}
              template={cellTemplate}
              categoryEmoji={cat?.emoji}
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
