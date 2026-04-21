import { getRouteApi, useNavigate } from "@tanstack/react-router";
import {
  backButton,
  hapticFeedback,
  initData,
  mainButton,
  secondaryButton,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import { Steps, Subheadline } from "@telegram-apps/telegram-ui";
import { useEffect, useCallback } from "react";
import { cn } from "@utils/cn";

import AmountFormStep from "./AmountFormStep";
import PayeeformStep from "./PayeeFormStep";
import SplitModeFormStep from "./SplitModeFormStep";
import { useAppForm, useStartParams } from "@/hooks";
import { formOpts } from "./AddExpenseForm";
import { trpc } from "@/utils/trpc";
import { formatDateKey, normalizeDateToMidnight } from "@utils/date";

interface EditExpensePageProps {
  chatId: number;
  expenseId: string;
}

const routeApi = getRouteApi("/_tma/chat/$chatId_/edit-expense/$expenseId");

const FORM_STEPS = [
  {
    title: "Amount",
    component: AmountFormStep,
  },
  {
    title: "Paid by",
    component: PayeeformStep,
  },
  {
    title: "Split Mode",
    component: SplitModeFormStep,
  },
];

const EditExpensePage = ({ chatId, expenseId }: EditExpensePageProps) => {
  // * Hooks ======================================================================================
  const tUserData = useSignal(initData.user);
  const tButtonColor = useSignal(themeParams.buttonColor);
  const navigate = routeApi.useNavigate();
  const globalNavigate = useNavigate();
  const tmaStartParams = useStartParams();
  const trpcUtils = trpc.useUtils();
  const { prevTab, currentFormStep, membersExpanded } = routeApi.useSearch();

  const userId = tUserData?.id ?? 0;
  const isPersonalChat = ["private", "p"].includes(
    tmaStartParams?.chat_type ?? "private"
  );

  const navigateBackToChat = useCallback(
    (search: Record<string, unknown>) => {
      if (isPersonalChat) {
        return globalNavigate({ to: "/chat", search });
      }
      return globalNavigate({
        to: "/chat/$chatId",
        params: { chatId: chatId.toString() },
        search,
      });
    },
    [isPersonalChat, globalNavigate, chatId]
  );

  // * Queries =====================================================================================
  const { data: expenseData, isLoading: isExpenseLoading } =
    trpc.expense.getExpenseDetails.useQuery({
      expenseId,
    });
  const { data: dChatData } = trpc.chat.getChat.useQuery({ chatId });
  trpc.chat.getMembers.usePrefetchQuery({
    chatId,
  });

  // * Mutations ===================================================================================
  const updateExpenseMutation = trpc.expense.updateExpense.useMutation();

  const handleInitParticipants = () => {
    if (expenseData?.splitMode === "SHARES") {
      return [];
    }
    return expenseData?.participants.map((p) => p.id.toString()) ?? [];
  };

  const handleInitSplits = () => {
    if (expenseData?.splitMode === "SHARES") {
      return [];
    }

    return (
      expenseData?.shares.map((s) => ({
        userId: s.userId.toString(),
        amount: s.amount.toString(),
      })) ?? []
    );
  };

  const form = useAppForm({
    ...formOpts,
    defaultValues: {
      amount: expenseData ? expenseData.amount.toString() : "",
      description: expenseData?.description ?? "",
      date: expenseData?.date
        ? formatDateKey(new Date(expenseData.date))
        : formatDateKey(new Date()),
      payee: expenseData?.payerId
        ? expenseData.payerId.toString()
        : userId.toString(),
      currency: expenseData?.currency ?? dChatData?.baseCurrency ?? "SGD",
      splitMode: expenseData?.splitMode ?? "EQUAL",
      participants: handleInitParticipants(),
      categoryId: expenseData?.categoryId ?? null,
      // Edit mode never shows the Auto badge and never re-suggests — the user
      // is editing a saved expense, so any pre-existing category is
      // implicitly "touched."
      autoPicked: false,
      userTouchedCategory: true,
      customSplits: handleInitSplits(),
    },
    onSubmit: async ({ value }) => {
      secondaryButton.setParams.ifAvailable({
        isVisible: false,
        isEnabled: false,
      });
      mainButton.setParams.ifAvailable({
        isLoaderVisible: true,
        isEnabled: false,
      });
      try {
        // Convert form values to API format
        const customSplits =
          value.splitMode !== "EQUAL"
            ? value.customSplits.map((split) => ({
                userId: Number(split.userId),
                amount: Number(split.amount),
              }))
            : undefined;

        await updateExpenseMutation.mutateAsync({
          expenseId: expenseId,
          chatId: chatId,
          creatorId: userId,
          payerId: Number(value.payee),
          description: value.description,
          amount: Number(value.amount),
          date: normalizeDateToMidnight(new Date(value.date + "T00:00:00")),
          splitMode: value.splitMode,
          participantIds: value.participants.map((id) => Number(id)),
          customSplits,
          currency: value.currency,
          // Pass null through so the user can explicitly clear the category
          // via the "Uncategorized" picker tile. `?? undefined` would drop
          // that intent because updateExpense treats undefined as "don't touch".
          categoryId: value.categoryId,
          threadId: dChatData?.threadId
            ? Number(dChatData.threadId)
            : undefined,
        });

        // Invalidate relevant queries to refresh data
        trpcUtils.expense.getExpenseByChat.invalidate({
          chatId,
        });
        trpcUtils.currency.getCurrenciesWithBalance.invalidate({
          userId,
          chatId,
        });
        trpcUtils.expense.getExpenseDetails.invalidate({
          expenseId,
        });

        mainButton.setParams.ifAvailable({
          isLoaderVisible: false,
        });

        navigateBackToChat({
          selectedTab: "transaction",
          selectedExpense: expenseId,
        });
      } catch (error) {
        secondaryButton.setParams.ifAvailable({
          isVisible: true,
          isEnabled: true,
        });
        mainButton.setParams.ifAvailable({
          isLoaderVisible: false,
          isEnabled: true,
        });

        const errorMessage =
          error instanceof Error ? error.message : "Failed to update expense";
        alert(`❌ Error: ${errorMessage}`);
      }
    },
  });

  // * Effects ====================================================================================
  // Show back button
  useEffect(() => {
    backButton.show.ifAvailable();
    return () => {
      backButton.hide();
    };
  }, []);

  // configure back button click
  useEffect(() => {
    const isFirstStep = currentFormStep === 0;

    const offClick = backButton.onClick(() => {
      hapticFeedback.notificationOccurred("success");

      if (isFirstStep) {
        return navigateBackToChat({
          selectedTab: prevTab,
          selectedExpense: expenseId,
        });
      }

      navigate({
        search: (prev) => ({
          ...prev,
          currentFormStep: prev.currentFormStep - 1,
        }),
      });
    });

    return () => {
      offClick();
    };
  }, [
    chatId,
    currentFormStep,
    expenseId,
    navigateBackToChat,
    navigate,
    prevTab,
  ]);

  // Show main button on mount
  useEffect(() => {
    mainButton.setParams.ifAvailable({
      text: "Next",
      isVisible: true,
      isEnabled: true,
      backgroundColor: tButtonColor,
      hasShineEffect: false,
    });

    return () => {
      mainButton.setParams.ifAvailable({
        isVisible: false,
        isEnabled: false,
        backgroundColor: tButtonColor,
        hasShineEffect: false,
      });
    };
  }, [tButtonColor]);

  // Set main button params based on current step
  useEffect(() => {
    const isFinalStep = currentFormStep === FORM_STEPS.length - 1;
    mainButton.setParams.ifAvailable({
      text: isFinalStep ? "Update 🚀" : "Next »",
      isVisible: true,
      isEnabled: true,
      hasShineEffect: isFinalStep,
      backgroundColor: isFinalStep ? "#00A86B" : tButtonColor,
    });
  }, [currentFormStep, tButtonColor]);

  // Set secondary button based on current step
  useEffect(() => {
    const isBackAvailable = currentFormStep > 0;
    secondaryButton.setParams.ifAvailable({
      isVisible: isBackAvailable,
      isEnabled: isBackAvailable,
      text: "« Back",
    });

    const offClick = secondaryButton.onClick.ifAvailable(() => {
      hapticFeedback.notificationOccurred("success");
      navigate({
        search: (prev) => ({
          ...prev,
          currentFormStep: currentFormStep - 1,
        }),
      });
    });

    return () => {
      offClick?.();
    };
  }, [currentFormStep, navigate]);

  // Clean up secondary button on unmount
  useEffect(() => {
    return () => {
      secondaryButton.setParams.ifAvailable({
        isVisible: false,
        isEnabled: false,
      });
    };
  }, []);

  const CurrentFormComponent = FORM_STEPS.at(currentFormStep)?.component;

  // Show loading state while fetching expense data
  if (isExpenseLoading) {
    return (
      <div className="flex flex-col gap-2.5 pb-16">
        <section className="flex w-full flex-col items-center justify-center px-4">
          <div className="mb-4 h-4 w-full animate-pulse rounded bg-gray-200"></div>
          <div className="h-8 w-full animate-pulse rounded bg-gray-200"></div>
        </section>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 pb-16">
      {/* Form steps */}
      <section className="flex w-full flex-col items-center justify-center px-4">
        <Steps
          count={FORM_STEPS.length}
          progress={currentFormStep + 1}
          className="w-full"
        />
        <div className="flex w-full justify-evenly px-2">
          {FORM_STEPS.map((step, index) => (
            <Subheadline
              key={index}
              level="2"
              weight={index === currentFormStep ? "2" : "3"}
              className={cn(
                "w-1/3 text-center",
                index !== currentFormStep && "text-gray-500/50"
              )}
            >
              {index + 1}. {step.title}
            </Subheadline>
          ))}
        </div>
      </section>

      {/* Form */}
      <section className="p-4">
        {CurrentFormComponent && (
          <CurrentFormComponent
            form={form}
            isLastStep={currentFormStep === FORM_STEPS.length - 1}
            step={currentFormStep}
            isEditMode={true}
            navigate={navigate}
            chatId={chatId}
            disableAutoAssign={true}
            membersExpanded={membersExpanded}
          />
        )}
      </section>
    </div>
  );
};

export default EditExpensePage;
