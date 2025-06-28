import { getRouteApi } from "@tanstack/react-router";
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
import { useEffect } from "react";
import { cn } from "@utils/cn";

import AmountFormStep from "./AmountFormStep";
import PayeeformStep from "./PayeeFormStep";
import SplitModeFormStep from "./SplitModeFormStep";
import { useAppForm } from "@/hooks";
import { formOpts } from "./AddExpenseForm";
import { trpc } from "@/utils/trpc";

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
  // * Hooks ======================================================================================
  const tUserData = useSignal(initData.user);
  const tButtonColor = useSignal(themeParams.buttonColor);
  const navigate = routeApi.useNavigate();
  const { prevSegment, currentFormStep } = routeApi.useSearch();

  const userId = tUserData?.id ?? 0;

  // * From API ===================================================================================
  const createExpenseMutation = trpc.expense.createExpense.useMutation();

  const form = useAppForm({
    ...formOpts,
    defaultValues: {
      ...formOpts.defaultValues,
      payee: userId.toString(),
    },

    onSubmit: async ({ value }) => {
      try {
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
          payerId: Number(value.payee), // FIX: Actually send the payee data!
          description: value.description,
          amount: Number(value.amount),
          splitMode: value.splitMode,
          participantIds: value.participants.map((id) => Number(id)),
          customSplits,
        });

        mainButton.setParams.ifAvailable({
          isLoaderVisible: false,
        });

        navigate({
          to: "..",
          search: (prev) => ({
            ...prev,
            selectedSegment: prevSegment,
            title: "👥 Group",
          }),
        });
      } catch (error) {
        mainButton.setParams.ifAvailable({
          isLoaderVisible: false,
        });

        const errorMessage =
          error instanceof Error ? error.message : "Failed to create expense";
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
      if (isFirstStep) {
        return navigate({
          to: "..",
          search: {
            selectedSegment: prevSegment,
            title: "👥 Group",
          },
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
  }, [chatId, currentFormStep, navigate, prevSegment]);

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
    <div className="flex flex-col gap-2.5 pb-4">
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
          />
        )}
      </section>
    </div>
  );
};

export default AddExpensePage;
