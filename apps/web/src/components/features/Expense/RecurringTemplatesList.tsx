import { Section, Skeleton, Text } from "@telegram-apps/telegram-ui";
import {
  backButton,
  hapticFeedback,
  popup,
  secondaryButton,
  themeParams,
  useSignal,
  initData,
} from "@telegram-apps/sdk-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { resolveCategory, type ChatCategoryRow } from "@repo/categories";

import { trpc } from "@/utils/trpc";
import RecurringExpenseCell, {
  type RecurringTemplateForCell,
} from "./RecurringExpenseCell";
import RecurringExpenseDetailsModal from "./RecurringExpenseDetailsModal";

interface Props {
  chatId: number;
}

type RecurringTemplate = RecurringTemplateForCell & {
  splitMode: "EQUAL" | "PERCENTAGE" | "EXACT" | "SHARES";
  participantIds: number[];
  customSplits: unknown;
  timezone: string;
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

  const tDestructive = useSignal(themeParams.destructiveTextColor);
  const tButtonColor = useSignal(themeParams.buttonColor);
  const tUserData = useSignal(initData.user);
  const userId = tUserData?.id ?? 0;

  const trpcUtils = trpc.useUtils();
  const cancelMutation = trpc.expense.recurring.cancel.useMutation({
    onSuccess: () => {
      trpcUtils.expense.recurring.list.invalidate({ chatId });
    },
  });

  const offSecondaryClickRef = useRef<VoidFunction | undefined>(undefined);

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

  // Cleanup secondary button click handler on unmount
  useEffect(() => {
    return () => {
      offSecondaryClickRef.current?.();
    };
  }, []);

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

  const handleModalOpenChange = (templateId: string | null) => {
    setSelectedTemplateId(templateId);

    if (templateId) {
      secondaryButton.setParams({
        text: "Delete",
        isVisible: true,
        isEnabled: true,
        textColor: tDestructive,
      });

      offSecondaryClickRef.current?.();
      offSecondaryClickRef.current = secondaryButton.onClick(async () => {
        const action = await popup.open.ifAvailable({
          title: "Delete recurring expense?",
          message: "Future occurrences won't fire. Past expenses are kept.",
          buttons: [
            { type: "destructive", text: "Delete", id: "delete-template" },
            { type: "cancel" },
          ],
        });
        if (action !== "delete-template") return;

        secondaryButton.setParams({
          isLoaderVisible: true,
          isEnabled: false,
        });
        try {
          await cancelMutation.mutateAsync({ templateId });
          handleModalOpenChange(null);
        } catch (error) {
          console.error("Failed to cancel recurring template:", error);
          alert("Couldn't delete this recurring expense. Try again later.");
        } finally {
          secondaryButton.setParams({
            isLoaderVisible: false,
            isEnabled: true,
          });
        }
      });
    } else {
      secondaryButton.setParams({
        isVisible: false,
        isEnabled: false,
        textColor: tButtonColor,
      });
      offSecondaryClickRef.current?.();
      offSecondaryClickRef.current = undefined;
    }
  };

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

  const selectedResolved = selectedTemplate?.categoryId
    ? resolveCategory(selectedTemplate.categoryId, chatRows)
    : null;

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
              onClick={() => handleModalOpenChange(t.id)}
            />
          );
        })}
      </Section>

      {selectedTemplate && (
        <RecurringExpenseDetailsModal
          open
          onOpenChange={(open) => {
            if (!open) handleModalOpenChange(null);
          }}
          template={selectedTemplate}
          shares={
            selectedTemplate.splitMode === "EQUAL"
              ? selectedTemplate.participantIds.map((pid: number) => ({
                  userId: pid,
                  amount:
                    Number(selectedTemplate.amount) /
                    Math.max(selectedTemplate.participantIds.length, 1),
                }))
              : []
          }
          userId={userId}
          categoryEmoji={selectedResolved?.emoji}
          categoryTitle={selectedResolved?.title}
          onEdit={() => {
            handleModalOpenChange(null);
            globalNavigate({
              to: "/chat/$chatId/edit-recurring/$templateId",
              params: {
                chatId: String(chatId),
                templateId: selectedTemplate.id,
              },
            });
          }}
        />
      )}
    </main>
  );
}
