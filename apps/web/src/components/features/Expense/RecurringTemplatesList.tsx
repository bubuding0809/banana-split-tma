import { Cell, Section, Text } from "@telegram-apps/telegram-ui";
import { Repeat as RepeatIcon } from "lucide-react";
import { trpc } from "@/utils/trpc";
import { format } from "date-fns";

interface Props {
  chatId: number;
}

export default function RecurringTemplatesList({ chatId }: Props) {
  const { data, status } = trpc.expense.recurring.list.useQuery({ chatId });

  if (status === "pending")
    return <div className="p-4 text-center">Loading…</div>;
  if (status === "error" || !data)
    return <div className="p-4 text-center text-red-500">Failed to load</div>;
  if (data.length === 0)
    return (
      <div className="text-(--tg-theme-subtitle-text-color) p-6 text-center">
        No recurring expenses yet.
      </div>
    );

  return (
    <main className="px-3 pb-8">
      <Section header="Recurring expenses">
        {data.map((t: any) => {
          const subtitle = (() => {
            const freqText =
              t.frequency === "WEEKLY" && t.interval > 1
                ? `Every ${t.interval} weeks`
                : t.frequency.toLowerCase();
            const endText = t.endDate
              ? ` · Until ${format(new Date(t.endDate), "d MMM yyyy")}`
              : "";
            return `${freqText}${endText}`;
          })();
          return (
            <Cell
              key={t.id}
              before={<RepeatIcon size={20} />}
              subtitle={<Text className="text-xs">{subtitle}</Text>}
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
