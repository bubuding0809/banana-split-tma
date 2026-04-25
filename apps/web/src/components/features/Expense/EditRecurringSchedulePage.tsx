import {
  Caption,
  Cell,
  Section,
  Skeleton,
  Subheadline,
  Text,
} from "@telegram-apps/telegram-ui";
import {
  backButton,
  hapticFeedback,
  initData,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import { useEffect, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { resolveCategory, type ChatCategoryRow } from "@repo/categories";

import { trpc } from "@/utils/trpc";
import { formatCurrencyWithCode } from "@/utils/financial";

interface Props {
  chatId: number;
  templateId: string;
}

const splitModeMap = {
  EQUAL: "Equal split",
  PERCENTAGE: "Split by percentage",
  EXACT: "Split exactly",
  SHARES: "Split by shares",
} as const;

export default function EditRecurringSchedulePage({
  chatId,
  templateId,
}: Props) {
  const globalNavigate = useNavigate();
  const tButtonColor = useSignal(themeParams.buttonColor);
  const tUserData = useSignal(initData.user);
  const userId = tUserData?.id ?? 0;

  const { data: template, status } = trpc.expense.recurring.get.useQuery({
    templateId,
  });
  const { data: categories } = trpc.category.listByChat.useQuery({ chatId });
  const { data: supportedCurrencies } =
    trpc.currency.getSupportedCurrencies.useQuery({});

  const chatRows = useMemo(
    () =>
      (categories?.items ?? [])
        .filter((c) => c.kind === "custom")
        .map((c) => ({
          id: c.id.replace(/^chat:/, ""),
          emoji: c.emoji,
          title: c.title,
        })),
    [categories]
  );

  // BackButton wiring — same pattern as RecurringTemplatesList
  useEffect(() => {
    backButton.show.ifAvailable();
    return () => {
      backButton.hide();
    };
  }, []);

  useEffect(() => {
    const offClick = backButton.onClick(() => {
      hapticFeedback.notificationOccurred("success");
      globalNavigate({
        to: "/chat/$chatId/recurring-expenses",
        params: { chatId: String(chatId) },
      });
    });
    return () => offClick();
  }, [chatId, globalNavigate]);

  if (status === "pending") {
    return (
      <main className="px-3 pb-8 pt-3">
        <Skeleton visible>
          <Cell>Loading…</Cell>
        </Skeleton>
      </main>
    );
  }

  if (status === "error" || !template) {
    return (
      <main className="px-3 pb-8 pt-3">
        <div className="text-(--tg-theme-subtitle-text-color) p-6 text-center">
          <Text>Couldn't load this recurring expense.</Text>
        </div>
      </main>
    );
  }

  const t = template as {
    id: string;
    chatId: number;
    payerId: number;
    description: string;
    amount: string | number;
    currency: string;
    splitMode: keyof typeof splitModeMap;
    categoryId: string | null;
  };

  const cat = t.categoryId ? resolveCategory(t.categoryId, chatRows) : null;
  const flagEmoji =
    supportedCurrencies?.find((c) => c.code === t.currency)?.flagEmoji ?? "💱";
  const isPayerYou = t.payerId === userId;

  return (
    <main className="flex flex-col gap-4 px-3 pb-8 pt-3">
      <div className="px-2">
        <Subheadline weight="2">Editing</Subheadline>
      </div>

      {/* Read-only summary Cell — same shape as the row the user just tapped */}
      <Section>
        <Cell
          before={
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[rgba(255,255,255,0.06)] text-xl leading-none">
              {cat?.emoji ?? "❓"}
            </div>
          }
          subhead={
            <Caption
              weight="1"
              level="1"
              style={{ color: isPayerYou ? tButtonColor : undefined }}
            >
              {isPayerYou ? "You" : `User ${t.payerId}`} spends
            </Caption>
          }
          description={
            <>
              on{" "}
              <Caption weight="2" level="1">
                {t.description}
              </Caption>
            </>
          }
          after={<Text>{splitModeMap[t.splitMode]}</Text>}
        >
          <span className="flex items-center gap-1">
            {flagEmoji} {formatCurrencyWithCode(Number(t.amount), t.currency)}
          </span>
        </Cell>
      </Section>

      {/* Schedule section — wired in Task 8 */}
      <div className="px-2">
        <Subheadline weight="2">Schedule</Subheadline>
      </div>
      <Section>
        <Cell>
          <Text style={{ color: tButtonColor }}>
            (Schedule editor — Task 8)
          </Text>
        </Cell>
      </Section>
    </main>
  );
}
