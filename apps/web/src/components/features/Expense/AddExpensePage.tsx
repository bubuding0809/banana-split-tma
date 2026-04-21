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
import { useAppForm, useFormDraftCache, useStartParams } from "@/hooks";
import { formOpts } from "./AddExpenseForm";
import { trpc } from "@/utils/trpc";
import { normalizeDateToMidnight } from "@/utils/date";
import { useCategoryAutoSuggest } from "./useCategoryAutoSuggest";
import { clearFormDraft, readFormDraft } from "@/utils/formDraft";

interface AddExpensePageProps {
  chatId: number;
}

const routeApi = getRouteApi("/_tma/chat/$chatId_/add-expense");

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

const AddExpensePage = ({ chatId }: AddExpensePageProps) => {
  // * Hooks =======================================================================================
  const tUserData = useSignal(initData.user);
  const tButtonColor = useSignal(themeParams.buttonColor);
  const navigate = routeApi.useNavigate();
  const globalNavigate = useNavigate();
  const tmaStartParams = useStartParams();
  const { prevTab, currentFormStep } = routeApi.useSearch();

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
  const { data: dChatData } = trpc.chat.getChat.useQuery({ chatId });
  trpc.chat.getMembers.usePrefetchQuery({
    chatId,
  });

  // * Mutations ===================================================================================
  const createExpenseMutation = trpc.expense.createExpense.useMutation();

  // Draft cache — preserves form values across in-app navigations so the
  // user can jump out to Organize picker / Create custom category and come
  // back with their amount, description, participants etc. intact.
  const draftKey = `add-expense:${chatId}`;
  // Reading sessionStorage is only safe in the browser. `useAppForm`
  // evaluates `defaultValues` once on mount — if a draft exists we use it
  // verbatim; otherwise we fall back to the usual empty-form defaults.
  const cachedDraft = readFormDraft<typeof formOpts.defaultValues>(draftKey);

  const form = useAppForm({
    ...formOpts,
    defaultValues: cachedDraft ?? {
      ...formOpts.defaultValues,
      payee: userId.toString(),
      currency: dChatData?.baseCurrency ?? "SGD",
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
        // If the category classifier is still running (user typed fast then
        // clicked through all steps before the 300ms debounce + Gemini call
        // resolved), give it a moment to land before we commit — otherwise
        // the expense saves with categoryId: null while the suggest is
        // about to resolve. Capped at 3.5s (slightly above CLASSIFY_TIMEOUT_MS
        // so we don't stall on a genuinely stuck request).
        const waitStart = Date.now();
        while (
          form.getFieldValue("suggestPending") &&
          Date.now() - waitStart < 3500
        ) {
          await new Promise((r) => setTimeout(r, 50));
        }
        // Re-read categoryId after the wait — if the classifier just
        // resolved, form state now has the freshly-picked value.
        const resolvedCategoryId = form.getFieldValue("categoryId");

        // Convert form values to API format
        const customSplits =
          value.splitMode !== "EQUAL"
            ? value.customSplits.map((split) => ({
                userId: Number(split.userId),
                amount: Number(split.amount),
              }))
            : undefined;

        await createExpenseMutation.mutateAsync({
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
          categoryId: resolvedCategoryId,
          threadId: dChatData?.threadId
            ? Number(dChatData.threadId)
            : undefined,
        });

        mainButton.setParams.ifAvailable({
          isLoaderVisible: false,
        });

        // Submitted successfully — drop the draft so a fresh Add Expense
        // starts empty, not pre-filled with this expense's values.
        clearFormDraft(draftKey);

        navigateBackToChat({
          selectedTab: "transaction",
          selectedCurrency: value.currency,
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
          error instanceof Error ? error.message : "Failed to create expense";
        alert(`❌ Error: ${errorMessage}`);
      }
    },
  });

  // Auto-suggest lives at page scope so the 300ms debounce + in-flight
  // mutation survive the user pressing Next during the debounce window.
  // The hook also returns a confirmation snackbar when a category lands,
  // which we render at the bottom of the page below. The "Change" action
  // jumps back to step 0 where the Category picker lives.
  const { snackbar: categoryAutoPickSnackbar } = useCategoryAutoSuggest({
    form,
    chatId,
    disableAutoAssign: false,
    onJumpToCategory: () => {
      navigate({
        search: (prev) => ({ ...prev, currentFormStep: 0 }),
      });
    },
  });

  // Persist form values to sessionStorage on every change so navigating
  // out (e.g. to Organize picker) and back restores the draft verbatim.
  useFormDraftCache(draftKey, form);

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
          title: "",
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
  }, [chatId, currentFormStep, navigateBackToChat, navigate, prevTab]);

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
      text: isFinalStep ? "Save 🚀" : "Next »",
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
            isEditMode={false}
            navigate={navigate}
            chatId={chatId}
            membersExpanded={routeApi.useSearch().membersExpanded}
          />
        )}
      </section>

      {categoryAutoPickSnackbar}
    </div>
  );
};

export default AddExpensePage;
