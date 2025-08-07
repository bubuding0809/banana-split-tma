import { withForm } from "@/hooks";
import { formOpts } from "./AddExpenseForm";
import { Caption, Cell, Text, Info } from "@telegram-apps/telegram-ui";
import { themeParams, useSignal } from "@telegram-apps/sdk-react";
import { toDecimal, toNumber, formatCurrencyWithCode } from "@/utils/financial";

const SplitEqualFooter = withForm({
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
        <Cell
          after={
            <form.Subscribe
              selector={(state) => ({
                participants: state.values.participants,
                amount: state.values.amount,
                currency: state.values.currency,
              })}
            >
              {({ participants, amount, currency }) => {
                const splitAmount = toDecimal(amount || "0").dividedBy(
                  participants.length || 1
                );

                if (participants.length === 0) {
                  return null;
                }
                return (
                  <Info type="text" subtitle="each">
                    {formatCurrencyWithCode(toNumber(splitAmount), currency)}
                  </Info>
                );
              }}
            </form.Subscribe>
          }
          subtitle={
            <form.Subscribe
              selector={(state) => ({
                participants: state.values.participants,
              })}
            >
              {({ participants }) =>
                participants.length > 0 ? (
                  <Caption>
                    {participants.length > 1
                      ? `${participants.length} members selected`
                      : `${participants.length} member selected`}
                  </Caption>
                ) : (
                  <Caption>No participants selected</Caption>
                )
              }
            </form.Subscribe>
          }
        >
          <Text weight="2">Split equally</Text>
        </Cell>
      </footer>
    );
  },
});

export default SplitEqualFooter;
