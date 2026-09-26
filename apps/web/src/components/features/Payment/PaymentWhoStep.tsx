import { hapticFeedback, initData, useSignal } from "@telegram-apps/sdk-react";
import {
  Cell,
  Radio,
  Section,
  SegmentedControl,
} from "@telegram-apps/telegram-ui";
import { useStore } from "@tanstack/react-form";

import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";
import { withForm } from "@/hooks";
import { trpc } from "@/utils/trpc";
import { formatCurrencyWithCode } from "@/utils/financial";
import { paymentFormOpts } from "./RecordPaymentForm";
import { balanceWith } from "./recordPayment";

const PaymentWhoStep = withForm({
  ...paymentFormOpts,
  props: { chatId: 0 },
  render: function Render({ form, chatId }) {
    const tUserData = useSignal(initData.user);
    const userId = tUserData?.id ?? 0;
    const direction = useStore(form.store, (s) => s.values.direction);
    const currency = useStore(form.store, (s) => s.values.currency);

    const { data: members } = trpc.chat.getMembers.useQuery({ chatId });
    const { data: debtors } = trpc.chat.getDebtorsMultiCurrency.useQuery({
      chatId,
      userId,
    });
    const { data: creditors } = trpc.chat.getCreditorsMultiCurrency.useQuery({
      chatId,
      userId,
    });

    const others = (members ?? []).filter((m) => Number(m.id) !== userId);

    const subtitle = (memberId: number) => {
      const b = balanceWith(memberId, currency, debtors, creditors);
      if (b.kind === "you_owe")
        return (
          <span className="text-red-500">
            you owe {formatCurrencyWithCode(b.amount, currency)}
          </span>
        );
      if (b.kind === "owes_you")
        return (
          <span className="text-green-500">
            owes you {formatCurrencyWithCode(b.amount, currency)}
          </span>
        );
      return <span className="text-gray-500">settled up</span>;
    };

    return (
      <div className="flex flex-col gap-3">
        <form.AppField name="direction">
          {(field) => (
            <SegmentedControl>
              <SegmentedControl.Item
                selected={field.state.value === "paid"}
                onClick={() => {
                  hapticFeedback.selectionChanged();
                  field.handleChange("paid");
                }}
              >
                I paid
              </SegmentedControl.Item>
              <SegmentedControl.Item
                selected={field.state.value === "received"}
                onClick={() => {
                  hapticFeedback.selectionChanged();
                  field.handleChange("received");
                }}
              >
                I received
              </SegmentedControl.Item>
            </SegmentedControl>
          )}
        </form.AppField>

        <form.AppField name="counterpartyId">
          {(field) => (
            <Section
              header={
                <Section.Header large>
                  {direction === "paid" ? "Paid to?" : "Received from?"}
                </Section.Header>
              }
            >
              {others.map((m) => (
                <Cell
                  Component="label"
                  key={String(m.id)}
                  before={<ChatMemberAvatar userId={Number(m.id)} size={48} />}
                  subtitle={subtitle(Number(m.id))}
                  after={
                    <Radio
                      name="counterparty"
                      value={String(m.id)}
                      checked={field.state.value === String(m.id)}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  }
                >
                  {`${m.firstName} ${m.lastName ?? ""}`.trim()}
                </Cell>
              ))}
            </Section>
          )}
        </form.AppField>
      </div>
    );
  },
});

export default PaymentWhoStep;
