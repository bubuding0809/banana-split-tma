import { getRouteApi } from "@tanstack/react-router";
import {
  backButton,
  initData,
  mainButton,
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
  const form = useAppForm({
    ...formOpts,
    
    onSubmit: async ({ value }) => {
      // TODO: Call mutation to create expense
      await new Promise((r) => setTimeout(r, 1000));
      alert(`Created: ${JSON.stringify(value, null, 2)} for user ${userId}`);

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

  // Set main button params based on state
  useEffect(() => {
    const isFinalStep = currentFormStep === FORM_STEPS.length - 1;
    mainButton.setParams.ifAvailable({
      text: isFinalStep ? "Save" : "Next",
      isVisible: true,
      isEnabled: true,
      hasShineEffect: isFinalStep,
      backgroundColor: isFinalStep ? "#00A86B" : tButtonColor,
    });
  }, [currentFormStep, tButtonColor]);

  const CurrentFormComponent = FORM_STEPS.at(currentFormStep)?.component;

  return (
    <div className="flex flex-col gap-2.5 pb-4">
      {/* Form steps */}
      <section className="flex flex-col justify-center items-center w-full px-4">
        <Steps
          count={FORM_STEPS.length}
          progress={currentFormStep + 1}
          className="w-full"
        />
        <div className="flex justify-evenly w-full px-2">
          {FORM_STEPS.map((step, index) => (
            <Subheadline
              key={index}
              level="2"
              weight={index === currentFormStep ? "2" : "3"}
              className={cn(
                "text-center w-1/3",
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
