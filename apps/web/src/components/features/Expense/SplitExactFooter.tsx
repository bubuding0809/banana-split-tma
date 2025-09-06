import { withForm } from "@/hooks";
import { formOpts } from "./AddExpenseForm";
import { Caption, Cell, Text, Info, Divider } from "@telegram-apps/telegram-ui";
import { themeParams, useSignal } from "@telegram-apps/sdk-react";
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

    return (
      <footer
        className="fixed bottom-0 left-0 right-0 z-10"
        style={{
          backgroundColor: tSectionBgColor,
        }}
      >
        <Divider />
        <Cell
          after={
            <form.Subscribe
              selector={(state) => ({
                participants: state.values.participants,
                customSplits: state.values.customSplits,
                amount: state.values.amount,
                currency: state.values.currency,
              })}
            >
              {({ participants, customSplits, amount, currency }) => {
                const totalExpense = toDecimal(amount || "0");
                const currentTotal = customSplits.reduce(
                  (acc, split) => acc.plus(toDecimal(split.amount)),
                  toDecimal(0)
                );

                const isBalanced = currentTotal.equals(totalExpense);
                const difference = totalExpense.minus(currentTotal);

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
              })}
            >
              {({ participants, customSplits, amount }) => {
                if (participants.length === 0) {
                  return <Caption>No participants selected</Caption>;
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
                      ? `${participants.length} participants`
                      : `${participants.length} participant`}{" "}
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
            })}
          >
            {({ participants, customSplits, amount }) => {
              if (participants.length === 0) {
                return <Text weight="2">Exact amounts</Text>;
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
