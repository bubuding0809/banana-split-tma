import { useStartParams, withForm } from "@/hooks";
import { formOpts } from "./AddExpenseForm";
import { Modal, Chip, Text, Cell, Caption } from "@telegram-apps/telegram-ui";
import { trpc } from "@/utils/trpc";
import { themeParams, useSignal } from "@telegram-apps/sdk-react";
import FieldInfo from "@/components/ui/FieldInfo";
import ModalHeader from "@/components/ui/ModalHeader";
import {
  toDecimal,
  toNumber,
  sumDecimals,
  formatCurrencyWithCode,
} from "@/utils/financial";
import { cn } from "@utils/cn";

const SplitShareFooter = withForm({
  ...formOpts,
  props: {
    step: 2,
    isLastStep: true,
  },
  render: function Render({ form }) {
    const tSectionBgColor = useSignal(themeParams.sectionBackgroundColor);
    const tStartParams = useStartParams();
    const chatId = tStartParams?.chat_id ?? 0;

    const { data: chatMembers } = trpc.chat.getMembers.useQuery({ chatId });
    return (
      <footer
        className="fixed bottom-0 left-0 right-0 z-10"
        style={{
          backgroundColor: tSectionBgColor,
        }}
      >
        <Cell
          subtitle={
            <form.Subscribe
              selector={(state) => ({
                customSplits: state.values.customSplits,
              })}
            >
              {({ customSplits }) => {
                const shares = customSplits.reduce(
                  (acc, split) => acc + (Number(split.amount) || 0),
                  0
                );
                return (
                  <Caption>
                    {shares > 0 ? `Total shares: ${shares}` : "No shares added"}
                  </Caption>
                );
              }}
            </form.Subscribe>
          }
          after={
            <form.Subscribe
              selector={(state) => state.values.participants.length}
            >
              {(participantsCount) =>
                participantsCount > 0 && (
                  <form.AppField name="customSplits">
                    {(field) => (
                      <Modal
                        trigger={<Chip>Details</Chip>}
                        header={<ModalHeader>Split configuration</ModalHeader>}
                      >
                        <section className="px-4 pb-16 pt-1">
                          <form.Subscribe
                            selector={(state) => ({
                              participants: state.values.participants,
                              amount: state.values.amount,
                              payee: state.values.payee,
                              currency: state.values.currency,
                            })}
                          >
                            {(state) => (
                              <SplitConfigShares
                                participants={state.participants}
                                totalAmount={Number(state.amount) || 0}
                                chatMembers={chatMembers || []}
                                customSplits={field.state.value}
                                onSplitsChange={(splits) =>
                                  field.handleChange(splits)
                                }
                                payeeId={state.payee}
                                currency={state.currency}
                              />
                            )}
                          </form.Subscribe>
                        </section>

                        <div className="mt-4">
                          <FieldInfo />
                        </div>
                      </Modal>
                    )}
                  </form.AppField>
                )
              }
            </form.Subscribe>
          }
        >
          <Text weight="2">Split by shares</Text>
        </Cell>
      </footer>
    );
  },
});

interface SplitConfigProps {
  participants: string[];
  totalAmount: number;
  chatMembers: { id: bigint; firstName: string; lastName: string | null }[];
  customSplits?: { userId: string; amount: string }[];
  onSplitsChange?: (splits: { userId: string; amount: string }[]) => void;
  payeeId: string;
  currency: string;
}

const SplitConfigShares = ({
  participants,
  totalAmount,
  customSplits = [],
  currency,
}: SplitConfigProps) => {
  const getTotalShares = () => {
    const amounts = customSplits.map((split) => split.amount || "0");
    return toNumber(sumDecimals(amounts));
  };

  const getAmountPerShare = () => {
    const totalSharesDecimal = sumDecimals(
      customSplits.map((split) => split.amount || "0")
    );
    return totalSharesDecimal.greaterThan(0)
      ? toNumber(toDecimal(totalAmount).dividedBy(totalSharesDecimal))
      : 0;
  };

  const hasShares = getTotalShares() > 0;

  return (
    <div className="space-y-3">
      {/* Shares Visualization */}
      {hasShares && (
        <div className="mt-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Share Distribution</span>
            <span className="font-medium text-white">
              {getTotalShares()} total shares
            </span>
          </div>
          <div className="flex h-2 gap-1">
            {participants.map((participantId) => {
              const currentSplit = customSplits.find(
                (s) => s.userId === participantId
              );
              const sharesDecimal = toDecimal(currentSplit?.amount || "0");
              const totalSharesDecimal = sumDecimals(
                customSplits.map((split) => split.amount || "0")
              );
              const percentage = totalSharesDecimal.greaterThan(0)
                ? toNumber(sharesDecimal.dividedBy(totalSharesDecimal))
                : 0;
              const shares = toNumber(sharesDecimal);

              if (shares === 0) return null;

              return (
                <div
                  key={participantId}
                  className="h-full rounded-sm bg-blue-500"
                  style={{ width: `${percentage * 100}%` }}
                  title={`${shares} shares`}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Summary Card */}
      <div
        className={cn(
          "mt-4 rounded-xl border p-4",
          hasShares
            ? "border-blue-500/20 bg-blue-500/10"
            : "border-gray-500/20 bg-gray-500/10"
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded border-2",
                hasShares ? "border-blue-400 bg-blue-400" : "border-gray-400"
              )}
            >
              <span className="text-xs font-bold text-white">
                {hasShares ? getTotalShares() : "?"}
              </span>
            </div>
            <span
              className={cn(
                "font-medium",
                hasShares ? "text-blue-400" : "text-gray-400"
              )}
            >
              {hasShares
                ? `${formatCurrencyWithCode(getAmountPerShare(), currency)} per share`
                : "Set shares to calculate"}
            </span>
          </div>
          <div className="font-semibold text-white">
            {formatCurrencyWithCode(totalAmount, currency)} total
          </div>
        </div>
      </div>
    </div>
  );
};

export default SplitShareFooter;
