import { useStartParams, withForm } from "@/hooks";
import { formOpts } from "./AddExpenseForm";
import { ButtonCell, Cell, Radio, Section } from "@telegram-apps/telegram-ui";
import { trpc } from "@/utils/trpc";
import { hapticFeedback, initData, mainButton, useSignal } from "@telegram-apps/sdk-react";
import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";
import { useMemo, useState, useEffect } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { getRouteApi } from "@tanstack/react-router";

const routeApi = getRouteApi("/_tma/chat/$chatId_/add-expense");

const PayeeFormStep = withForm({
  ...formOpts,
  props: {
    step: 1,
    isLastStep: false,
  },
  render: function Render({ form, isLastStep, step }) {
    const navigate = routeApi.useNavigate();
    const tStartParams = useStartParams();
    const tUserData = useSignal(initData.user);

    const userId = tUserData?.id ?? 0;
    const chatId = tStartParams?.chat_id ?? 0;

    const { data: chatMembers } = trpc.chat.getMembers.useQuery({
      chatId,
    });

    const filteredMembers = useMemo(() => {
      return (
        chatMembers?.filter((member) => Number(member.id) !== userId) || []
      );
    }, [chatMembers, userId]);

    const [isExpanded, setIsExpanded] = useState(false);

    const getButtonText = () => {
      if (filteredMembers.length === 0) {
        return "You are all alone";
      }
      if (isExpanded) {
        return `Hide ${filteredMembers.length} members`;
      }
      return `Select from ${filteredMembers.length} members`;
    };

    // Configure main button click
    useEffect(() => {
      const offClick = mainButton.onClick.ifAvailable(() => {
        form.validateSync("change");
        form.setFieldMeta("payee", (prev) => ({ ...prev, isTouched: true }));

        if (form.state.fieldMeta.payee.errors.length) {
          return hapticFeedback.notificationOccurred("warning");
        }
        hapticFeedback.notificationOccurred("success");

        // Submit form if last step else navigate to next step
        if (isLastStep) {
          mainButton.setParams.ifAvailable({
            isLoaderVisible: true,
          });
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

    return (
      <div>
        <form.AppField name="payee">
          {(field) => (
            <section className="flex flex-col gap-2">
              <Section
                header={<Section.Header large>Who paid?</Section.Header>}
              >
                <Cell
                  Component="label"
                  key={userId}
                  before={<ChatMemberAvatar userId={userId} size={48} />}
                  subtitle="Yourself"
                  after={
                    <Radio
                      name="radio"
                      value={userId}
                      onBlur={field.handleBlur}
                      defaultChecked
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  }
                >
                  {tUserData?.firstName} {tUserData?.lastName}
                </Cell>
                <ButtonCell
                  before={isExpanded ? <ChevronUp /> : <ChevronDown />}
                  onClick={() => setIsExpanded((prev) => !prev)}
                  disabled={filteredMembers.length === 0}
                >
                  {getButtonText()}
                </ButtonCell>

                {isExpanded
                  ? filteredMembers.map((member) => (
                      <Cell
                        Component="label"
                        key={String(member.id)}
                        before={
                          <ChatMemberAvatar
                            userId={Number(member.id)}
                            size={48}
                          />
                        }
                        after={
                          <Radio
                            name="radio"
                            value={String(member.id)}
                            onBlur={field.handleBlur}
                            onChange={(e) => field.handleChange(e.target.value)}
                          />
                        }
                      >
                        {member.firstName} {member.lastName}
                      </Cell>
                    ))
                  : []}
              </Section>
            </section>
          )}
        </form.AppField>
      </div>
    );
  },
});
export default PayeeFormStep;
