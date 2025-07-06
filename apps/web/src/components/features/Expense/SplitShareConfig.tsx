import { useStartParams, withForm } from "@/hooks";
import { formOpts } from "./AddExpenseForm";
import { Section, Cell, Badge, Text } from "@telegram-apps/telegram-ui";
import { trpc } from "@/utils/trpc";
import {
  hapticFeedback,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";
import FieldInfo from "@/components/ui/FieldInfo";
import { Plus, Minus } from "lucide-react";
import { cn } from "@utils/cn";
import { useStore } from "@tanstack/react-form";
import { useState } from "react";

const SplitShareConfig = withForm({
  ...formOpts,
  props: {
    step: 2,
    isLastStep: true,
  },
  render: function Render({ form }) {
    const tButtonColor = useSignal(themeParams.buttonColor);
    const tButtonTextColor = useSignal(themeParams.buttonTextColor);
    const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);
    const tDesctructiveTextColor = useSignal(themeParams.destructiveTextColor);
    const tStartParams = useStartParams();
    const chatId = tStartParams?.chat_id ?? 0;
    const { customSplits } = useStore(form.store, (state) => ({
      customSplits: state.values.customSplits,
    }));

    const { data: chatMembers } = trpc.chat.getMembers.useQuery({ chatId });

    const payerData = chatMembers?.find(
      (member) => member.id === BigInt(form.state.values.payee)
    );

    const [badgeAnimations, setBadgeAnimations] = useState<
      Record<string, "idle" | "pop" | "shake">
    >({});

    const triggerBadgeAnimation = (userId: string, type: "pop" | "shake") => {
      setBadgeAnimations((prev) => ({ ...prev, [userId]: type }));
      setTimeout(
        () => {
          setBadgeAnimations((prev) => ({ ...prev, [userId]: "idle" }));
        },
        type === "pop" ? 200 : 250
      );
    };

    return (
      <form.AppField name="customSplits">
        {(field) => {
          const handleSharesChange = (
            userId: string,
            shares: string,
            isIncrement?: boolean
          ) => {
            if (shares === "0") {
              form.setFieldValue("participants", (prev) => {
                return prev.filter((p) => p !== userId);
              });
            }

            if (shares === "1") {
              form.setFieldValue("participants", (prev) => {
                if (!prev.includes(userId)) {
                  return [...prev, userId];
                }
                return prev;
              });
            }

            const newSplits = [...customSplits];
            const existingIndex = newSplits.findIndex(
              (s) => s.userId === userId
            );

            if (existingIndex >= 0) {
              newSplits[existingIndex] = { userId, amount: shares };
            } else {
              newSplits.push({ userId, amount: shares });
            }

            field.handleChange(newSplits);

            // Trigger animation if shares > 0
            if (shares !== "0" && isIncrement !== undefined) {
              triggerBadgeAnimation(userId, isIncrement ? "pop" : "shake");
            }
          };
          return (
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
              >
                {chatMembers?.map((member) => {
                  const memberId = Number(member.id).toString();

                  const shares =
                    customSplits.find((s) => s.userId === memberId)?.amount ||
                    "0";
                  return (
                    <Cell
                      key={memberId}
                      subtitle={`${member?.firstName} ${member?.lastName || ""}`}
                      before={
                        <div className="relative">
                          <div
                            className={cn(
                              "absolute -right-3 -top-1 z-10",
                              shares === "0" ? "invisible" : "",
                              badgeAnimations[memberId] === "pop" &&
                                "animate-badge-pop",
                              badgeAnimations[memberId] === "shake" &&
                                "animate-badge-shake"
                            )}
                          >
                            <Badge type="number">{shares}</Badge>
                          </div>
                          <ChatMemberAvatar
                            userId={Number(memberId)}
                            size={48}
                          />
                        </div>
                      }
                      after={
                        <div className="flex items-center gap-1">
                          <button
                            style={{
                              backgroundColor: tDesctructiveTextColor,
                              color: tButtonTextColor,
                            }}
                            className={cn(
                              "flex h-8 w-10 items-center justify-center rounded-lg p-1 transition-[width] duration-200",
                              shares === "0" ? "invisible w-0" : "w-10"
                            )}
                            onClick={() => {
                              if (shares === "0") return;
                              hapticFeedback.impactOccurred("medium");
                              handleSharesChange(
                                memberId,
                                (Number(shares) - 1).toString(),
                                false
                              );
                            }}
                          >
                            <Minus size={22} strokeWidth={3} />
                          </button>
                          <button
                            style={{
                              backgroundColor: tButtonColor,
                              color: tButtonTextColor,
                            }}
                            className={cn(
                              "flex h-8 items-center justify-center rounded-lg p-1 transition-[width] duration-200",
                              shares === "0" ? "w-20" : "w-10"
                            )}
                            onClick={() => {
                              hapticFeedback.impactOccurred("medium");
                              handleSharesChange(
                                memberId,
                                (Number(shares) + 1).toString(),
                                true
                              );
                            }}
                          >
                            {shares === "0" ? (
                              <Text weight="2">Add</Text>
                            ) : (
                              <Plus size={22} strokeWidth={3} />
                            )}
                          </button>
                        </div>
                      }
                    >
                      @{member?.username || "Unknown"}{" "}
                    </Cell>
                  );
                })}
              </Section>
              <form.AppField name="participants">
                {() => (
                  <div className="mt-3">
                    <FieldInfo />
                  </div>
                )}
              </form.AppField>
            </section>
          );
        }}
      </form.AppField>
    );
  },
});

export default SplitShareConfig;
