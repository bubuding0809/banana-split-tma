import { hapticFeedback, initData, useSignal } from "@telegram-apps/sdk-react";
import {
  Cell,
  Radio,
  Section,
  SegmentedControl,
} from "@telegram-apps/telegram-ui";
import { useStore } from "@tanstack/react-form";
import { useEffect } from "react";

import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";
import { withForm } from "@/hooks";
import { trpc } from "@/utils/trpc";
import { paymentFormOpts } from "./RecordPaymentForm";
import { soleCounterpartyId } from "./recordPayment";

const PaymentWhoStep = withForm({
  ...paymentFormOpts,
  props: { chatId: 0 },
  render: function Render({ form, chatId }) {
    const tUserData = useSignal(initData.user);
    const userId = tUserData?.id ?? 0;
    const direction = useStore(form.store, (s) => s.values.direction);

    const { data: members } = trpc.chat.getMembers.useQuery({ chatId });
    const others = (members ?? []).filter((m) => Number(m.id) !== userId);

    // Pre-select the only other member; leave larger groups blank.
    useEffect(() => {
      if (form.getFieldValue("counterpartyId")) return;
      const sole = soleCounterpartyId(members, userId);
      if (sole) form.setFieldValue("counterpartyId", sole);
    }, [form, members, userId]);

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
                  subtitle={`${m.firstName} ${m.lastName ?? ""}`.trim()}
                  after={
                    <Radio
                      name="counterparty"
                      value={String(m.id)}
                      checked={field.state.value === String(m.id)}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  }
                >
                  {m.username ? `@${m.username}` : "No username"}
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
