import { useStartParams, withForm } from "@/hooks";
import { formOpts } from "./AddExpenseForm";
import { Section, Cell, Checkbox, Text } from "@telegram-apps/telegram-ui";
import { trpc } from "@/utils/trpc";
import {
  hapticFeedback,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";
import FieldInfo from "@/components/ui/FieldInfo";
import { toDecimal, formatCurrencyWithCode } from "@/utils/financial";
import { useStore } from "@tanstack/react-form";

const SplitEqualConfig = withForm({
  ...formOpts,
  props: {
    step: 2,
    isLastStep: true,
  },
  render: function Render({ form }) {
    const tStartParams = useStartParams();
    const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);

    const chatId = tStartParams?.chat_id ?? 0;
    const { currency } = useStore(form.store, (state) => ({
      currency: state.values.currency,
    }));

    const { data: chatMembers } = trpc.chat.getMembers.useQuery({ chatId });

    const payerData = chatMembers?.find(
      (member) => member.id === BigInt(form.state.values.payee)
    );

    return (
      <form.AppField name="participants">
        {(field) => (
          <section>
            <Section
              header={
                <div className="flex justify-between">
                  <Section.Header large>Who is involved?</Section.Header>
                  <Section.Header large>
                    <span
                      style={{
                        color: tSubtitleTextColor,
                      }}
                    >
                      @{payerData?.username} paid
                    </span>
                  </Section.Header>
                </div>
              }
              footer={
                <div className="mt-3">
                  <FieldInfo />
                </div>
              }
            >
              <Cell
                Component="label"
                after={
                  <Checkbox
                    name="select-all"
                    value="select-all"
                    checked={field.state.value.length === chatMembers?.length}
                    onChange={(e) => {
                      const isAllSelected = e.target.checked;
                      if (isAllSelected) {
                        const allParticipantIds =
                          chatMembers?.map((member) =>
                            Number(member.id).toString()
                          ) || [];
                        field.handleChange(allParticipantIds);
                      } else {
                        field.handleChange([]);
                      }
                      hapticFeedback.notificationOccurred("success");
                    }}
                  />
                }
              >
                <Text className="text-gray-400">Select all members</Text>
              </Cell>
              {chatMembers?.map((member) => {
                const memberId = Number(member.id).toString();
                const isSelected = field.state.value.includes(memberId);
                const splitAmount =
                  form.state.values.amount &&
                  toDecimal(form.state.values.amount)
                    .dividedBy(field.state.value.length || 1)
                    .toFixed(2);

                return (
                  <Cell
                    Component="label"
                    key={memberId}
                    subtitle={
                      isSelected
                        ? formatCurrencyWithCode(Number(splitAmount), currency)
                        : "Not selected"
                    }
                    before={
                      <ChatMemberAvatar userId={Number(memberId)} size={48} />
                    }
                    after={
                      <Checkbox
                        name="checkbox"
                        value={memberId}
                        onBlur={field.handleBlur}
                        checked={field.state.value.includes(memberId)}
                        onChange={(e) =>
                          field.handleChange((prev) => {
                            const currentParticipants = prev;
                            const isSelected = currentParticipants.includes(
                              e.target.value
                            );

                            if (isSelected) {
                              return currentParticipants.filter(
                                (p) => p !== memberId
                              );
                            } else {
                              return [...currentParticipants, memberId];
                            }
                          })
                        }
                      />
                    }
                  >
                    {member.username ? `@${member.username}` : member.firstName}
                  </Cell>
                );
              })}
            </Section>
          </section>
        )}
      </form.AppField>
    );
  },
});

export default SplitEqualConfig;
