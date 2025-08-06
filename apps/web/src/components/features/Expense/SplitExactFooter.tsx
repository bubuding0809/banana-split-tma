import { withForm } from "@/hooks";
import { formOpts } from "./AddExpenseForm";
import {
  Caption,
  Cell,
  Text,
  Info,
  Navigation,
} from "@telegram-apps/telegram-ui";
import {
  hapticFeedback,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import { toDecimal, toNumber, formatCurrencyWithCode } from "@/utils/financial";
import { cn } from "@utils/cn";

const SplitExactFooter = withForm({
  ...formOpts,
  props: {
    step: 2,
    isLastStep: true,
  },
  render: function Render({ form }) {
    const tSectionBgColor = useSignal(themeParams.sectionBackgroundColor);

    const navigateToAmounts = () => {
      const currentSplitMode = form.state.values.splitMode;
      const currentExactStage = form.state.values.exactSplitStage;

      // Handle exact split stage transition
      if (currentSplitMode === "EXACT" && currentExactStage === "selection") {
        const participants = form.state.values.participants;
        if (participants.length > 0) {
          form.setFieldValue("exactSplitStage", "inputs");
          hapticFeedback.notificationOccurred("success");
          return;
        } else {
          hapticFeedback.notificationOccurred("warning");
          return;
        }
      }
    };

    return (
      <footer
        className="fixed bottom-0 left-0 right-0 z-10"
        style={{
          backgroundColor: tSectionBgColor,
        }}
      >
        <Cell
          onClick={navigateToAmounts}
          after={
            <form.Subscribe
              selector={(state) => ({
                participants: state.values.participants,
                customSplits: state.values.customSplits,
                amount: state.values.amount,
                currency: state.values.currency,
                exactSplitStage: state.values.exactSplitStage,
              })}
            >
              {({
                participants,
                customSplits,
                amount,
                currency,
                exactSplitStage,
              }) => {
                const totalExpense = toDecimal(amount || "0");
                const currentTotal = customSplits.reduce(
                  (acc, split) => acc.plus(toDecimal(split.amount)),
                  toDecimal(0)
                );

                const isBalanced = currentTotal.equals(totalExpense);
                const difference = totalExpense.minus(currentTotal);

                // Different displays for different stages
                if (exactSplitStage === "selection") {
                  if (participants.length === 0) {
                    return null;
                  }
                  return <Navigation>Amounts</Navigation>;
                }

                // Input stage - show balance information
                if (participants.length === 0) {
                  return null;
                }

                return (
                  <div className="flex flex-col items-end">
                    <Info
                      type="text"
                      subtitle={
                        isBalanced
                          ? "balanced"
                          : difference.greaterThan(0)
                            ? "remaining"
                            : "excess"
                      }
                      className={cn(
                        isBalanced && "text-green-500",
                        !isBalanced && "text-orange-500"
                      )}
                    >
                      {isBalanced
                        ? formatCurrencyWithCode(
                            toNumber(currentTotal),
                            currency
                          )
                        : formatCurrencyWithCode(
                            toNumber(difference.abs()),
                            currency
                          )}
                    </Info>
                  </div>
                );
              }}
            </form.Subscribe>
          }
          subtitle={
            <form.Subscribe
              selector={(state) => ({
                participants: state.values.participants,
                customSplits: state.values.customSplits,
                amount: state.values.amount,
                exactSplitStage: state.values.exactSplitStage,
              })}
            >
              {({ participants, customSplits, amount, exactSplitStage }) => {
                if (participants.length === 0) {
                  return <Caption>No members selected</Caption>;
                }

                if (exactSplitStage === "selection") {
                  return (
                    <Caption>
                      {participants.length > 1
                        ? `${participants.length} members selected`
                        : `${participants.length} member selected`}
                    </Caption>
                  );
                }

                // Input stage
                const totalExpense = toDecimal(amount || "0");
                const currentTotal = customSplits.reduce(
                  (acc, split) => acc.plus(toDecimal(split.amount)),
                  toDecimal(0)
                );
                const isBalanced = currentTotal.equals(totalExpense);

                return (
                  <Caption
                    className={cn(
                      isBalanced && "text-green-500",
                      !isBalanced && "text-orange-500"
                    )}
                  >
                    {customSplits.length}/
                    {participants.length > 1
                      ? `${participants.length} members`
                      : `${participants.length} member`}{" "}
                    ready
                  </Caption>
                );
              }}
            </form.Subscribe>
          }
        >
          <form.Subscribe
            selector={(state) => ({
              participants: state.values.participants,
              customSplits: state.values.customSplits,
              amount: state.values.amount,
              exactSplitStage: state.values.exactSplitStage,
            })}
          >
            {({ participants, customSplits, amount, exactSplitStage }) => {
              if (participants.length === 0) {
                return <Text weight="2">Select members first</Text>;
              }

              if (exactSplitStage === "selection") {
                return (
                  <Text weight="2" className="text-blue-500">
                    Continue to enter amounts
                  </Text>
                );
              }

              // Input stage
              const totalExpense = toDecimal(amount || "0");
              const currentTotal = customSplits.reduce(
                (acc, split) => acc.plus(toDecimal(split.amount)),
                toDecimal(0)
              );
              const isBalanced = currentTotal.equals(totalExpense);

              return (
                <Text
                  weight="2"
                  className={cn(
                    isBalanced && "text-green-500",
                    !isBalanced && "text-orange-500"
                  )}
                >
                  {isBalanced ? "Amounts balanced" : "Enter exact amounts"}
                </Text>
              );
            }}
          </form.Subscribe>
        </Cell>
      </footer>
    );
  },
});

export default SplitExactFooter;
