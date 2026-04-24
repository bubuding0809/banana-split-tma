import { Cell, Section, Skeleton, Text } from "@telegram-apps/telegram-ui";
import { Repeat as RepeatIcon } from "lucide-react";
import { backButton, hapticFeedback } from "@telegram-apps/sdk-react";
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

import { trpc } from "@/utils/trpc";
import { formatRecurrenceSummary } from "@dko/trpc";

interface Props {
  chatId: number;
}

type Weekday = "SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT";
type Frequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

interface RecurringTemplate {
  id: string;
  description: string;
  amount: string | number;
  currency: string;
  frequency: Frequency;
  interval: number;
  weekdays: Weekday[];
  endDate: Date | string | null;
  status: "ACTIVE" | "CANCELED" | "ENDED";
}

export default function RecurringTemplatesList({ chatId }: Props) {
  const globalNavigate = useNavigate();
  const { data, status } = trpc.expense.recurring.list.useQuery({ chatId });

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

  if (status === "pending") {
    return (
      <main className="px-3 pb-8">
        <Section header="Recurring expenses">
          {Array.from({ length: 3 }).map((_, idx) => (
            <Cell
              key={idx}
              before={<RepeatIcon size={20} />}
              subtitle={
                <Skeleton visible>
                  <span>Loading subtitle placeholder</span>
                </Skeleton>
              }
            >
              <Skeleton visible>
                <span>Loading template name placeholder</span>
              </Skeleton>
            </Cell>
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

  return (
    <main className="px-3 pb-8">
      <Section header="Recurring expenses">
        {templates.map((t) => {
          const subtitle = formatRecurrenceSummary({
            frequency: t.frequency,
            interval: t.interval,
            weekdays: t.weekdays,
            endDate: t.endDate ? new Date(t.endDate) : null,
          });
          return (
            <Cell
              key={t.id}
              before={<RepeatIcon size={20} />}
              subtitle={subtitle}
              after={
                <Text>
                  {Number(t.amount).toFixed(2)} {t.currency}
                </Text>
              }
            >
              {t.description}
            </Cell>
          );
        })}
      </Section>
    </main>
  );
}
