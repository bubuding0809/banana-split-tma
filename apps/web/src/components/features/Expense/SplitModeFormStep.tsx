import { withForm } from "@/hooks";
import { formOpts } from "./AddExpenseForm";
import { SplitModeType } from "./AddExpenseForm.type";
import { Caption, Section } from "@telegram-apps/telegram-ui";
import { hapticFeedback, mainButton, popup } from "@telegram-apps/sdk-react";
import { DollarSign, Equal, Pizza } from "lucide-react";
import { cn } from "@utils/cn";
import { getRouteApi } from "@tanstack/react-router";
import { CardCell } from "@telegram-apps/telegram-ui/dist/components/Blocks/Card/components/CardCell/CardCell";
import { useEffect, useState } from "react";
import SplitEqualConfig from "./SplitEqualConfig";
import SplitEqualFooter from "./SplitEqualFooter";
import SplitShareConfig from "./SplitShareConfig";
import SplitShareFooter from "./SplitShareFooter";
import SplitExactConfig from "./SplitExactConfig";
import SplitExactFooter from "./SplitExactFooter";

const routeApi = getRouteApi("/_tma/chat/$chatId_/add-expense");

const SPLIT_MODE_OPTIONS: {
  value: SplitModeType;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    value: "EQUAL",
    label: "Equal",
    description: "Amount split equally among participants",
    icon: <Equal size={20} />,
  },
  {
    value: "SHARES",
    label: "Shares",
    description: "Amount split based on shares assigned",
    icon: <Pizza size={20} />,
  },
  {
    value: "EXACT",
    label: "Exact",
    description: "Custom amounts",
    icon: <DollarSign size={20} />,
  },
] as const;

const SplitModeFormStep = withForm({
  ...formOpts,
  props: {
    step: 2,
    isLastStep: true,
  },
  render: function Render({ form, isLastStep, step }) {
    const navigate = routeApi.useNavigate();

    const [showFooter, setShowFooter] = useState(true);

    //* Effects ====================================================================================
    // Configure main button click
    useEffect(() => {
      const offClick = mainButton.onClick.ifAvailable(() => {
        form.validateSync("change");
        form.setFieldMeta("splitMode", (prev) => ({
          ...prev,
          isTouched: true,
        }));
        form.setFieldMeta("participants", (prev) => ({
          ...prev,
          isTouched: true,
        }));

        const hasErrors = Object.values(form.state.fieldMeta).some(
          (meta) => meta.errors.length > 0
        );

        if (hasErrors) {
          return hapticFeedback.notificationOccurred("warning");
        }
        hapticFeedback.notificationOccurred("success");

        // Submit form if last step
        if (isLastStep) {
          form.handleSubmit();
        } else {
          navigate({
            search: (prev) => ({
              ...prev,
              currentFormStep: step + 1,
            }),
          });
        }
      });

      return () => {
        offClick?.();
      };
    }, [step, form, navigate, isLastStep]);

    // * Handlers ==================================================================================
    const handleSplitModeChange = async (mode: SplitModeType) => {
      // Ask for confirmation if participants or custom splits are dirty
      const { isDirty: isParticipantsDirty } =
        form.getFieldMeta("participants") ?? {};
      const { isDirty: isCustomSplitsDirty } =
        form.getFieldMeta("customSplits") ?? {};
      if (isCustomSplitsDirty || isParticipantsDirty) {
        const id = await popup.open({
          title: "Change split mode",
          message:
            "This will reset your current split configuration. Are you sure?",
          buttons: [
            {
              text: "Yes",
              id: "confirm",
              type: "destructive",
            },
            {
              type: "cancel",
            },
          ],
        });
        if (id !== "confirm") {
          return;
        }
      }

      // Reset participants and custom splits when changing split mode
      form.setFieldValue("splitMode", mode);
      form.setFieldValue("participants", []);
      form.setFieldValue("customSplits", []);
      form.setFieldValue("exactSplitStage", "selection");

      // Reset field meta for participants and custom splits
      form.setFieldMeta("participants", (prev) => ({
        ...prev,
        isDirty: false,
        isTouched: false,
      }));
      form.setFieldMeta("customSplits", (prev) => ({
        ...prev,
        isDirty: false,
        isTouched: false,
      }));
    };

    return (
      <div className="flex flex-col gap-6">
        {/* Split Mode Selection */}
        <form.AppField name="splitMode">
          {(field) => (
            <section className="flex flex-col">
              <Section.Header large>Split by?</Section.Header>
              <fieldset className="grid grid-cols-3 gap-2.5" role="radiogroup">
                {SPLIT_MODE_OPTIONS.map(
                  ({ description, icon, label, value }, index) => {
                    const isSelected = field.state.value === value;
                    const isFirstOption = index === 0;
                    const shouldBeTabbable =
                      isSelected || (!field.state.value && isFirstOption);

                    return (
                      <div key={value} className="relative">
                        <input
                          type="radio"
                          id={`split-mode-${value}`}
                          name="splitMode"
                          value={value}
                          checked={isSelected}
                          onChange={() => handleSplitModeChange(value)}
                          className="sr-only"
                        />
                        <CardCell
                          readOnly
                          subtitle={<Caption>{description}</Caption>}
                          subhead={icon}
                          role="radio"
                          aria-checked={isSelected}
                          aria-describedby={`split-mode-${value}-desc`}
                          tabIndex={shouldBeTabbable ? 0 : -1}
                          className={cn(
                            "cursor-pointer rounded-lg transition-all",
                            "focus:outline-2 focus:outline-offset-2 focus:outline-blue-500",
                            isSelected &&
                              "outline-2 outline-offset-2 outline-blue-500/30"
                          )}
                          onClick={() => handleSplitModeChange(value)}
                        >
                          {label}
                        </CardCell>
                        <div
                          id={`split-mode-${value}-desc`}
                          className="sr-only"
                        >
                          {description}
                        </div>
                      </div>
                    );
                  }
                )}
              </fieldset>
            </section>
          )}
        </form.AppField>

        {/* Split Mode Configuration */}
        <form.Subscribe
          selector={(state) => ({
            splitMode: state.values.splitMode,
          })}
        >
          {({ splitMode }) => {
            const ConfigComponent = {
              EQUAL: SplitEqualConfig,
              SHARES: SplitShareConfig,
              EXACT: SplitExactConfig,
            }[splitMode as "EQUAL" | "SHARES" | "EXACT"];

            return (
              <ConfigComponent
                form={form}
                step={step}
                isLastStep={isLastStep}
                onShowFooterChange={setShowFooter}
              />
            );
          }}
        </form.Subscribe>

        {/* Configuration footer */}
        <form.Subscribe
          selector={(state) => ({
            splitMode: state.values.splitMode,
          })}
        >
          {({ splitMode }) => {
            const FooterComponent = {
              EQUAL: SplitEqualFooter,
              SHARES: SplitShareFooter,
              EXACT: SplitExactFooter,
            }[splitMode as "EQUAL" | "SHARES" | "EXACT"];

            return showFooter ? (
              <FooterComponent form={form} step={step} isLastStep />
            ) : null;
          }}
        </form.Subscribe>
      </div>
    );
  },
});

export default SplitModeFormStep;
