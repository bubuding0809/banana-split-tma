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
  mainButton,
  popup,
  secondaryButton,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { resolveCategory } from "@repo/categories";
import { format } from "date-fns";

import { trpc } from "@/utils/trpc";
import { formatCurrencyWithCode } from "@/utils/financial";
import RepeatAndEndDateSection from "./RepeatAndEndDateSection";
import type { RecurrenceValue } from "./RecurrencePickerSheet";

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

  // Local schedule state mirrors the form's RecurrenceValue shape so we
  // can reuse the same picker/validation logic from add-expense.
  // Seed from `template` once it's loaded.
  const [recurrence, setRecurrence] = useState<RecurrenceValue | null>(null);

  useEffect(() => {
    if (!template || recurrence !== null) return;
    const t = template as {
      frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
      interval: number;
      weekdays: ("SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT")[];
      endDate: Date | string | null;
    };
    setRecurrence({
      preset:
        t.interval === 1 &&
        (t.frequency === "DAILY" ||
          t.frequency === "WEEKLY" ||
          t.frequency === "MONTHLY" ||
          t.frequency === "YEARLY")
          ? t.frequency
          : "CUSTOM",
      customFrequency: t.frequency,
      customInterval: t.interval,
      weekdays: t.weekdays,
      endDate: t.endDate
        ? format(
            t.endDate instanceof Date ? t.endDate : new Date(t.endDate),
            "yyyy-MM-dd"
          )
        : undefined,
    });
  }, [template, recurrence]);

  const trpcUtils = trpc.useUtils();
  const updateMutation = trpc.expense.recurring.update.useMutation({
    onSuccess: () => {
      trpcUtils.expense.recurring.list.invalidate({ chatId });
      trpcUtils.expense.recurring.get.invalidate({ templateId });
    },
  });

  const cancelMutation = trpc.expense.recurring.cancel.useMutation({
    onSuccess: () => {
      trpcUtils.expense.recurring.list.invalidate({ chatId });
    },
  });
  const tDestructive = useSignal(themeParams.destructiveTextColor);
  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const offSecondaryClickRef = useRef<VoidFunction | undefined>(undefined);

  // secondaryButton (Delete) wiring
  useEffect(() => {
    if (!template) return;
    secondaryButton.setParams.ifAvailable({
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

      secondaryButton.setParams.ifAvailable({
        isLoaderVisible: true,
        isEnabled: false,
      });
      try {
        await cancelMutation.mutateAsync({ templateId });
        if (!isMountedRef.current) return;
        hapticFeedback.notificationOccurred("success");
        globalNavigate({
          to: "/chat/$chatId/recurring-expenses",
          params: { chatId: String(chatId) },
        });
      } catch (error) {
        if (!isMountedRef.current) return;
        console.error("Failed to cancel recurring template:", error);
        hapticFeedback.notificationOccurred("error");
        alert(
          error instanceof Error
            ? error.message
            : "Couldn't delete this recurring expense. Try again."
        );
      } finally {
        secondaryButton.setParams.ifAvailable({
          isLoaderVisible: false,
          isEnabled: true,
        });
      }
    });

    return () => {
      offSecondaryClickRef.current?.();
      offSecondaryClickRef.current = undefined;
      secondaryButton.setParams.ifAvailable({ isVisible: false });
    };
  }, [
    template,
    templateId,
    cancelMutation,
    chatId,
    globalNavigate,
    tDestructive,
  ]);

  // mainButton (Save) wiring
  useEffect(() => {
    if (!template || !recurrence) return;
    mainButton.setParams.ifAvailable({
      text: "Save",
      isVisible: true,
      isEnabled: true,
    });
    const offClick = mainButton.onClick.ifAvailable(async () => {
      // Only send fields that actually changed.
      const t = template as {
        frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
        interval: number;
        weekdays: ("SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT")[];
        endDate: Date | string | null;
      };

      const dirtyFields: {
        templateId: string;
        frequency?: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
        interval?: number;
        weekdays?: RecurrenceValue["weekdays"];
        endDate?: Date | null;
      } = { templateId };

      let hasChanges = false;

      const newFrequency =
        recurrence.preset === "CUSTOM"
          ? recurrence.customFrequency
          : recurrence.preset === "NONE"
            ? null
            : recurrence.preset;
      const newInterval =
        recurrence.preset === "CUSTOM" ? recurrence.customInterval : 1;
      const newWeekdays = recurrence.weekdays;
      const newEndDate = recurrence.endDate
        ? new Date(recurrence.endDate + "T00:00:00")
        : null;

      if (newFrequency && newFrequency !== t.frequency) {
        dirtyFields.frequency = newFrequency;
        hasChanges = true;
      }
      if (newInterval !== t.interval) {
        dirtyFields.interval = newInterval;
        hasChanges = true;
      }
      const sortedNew = [...newWeekdays].sort();
      const sortedOld = [...(t.weekdays ?? [])].sort();
      if (JSON.stringify(sortedNew) !== JSON.stringify(sortedOld)) {
        dirtyFields.weekdays = newWeekdays;
        hasChanges = true;
      }
      const oldEndIso = t.endDate
        ? format(
            t.endDate instanceof Date ? t.endDate : new Date(t.endDate),
            "yyyy-MM-dd"
          )
        : null;
      const newEndIso = recurrence.endDate ?? null;
      if (oldEndIso !== newEndIso) {
        dirtyFields.endDate = newEndDate;
        hasChanges = true;
      }

      // Nothing changed — bail with a small haptic.
      if (!hasChanges) {
        hapticFeedback.notificationOccurred("warning");
        return;
      }

      mainButton.setParams.ifAvailable({
        isLoaderVisible: true,
        isEnabled: false,
      });
      try {
        await updateMutation.mutateAsync(dirtyFields);
        if (!isMountedRef.current) return;
        hapticFeedback.notificationOccurred("success");
        globalNavigate({
          to: "/chat/$chatId/recurring-expenses",
          params: { chatId: String(chatId) },
        });
      } catch (error) {
        if (!isMountedRef.current) return;
        console.error("Failed to update recurring template:", error);
        hapticFeedback.notificationOccurred("error");
        alert(
          error instanceof Error
            ? error.message
            : "Couldn't save changes. Try again."
        );
      } finally {
        mainButton.setParams.ifAvailable({
          isLoaderVisible: false,
          isEnabled: true,
        });
      }
    });

    return () => {
      offClick?.();
      mainButton.setParams.ifAvailable({ isVisible: false });
    };
  }, [
    template,
    recurrence,
    templateId,
    updateMutation,
    chatId,
    globalNavigate,
  ]);

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
          <Text>Couldn&apos;t load this recurring expense.</Text>
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
    startDate: Date | string;
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

      {recurrence && (
        <>
          <div className="px-2">
            <Subheadline weight="2">Schedule</Subheadline>
          </div>
          <RepeatAndEndDateSection
            value={recurrence}
            onChange={setRecurrence}
            defaultWeekdayFromDate={format(
              t.startDate instanceof Date ? t.startDate : new Date(t.startDate),
              "yyyy-MM-dd"
            )}
          />
        </>
      )}
    </main>
  );
}
